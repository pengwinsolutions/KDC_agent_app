/** Business rules from the agent flow spec, kept free of UI so they can be tested. */
import type { Booking, BookingStatus, Delivery, DeliveryStatus, FailureReason, LabSample, OtherPatient } from './types';

/* ------------------------------------------------------------- Status */

/** "On My Way" -> ONMYWAY: upper-case, spaces and hyphens removed. */
export function normaliseStatus(s: string | undefined | null): BookingStatus | string {
  return String(s ?? '').toUpperCase().replace(/[\s_-]/g, '');
}

export type StatusTone = 'caution' | 'brand' | 'purple' | 'success' | 'paid' | 'critical' | 'neutral';

export const STATUS_META: Record<string, { label: string; tone: StatusTone; slide?: string }> = {
  ACCEPTED: { label: 'Accepted', tone: 'caution', slide: 'Slide to start trip' },
  ONMYWAY: { label: 'On the way', tone: 'brand', slide: 'Slide to collect samples' },
  ONGOING: { label: 'In progress', tone: 'purple', slide: 'Slide to continue test' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  PAID: { label: 'Paid', tone: 'paid' },
  REJECTED: { label: 'Rejected', tone: 'critical' },
};

export function statusMeta(s: string) {
  return STATUS_META[normaliseStatus(s)] ?? { label: String(s || 'Unknown'), tone: 'neutral' as StatusTone };
}

/** The only order the server accepts. */
export const STATUS_ORDER: BookingStatus[] = ['ACCEPTED', 'ONMYWAY', 'ONGOING', 'COMPLETED', 'PAID'];

export function canMoveTo(from: string, to: BookingStatus): boolean {
  const f = normaliseStatus(from) as BookingStatus;
  if (to === 'REJECTED') return f === 'ACCEPTED';
  if (f === to) return true; // re-sending the current status is a harmless no-op
  const i = STATUS_ORDER.indexOf(f);
  const j = STATUS_ORDER.indexOf(to);
  return i >= 0 && j === i + 1;
}

export const isClosed = (s: string) => ['COMPLETED', 'PAID', 'REJECTED'].includes(normaliseStatus(s));

/* ---------------------------------------------------------- Date & time */

const TIME_FIELDS = ['booking_time', 'slot_time', 'time_slot', 'slot', 'appointment_time', 'collection_time'] as const;

/** "HH:MM[:SS]" or "h:mm AM" -> "h:mm AM". Midnight counts as missing. */
function to12h(raw: string): string | null {
  const t = raw.trim();
  const ampm = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/.exec(t);
  if (ampm) return `${Number(ampm[1])}:${ampm[2]} ${ampm[3].toUpperCase()}`;
  const m = /(\d{1,2}):(\d{2})(?::\d{2})?/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2];
  if (h === 0 && min === '00') return null;
  return `${h % 12 === 0 ? 12 : h % 12}:${min} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The appointment time, looked up across the field names the backend uses; "—" when none. */
export function resolveTime(b: Partial<Booking>): string {
  for (const f of TIME_FIELDS) {
    const v = (b as any)[f];
    if (typeof v === 'string' && v.trim()) {
      const t = to12h(v);
      if (t) return t;
    }
  }
  const d = b.booking_date ?? '';
  const part = d.includes(' ') ? d.split(' ')[1] : d.includes('T') ? d.split('T')[1] : '';
  return (part && to12h(part)) || '—';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** "Wed, 11 Nov 2026". */
export function formatDate(s: string | undefined): string {
  const d = parseDate(s);
  if (!d) return '—';
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Age in whole years from "YYYY-MM-DD". */
export function ageFromDob(dob: string | undefined, today = new Date()): number | null {
  const d = parseDate(dob);
  if (!d) return null;
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age;
}

/** Add Patient: age in years -> date of birth = today minus age (YYYY-MM-DD). */
export function dobFromAge(age: number, today = new Date()): string {
  const y = today.getFullYear() - age;
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/** just now, 5m, 3h, 2d, 1w, 1mo, 1y */
export function relativeTime(iso: string, now = new Date()): string {
  const t = new Date(iso.replace(' ', 'T')).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, (now.getTime() - t) / 1000);
  if (s < 60) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h`;
  const d = h / 24;
  if (d < 7) return `${Math.floor(d)}d`;
  if (d < 30) return `${Math.floor(d / 7)}w`;
  if (d < 365) return `${Math.floor(d / 30)}mo`;
  return `${Math.floor(d / 365)}y`;
}

/* ------------------------------------------------------------- Money */

