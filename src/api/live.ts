/**
 * The agent app on the KDC+ backend: the same functions as the spec's endpoints
 * (endpoints.ts), answered in the app's envelope and shapes, so screens don't change.
 *
 * Differences from the spec's backend, by design:
 * - The agent never receives the patient's collection code (`agent_otp` is empty):
 *   the patient reads it out and the agent types it in.
 * - UPI is a single-use QR per booking; the payment counts once the bank confirms it.
 * - There's no server-bridged calling: the app dials the collection contact, and
 *   the attempt is logged.
 */
import { Platform } from 'react-native';
import type { AgentNotification, AgentProfile, Booking, BookingStatus, Envelope, LabSample, OtherPatient, Sample } from '../domain/types';
import { useSession } from '../store/session';
import { adoptSession, liveRequest } from './client';

// Read at build time by Metro.
const APP_VERSION: string = require('../../package.json').version;

/* ---------------------------------------------------------------- Shapes */

interface ApiPerson {
  id: number;
  name: string;
  gender: string | null;
  age: number | null;
  addedByAgent: boolean;
  tests: string[];
  requiredTubes: string[];
  samples: { tube: string; barcode: string }[];
}

export interface ApiBooking {
  code: string;
  status: string;
  appStatus: BookingStatus | null;
  slot: { date: string; window: string; startsAt: string };
  lab: { code: string; name: string } | null;
  address: { line: string; area: string; city: string | null; pincode: string; lat: number | null; lng: number | null } | null;
  contactPhone: string | null;
  people: ApiPerson[];
  paymentType: 'cash' | 'online';
  paymentStatus: string;
  amount: number;
  perPatientPrice: number;
  cashDue: number;
  cashDueCollected: boolean;
  codeLocked: boolean;
}

const PREFIX = 'KDC-DX-';

/** The app addresses bookings by a number too; it's the code's suffix read as base 36 (reversible, no table). */
export const idOf = (code: string) => parseInt(code.slice(PREFIX.length), 36);
export const codeOf = (id: number | string) => (typeof id === 'string' && id.startsWith(PREFIX) ? id : `${PREFIX}${Number(id).toString(36).toUpperCase().padStart(8, '0')}`);

/** Tube types (backend) ↔ the colours the app shows. */
const TUBES: Record<string, { color: string; name: string }> = {
  EDTA: { color: 'lavender', name: 'EDTA (CBC, HbA1c)' },
  SST: { color: 'yellow', name: 'Serum separator' },
  FLU: { color: 'grey', name: 'Fluoride (glucose)' },
  CIT: { color: 'blue', name: 'Sodium citrate' },
  URN: { color: 'urine', name: 'Urine' },
};
export function tubeOf(color: string): string | null {
  const c = color.trim().toLowerCase();
  const hit = Object.entries(TUBES).find(([code, t]) => t.color === c || code.toLowerCase() === c);
  return hit ? hit[0] : null;
}