/** ₹1,499 in the Indian grouping (en-IN), whole rupees unless paise present. */
export function rupee(n: number | undefined | null): string {
  const v = Number(n ?? 0);
  const neg = v < 0;
  const abs = Math.abs(v);
  const [int, frac] = abs.toFixed(abs % 1 ? 2 : 0).split('.');
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${neg ? '−' : ''}₹${rest ? `${rest},${last3}` : last3}${frac ? `.${frac}` : ''}`;
}

/* ------------------------------------------------------------ Patients */

export const patientCount = (b: Pick<Booking, 'others' | 'self_flag'>) => (b.others?.length ?? 0) + (b.self_flag === 1 ? 1 : 0);

export interface PatientRef {
  /** Local key: user-primary or other-<id>. */
  key: string;
  name: string;
  dob: string;
  gender: string;
  mobile?: string;
  samples: { sample_id: string; color: string }[];
  otherId?: number;
  addedByAgent?: boolean;
}

/** Primary user first (when they are a patient), then everyone in `others`. */
export function patientsOf(b: Booking): PatientRef[] {
  const list: PatientRef[] = [];
  if (b.self_flag === 1) {
    list.push({ key: 'user-primary', name: b.user.name, dob: b.user.dob, gender: b.user.gender, samples: b.user.samples ?? [] });
  }
  for (const o of b.others ?? []) list.push(otherRef(o));
  return list;
}

function otherRef(o: OtherPatient): PatientRef {
  return {
    key: `other-${o.id}`,
    name: o.full_name,
    dob: o.dob,
    gender: o.gender,
    mobile: o.patient_mobile,
    samples: o.samples ?? [],
    otherId: o.id,
    addedByAgent: o.added_by_agent === 1,
  };
}

export const isPatientDone = (p: PatientRef, justCollected?: Set<string>) =>
  p.samples.some((s) => String(s.sample_id ?? '').trim() !== '') || Boolean(justCollected?.has(p.key));

/* ----------------------------------------------------------- Cash due */

/** pending = cash_due > 0 AND cash_due_collected != 1 */
export const cashDuePending = (b: Pick<Booking, 'cash_due' | 'cash_due_collected'> | null | undefined) =>
  Boolean(b && Number(b.cash_due) > 0 && Number(b.cash_due_collected) !== 1);

export type ProceedCase = 'cash' | 'cash_due' | 'complete';

/** The Proceed decision table (spec 4.5). */
export function proceedCase(b: Booking, dueCleared = false): ProceedCase {
  if (String(b.payment_type).toUpperCase() === 'CASH') return 'cash';
  if (cashDuePending(b) && !dueCleared) return 'cash_due';
  return 'complete';
}

/* -------------------------------------------------------------- Tubes */

const TUBE_COLOURS: [RegExp, string][] = [
  [/lavender|edta/, '#9B59B6'],
  [/purple/, '#7C3AED'],
  [/yellow|serum/, '#EAB308'],
  [/gold/, '#D97706'],
  [/red/, '#DC2626'],
  [/green/, '#16A34A'],
  [/pink/, '#EC4899'],
  [/blue/, '#2563EB'],
  [/orange/, '#EA580C'],
  [/gr[ae]y|black/, '#6B7280'],
  [/white/, '#9CA3AF'],
];

/** Tube colour by name, or a hex passed through. */
export function tubeColour(name: string | undefined): string {
  const n = String(name ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{3,8}$/.test(n)) return n;
  for (const [re, hex] of TUBE_COLOURS) if (re.test(n)) return hex;
  return '#94A3B8';
}

export interface TubeSlot {
  key: string;
  color: string;
  name: string;
  code?: string;
  colourName: string;
}

/** Tube slots for a booking, plus Urine when any plan test needs it (spec 4.7). */
export function tubeSlots(b: Booking, passed?: LabSample[]): TubeSlot[] {
  const source = passed?.length ? passed : b.lab_samples ?? [];
  const slots: TubeSlot[] = source.map((s) => ({
    key: `tube-${s.id}`,
    color: s.sample_color,
    name: s.sample_name,
    code: s.sample_code,
    colourName: s.sample_color.charAt(0).toUpperCase() + s.sample_color.slice(1),
  }));
  if (!slots.length) {
    const legacy = b.plan?.plan_tests?.flatMap((t) => t.tests_colors ?? []) ?? [];
    [...new Set(legacy)].forEach((hex, i) => slots.push({ key: `legacy-${i}`, color: hex, name: `Tube ${i + 1}`, colourName: hex }));
  }
  if (b.plan?.plan_tests?.some((t) => t.urine_sample_flag === 1)) {
    slots.push({ key: 'urine', color: 'urine', name: 'Urine', code: 'URN', colourName: 'Sterile container' });
  }
  return slots;
}

export const testCount = (b: Booking) => b.plan?.plan_tests?.length ?? 0;

/* ---------------------------------------------------------------- UPI */

export interface UpiData {
  kind: 'image' | 'intent';
  /** Image URI when kind is image; upi://pay?... when intent. */
  value: string;
  payee: string;
  amount?: number;
}

/** upi://pay?pa=<vpa>&pn=<name>&cu=INR&am=<amount>&tn=<note> */
export function buildUpiIntent(vpa: string, name: string, amount?: number, note?: string) {
  const q = [`pa=${encodeURIComponent(vpa)}`, `pn=${encodeURIComponent(name)}`, 'cu=INR'];
  if (amount !== undefined) q.push(`am=${Number(amount).toFixed(2)}`);
  if (note) q.push(`tn=${encodeURIComponent(note)}`);
  return `upi://pay?${q.join('&')}`;
}

/** Accepts any of the payment-QR shapes the server returns (spec 5.3). */
export function normaliseQr(data: any, amount?: number, note?: string): UpiData | null {
  const payeeDefault = 'KDC+ Healthcare';
  if (!data) return null;
  if (typeof data === 'string') return stringShape(data, payeeDefault, amount);
  const img = data.qr_image ?? data.qr ?? data.image ?? data.qr_code;
  if (typeof img === 'string' && img) return stringShape(img, data.payee_name ?? payeeDefault, amount ?? data.amount);
  const intent = data.upi_url ?? data.upi_string ?? data.intent;
  if (typeof intent === 'string' && intent.startsWith('upi://')) {
    return { kind: 'intent', value: intent, payee: data.payee_name ?? payeeDefault, amount: amount ?? data.amount };
  }
  const vpa = data.upi_id ?? data.vpa;
  if (vpa) {
    const payee = data.payee_name ?? payeeDefault;
    const am = amount ?? (data.amount !== undefined ? Number(data.amount) : undefined);
    return { kind: 'intent', value: buildUpiIntent(vpa, payee, am, note ?? data.note), payee, amount: am };
  }
  return null;
}

function stringShape(s: string, payee: string, amount?: number): UpiData {
  if (s.startsWith('upi://')) return { kind: 'intent', value: s, payee, amount };
  if (/^(https?:|data:)/.test(s)) return { kind: 'image', value: s, payee, amount };
  if (s.startsWith('/')) return { kind: 'image', value: `https://kdcplus.in${s}`, payee, amount };
  return { kind: 'image', value: `data:image/png;base64,${s}`, payee, amount };
}

/* -------------------------------------------------------------- Lists */

/** Digs the first array out of a list response (bare, data.data, notifications, items...). */
export function extractList<T = any>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const k of ['data', 'notifications', 'items', 'transactions', 'results', 'list']) {
    const v = data[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const inner = extractList<T>(v);
      if (inner.length) return inner;
    }
  }
  return [];
}

/** "Has more pages" from next_page_url, last_page/current_page, or a full page. */
export function hasMorePages(data: any, received: number, pageSize: number): boolean {
  if (data && typeof data === 'object') {
    if ('next_page_url' in data) return Boolean(data.next_page_url);
    if ('last_page' in data && 'current_page' in data) return Number(data.current_page) < Number(data.last_page);
  }
  return received >= pageSize;
}

/** Address on one line. */
export const addressLine = (b: Pick<Booking, 'dno' | 'street' | 'city' | 'pincode'>) =>
  [b.dno, b.street, b.city, b.pincode].filter(Boolean).join(', ');

/* ---------------------------------------------------------- Deliveries */

export const DELIVERY_META: Record<DeliveryStatus, { label: string; tone: StatusTone }> = {
  ASSIGNED: { label: 'Out for delivery', tone: 'caution' },
  PICKED_UP: { label: 'Picked up', tone: 'brand' },
  FAILED: { label: 'Failed', tone: 'critical' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  RETURNED: { label: 'Returned', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  REASSIGNED: { label: 'Reassigned', tone: 'neutral' },
};
export const deliveryMeta = (s: string) => DELIVERY_META[s as DeliveryStatus] ?? { label: String(s || 'Unknown'), tone: 'neutral' as StatusTone };

/** Why a delivery failed, in the order the agent sees them (the server's reasons). */
export const FAILURE_REASONS: { id: FailureReason; label: string }[] = [
  { id: 'not_home', label: 'Patient not at home' },
  { id: 'refused', label: 'Patient refused the order' },
  { id: 'wrong_address', label: 'Wrong or incomplete address' },
  { id: 'unreachable', label: 'Patient unreachable' },
  { id: 'other', label: 'Other' },
];

/** A failure needs a note of 3–255 characters for "Other" (and whenever one is given). Null: fine. */
export function failureProblem(reason: FailureReason | null, note: string): string | null {
  if (!reason) return 'Choose why you couldn’t deliver.';
  const n = note.trim();
  if (reason === 'other' && !n) return 'Add a short note for “Other”.';
  if (n && (n.length < 3 || n.length > 255)) return 'The note needs 3–255 characters.';
  return null;
}

export const pickupLine = (d: Pick<Delivery, 'pickup'>) => (d.pickup ? [d.pickup.line, d.pickup.locality, d.pickup.city, d.pickup.pincode].filter(Boolean).join(', ') : '');
export const dropLine = (d: Pick<Delivery, 'drop'>) => [d.drop.line, d.drop.area, d.drop.city, d.drop.pincode].filter(Boolean).join(', ');
export const itemsText = (d: Pick<Delivery, 'items'>) => `${d.items.units} ${d.items.units === 1 ? 'item' : 'items'}`;
/** Cash to collect at the door, or null for a prepaid (or already paid) order. */
export const codDue = (d: Pick<Delivery, 'payment'>) => (d.payment.method === 'cod' && d.payment.collect > 0 ? d.payment.collect : null);
/** "Attempt 1 of 3". */
export const attemptText = (d: Pick<Delivery, 'attempts'>) => `Attempt ${d.attempts.current ?? d.attempts.count} of ${d.attempts.max}`;