const title = (g: string | null) => (g ? g.charAt(0).toUpperCase() + g.slice(1) : '');
/** The backend keeps an age; the app shows one from a date of birth: today, that many years ago. */
function dobFromAge(age: number | null): string {
  if (age === null) return '';
  const d = new Date();
  return `${d.getFullYear() - age}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function ageFromDob(dob: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (!m) return 0;
  const now = new Date();
  let age = now.getFullYear() - Number(m[1]);
  if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) age--;
  return Math.max(0, Math.min(120, age));
}
const samplesOf = (p: ApiPerson): Sample[] => p.samples.map((s) => ({ sample_id: s.barcode, color: TUBES[s.tube]?.color ?? s.tube.toLowerCase() }));

export function toBooking(b: ApiBooking): Booking {
  const [first, ...rest] = b.people;
  const tests = [...new Set(b.people.flatMap((p) => p.tests))];
  const tubes = [...new Set(b.people.flatMap((p) => p.requiredTubes))];
  const urine = tubes.includes('URN');
  const labSamples: LabSample[] = tubes
    .filter((t) => t !== 'URN')
    .map((t, i) => ({ id: i + 1, sample_color: TUBES[t]?.color ?? t.toLowerCase(), sample_code: t, sample_name: TUBES[t]?.name ?? t, lab_name: b.lab?.name ?? '', lab_code: b.lab?.code ?? '' }));
  const others: OtherPatient[] = rest.map((p) => ({ id: p.id, full_name: p.name, dob: dobFromAge(p.age), gender: title(p.gender), samples: samplesOf(p), added_by_agent: p.addedByAgent ? 1 : 0 }));
  return {
    id: idOf(b.code),
    booking_id: b.code,
    booking_status: b.appStatus ?? (b.status === 'cancelled' ? 'REJECTED' : 'COMPLETED'),
    booking_date: b.slot.date,
    booking_time: b.slot.window.slice(0, 5),
    slot: b.slot.window,
    plan_name: tests.length > 1 ? `${tests[0]} + ${tests.length - 1} more` : (tests[0] ?? 'Lab tests'),
    plan: {
      id: 0,
      plan_name: tests.join(', '),
      plan_tests: tests.map((name, i) => ({ id: i + 1, name, tests_names: [name], ...(urine && i === 0 ? { urine_sample_flag: 1 as const } : {}) })),
    },
    self_flag: first ? 1 : 0,
    user: {
      name: first?.name ?? '',
      mobile: b.contactPhone ?? '',
      dob: dobFromAge(first?.age ?? null),
      gender: title(first?.gender ?? null),
      latitude: b.address?.lat ?? undefined,
      longitude: b.address?.lng ?? undefined,
      samples: first ? samplesOf(first) : [],
    },
    others,
    dno: b.address?.line ?? '',
    street: b.address?.area ?? '',
    city: b.address?.city ?? '',
    pincode: b.address?.pincode ?? '',
    latitude: b.address?.lat ?? undefined,
    longitude: b.address?.lng ?? undefined,
    payment_type: b.paymentType === 'cash' ? 'CASH' : 'ONLINE',
    payment_status: b.paymentStatus === 'paid' ? 1 : 0,
    amount: b.amount,
    cash_due: b.cashDue,
    cash_due_collected: b.cashDueCollected ? 1 : 0,
    // Never sent to the agent: the patient reads it out at the door.
    agent_otp: '',
    lab_samples: labSamples,
    per_patient_price: b.perPatientPrice,
  };
}

const mapped = <A, B>(r: Envelope<A>, fn: (a: A) => B): Envelope<B> => (r.code === 0 && r.data !== undefined ? { ...r, data: fn(r.data) } : (r as unknown as Envelope<B>));
const getBooking = (code: string) => liveRequest<ApiBooking>('GET', `agent/bookings/${encodeURIComponent(code)}`);

/* ------------------------------------------------------------------- Auth */

export const Auth = {
  sendOtp: (mobile: string) => liveRequest('POST', 'auth/otp/request', { accountType: 'agent', mobile }, { auth: false }),
  async verifyOtp(mobile: string, otp: string): Promise<Envelope<{ token: string }>> {
    const r = await liveRequest<{ accessToken: string; refreshToken: string }>('POST', 'auth/otp/verify', { accountType: 'agent', mobile, code: otp }, { auth: false });
    if (r.code !== 0 || !r.data) return r as unknown as Envelope<{ token: string }>;
    await adoptSession(r.data);
    return { code: 0, message: r.message, data: { token: r.data.accessToken } };
  },
};

/* ---------------------------------------------------------------- Profile */

export const Profile = {
  get: async (): Promise<Envelope<AgentProfile>> =>
    mapped(await liveRequest<{ code: string; name: string; city: string | null; mobile: string | null; email: string | null }>('GET', 'agent/me'), (a) => ({
      name: a.name,
      email: a.email ?? '',
      mobile: a.mobile ?? '',
      agent_code: a.code,
      city: a.city ?? '',
    })),
  /**
   * This phone, with its push token (null: notifications off or no Firebase), under its install id.
   * Also links the current sign-in to the phone: the server pushes only to phones with a live one.
   * The server caps osVersion and appVersion at 32 characters.
   */
  registerDevice: (fcmToken: string | null) =>
    liveRequest('PUT', `me/devices/${useSession.getState().ensureInstallId()}`, {
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      osVersion: String(Platform.Version).slice(0, 32),
      appVersion: APP_VERSION.slice(0, 32),
      fcmToken: fcmToken || null,
    }),
  /** Sign-out: this phone leaves the account (needs the session, so before it ends). */
  unregisterDevice: () => liveRequest('DELETE', `me/devices/${useSession.getState().ensureInstallId()}`),
  /** Agents' accounts belong to operations: the request goes to support, who close it. */
  deleteAccount: () =>
    liveRequest('POST', 'me/support-tickets', {
      subject: 'Please delete my field-agent account',
      category: 'Account & Privacy',
      description: 'I’m asking for my KDC+ field-agent account and its personal data to be deleted. Requested from the KDC+ Agent app.',
    }),
};

/* --------------------------------------------------------------- Bookings */

const STATUS_TO_SERVER: Partial<Record<BookingStatus, string>> = { ONMYWAY: 'agent_on_the_way', ONGOING: 'collecting', COMPLETED: 'sample_collected' };

export const Bookings = {
  async active(bookingId?: string): Promise<Envelope<Booking[]>> {
    if (bookingId) {
      const r = await getBooking(codeOf(bookingId));
      return r.code === 0 && r.data ? { code: 0, data: [toBooking(r.data)] } : { code: 0, data: [] };
    }
    return mapped(await liveRequest<ApiBooking[]>('GET', 'agent/bookings?scope=active'), (rows) => rows.map(toBooking));
  },
  past: async (): Promise<Envelope<Booking[]>> => mapped(await liveRequest<ApiBooking[]>('GET', 'agent/bookings?scope=past'), (rows) => rows.map(toBooking)),
  details: async (bookingId: string): Promise<Envelope<Booking>> => mapped(await getBooking(codeOf(bookingId)), toBooking),

  /**
   * The spec's single status call. Starting collection needs the code the patient
   * reads out; re-sending a status the booking already has is a no-op, as the app expects.
   */
  async setStatus(id: number, status: BookingStatus, otp?: string): Promise<Envelope<Booking>> {
    const code = codeOf(id);
    if (status === 'REJECTED') {
      const r = await liveRequest('POST', `agent/bookings/${code}/reject`, {});
      return r.code === 0 ? { code: 0, message: r.message } : (r as Envelope<Booking>);
    }
    if (status === 'ONGOING' || status === 'PAID') {
      const current = await getBooking(code);
      if (current.code !== 0 || !current.data) return mapped(current, toBooking);
      if (status === 'ONGOING' && current.data.appStatus === 'ONGOING') return { code: 0, data: toBooking(current.data) };
      if (status === 'PAID') {
        if (current.data.paymentStatus === 'paid') return { code: 0, data: toBooking(current.data) };
        return mapped(await liveRequest<ApiBooking>('POST', `agent/bookings/${code}/payment`, { method: 'cash' }), toBooking);
      }
      if (current.data.codeLocked) return { code: 1, message: 'Too many wrong codes. Ask operations to reset the booking code.' };
      if (!otp) return { code: 1, message: 'Enter the booking code the patient gives you.' };
    }
    const target = STATUS_TO_SERVER[status];
    if (!target) return { code: 1, message: `Booking can’t move to ${status}.` };
    return mapped(await liveRequest<ApiBooking>('POST', `agent/bookings/${code}/status`, { status: target, ...(otp ? { otp } : {}) }), toBooking);
  },
  addPatients: async (id: number, patients: { full_name: string; gender: string; dob: string; patient_mobile: string }[]): Promise<Envelope<Booking>> =>
    mapped(
      await liveRequest<ApiBooking>('POST', `agent/bookings/${codeOf(id)}/patients`, {
        patients: patients.map((p) => ({ fullName: p.full_name, gender: p.gender.toLowerCase(), age: ageFromDob(p.dob), ...(p.patient_mobile ? { mobile: p.patient_mobile.replace(/\D/g, '').slice(-10) } : {}) })),
      }),
      toBooking,
    ),
  /** Samples for one person: the booked primary patient, or an added one (`otherId`). */
  async uploadSamples(bookingId: string, samples: { color: string; sample_id: string }[], otherId?: number): Promise<Envelope<Booking>> {
    const code = codeOf(bookingId);
    let patientId = otherId;
    if (!patientId) {
      const current = await getBooking(code);
      if (current.code !== 0 || !current.data) return mapped(current, toBooking);
      patientId = current.data.people[0]?.id;
    }
    const tubes = samples.filter((s) => String(s.sample_id ?? '').trim()).map((s) => ({ tube: tubeOf(s.color), barcode: s.sample_id.trim() }));
    if (tubes.some((t) => !t.tube)) return { code: 1, message: 'Unknown tube colour. Scan the tubes this test needs.' };
    return mapped(await liveRequest<ApiBooking>('POST', `agent/bookings/${code}/samples`, { patientId, samples: tubes }), toBooking);
  },
  /** Cash for people added at the door. Already settled (e.g. by the UPI QR) is fine. */
  async collectCashDue(bookingId: string): Promise<Envelope<Booking>> {
    const code = codeOf(bookingId);
    const current = await getBooking(code);
    if (current.code !== 0 || !current.data) return mapped(current, toBooking);
    if (current.data.cashDueCollected || current.data.cashDue <= 0) return { code: 0, data: toBooking(current.data) };
    return mapped(await liveRequest<ApiBooking>('POST', `agent/bookings/${code}/cash-due`, { method: 'cash' }), toBooking);
  },
  /** A single-use UPI QR for this booking's amount (or its cash due), from the payment provider. */
  paymentQr: async (bookingId?: string, forCashDue = false): Promise<Envelope<{ qr_image: string | null; amount: number; payee_name: string; status: string }>> => {
    if (!bookingId) return { code: 1, message: 'Open the booking to collect a payment.' };
    return mapped(
      await liveRequest<{ imageUrl: string | null; amount: number; status: string }>('POST', `agent/bookings/${codeOf(bookingId)}/payment-qr`, { cashDue: forCashDue }),
      (q) => ({ qr_image: q.imageUrl, amount: q.amount, payee_name: 'KDC+ Healthcare', status: q.status }),
    );
  },
  /** Whether the bank has confirmed the latest QR: created (waiting), paid, or cancelled (expired). */
  qrStatus: async (bookingId: string): Promise<Envelope<{ status: string }>> =>
    mapped(await liveRequest<{ status: string }>('GET', `agent/bookings/${codeOf(bookingId)}/payment-qr`), (q) => ({ status: q.status })),
  /** No bridged calling: hands back the collection contact's number for the phone's dialer. */
  async callPatient(id: number): Promise<Envelope<{ phone: string }>> {
    const current = await getBooking(codeOf(id));
    if (current.code !== 0 || !current.data) return current as unknown as Envelope<{ phone: string }>;
    if (!current.data.contactPhone) return { code: 1, message: 'No contact number on this booking.' };
    return { code: 0, data: { phone: current.data.contactPhone } };
  },
  callLog: (id: number, event_type: 'INITIATED' | 'SUCCESS' | 'FAILED', message?: string) =>
    liveRequest('POST', `agent/bookings/${codeOf(id)}/call-logs`, { event: event_type.toLowerCase(), ...(message ? { message: message.slice(0, 255) } : {}) }),
};

/* ---------------------------------------------------------- Notifications */

interface ApiNotification {
  id: number;
  event: string;
  title: string;
  body: string;
  data: { code?: string; type?: string } | null;
  unread: boolean;
  createdAt: string;
}

export const Notifications = {
  /** 20 a page, newest first; opening the first page marks everything read (as the spec's server does). */
  async page(n: number): Promise<Envelope<{ data: AgentNotification[]; current_page: number; last_page: number }>> {
    const r = await liveRequest<{ rows: ApiNotification[]; total: number; page: number; pageSize: number }>('GET', `me/notifications?page=${n}&limit=20`);
    if (r.code === 0 && n === 1) await liveRequest('POST', 'me/notifications/read-all', {});
    return mapped(r, (p) => ({
      data: p.rows.map((x) => ({
        id: x.id,
        type: x.event,
        title: x.title,
        message: x.body,
        target: x.data?.type,
        // Only a booking's code is a booking id (a support ticket's isn't).
        booking_id: !x.data?.type || x.data.type === 'lab_booking' ? (x.data?.code ?? undefined) : undefined,
        read_flag: x.unread ? 0 : 1,
        created_at: x.createdAt,
      })),
      current_page: p.page,
      last_page: Math.max(1, Math.ceil(p.total / p.pageSize)),
    }));
  },
};

/* ------------------------------------------------------------------ Help */

export const Help = {
  request: (subject: string, reason: string) => liveRequest('POST', 'me/support-tickets', { subject, category: 'Sample Collection', description: reason }),
};

/* ------------------------------------------------------------------- CMS */

export const Cms = {
  page: async (path: string): Promise<Envelope<{ data: { title: string; updated: string; sections: { heading: string; body: string }[] } }>> =>
    mapped(await liveRequest<{ title: string; updated: string; sections: { heading: string; body: string }[] }>('GET', `public/pages/${encodeURIComponent(path)}?app=agent`, undefined, { auth: false }), (page) => ({ data: page })),
};
