/**
 * In-app stand-in for https://<backend>/api, implementing every endpoint in the
 * agent spec (section 11) with the server's rules. Swap it out by setting
 * API_CONFIG.useMock to false; screens and stores do not change.
 */
import { createMMKV } from 'react-native-mmkv';
import type { AgentNotification, Booking, Delivery, Envelope, FailureReason } from '../domain/types';
import { canMoveTo, cashDuePending, normaliseStatus } from '../domain/rules';
import {
  AGENT_MOBILE, CMS, DEMO_DELIVERY_CODE, DEMO_OTP, profile, seedBookings, seedDeliveries, seedNotifications, seedPastBookings, seedPastDeliveries, stampOffset,
} from '../mock-data/seed';

const store = createMMKV({ id: 'kdc-agent-mockdb' });
const DB_KEY = 'db-v3'; // v2: wallet removed; v3: medicine deliveries

interface Db {
  active: Booking[];
  past: Booking[];
  notifications: AgentNotification[];
  /** Medicine deliveries, active and past; `wrongCodes` counts wrong delivery codes per order. */
  deliveries: Delivery[];
  wrongCodes: Record<string, number>;
  nextId: number;
  callLog: { booking_id: string; event_type: string; message?: string; timestamp: string }[];
  tickets: { subject: string; reason: string; at: string }[];
}

function fresh(): Db {
  return {
    active: seedBookings(),
    past: seedPastBookings(),
    notifications: seedNotifications(),
    deliveries: [...seedDeliveries(), ...seedPastDeliveries()],
    wrongCodes: {},
    nextId: 2000,
    callLog: [],
    tickets: [],
  };
}

let db: Db = load();

function load(): Db {
  try {
    const raw = store.getString(DB_KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    /* fall through to a fresh copy */
  }
  return fresh();
}
const save = () => store.set(DB_KEY, JSON.stringify(db));

/** Restores the demo data (Profile → Reset demo data). */
export function resetMockDb() {
  db = fresh();
  save();
}

/* ------------------------------------------------------------ Push bus */

type PushListener = (n: AgentNotification) => void;
const pushListeners = new Set<PushListener>();
/** Lets the push module receive "server pushes" from the mock backend. */
export function onMockPush(fn: PushListener) {
  pushListeners.add(fn);
  return () => pushListeners.delete(fn);
}
function push(type: string, title: string, message: string, booking_id?: string) {
  const n: AgentNotification = { id: db.nextId++, type, title, message, booking_id, read_flag: 0, created_at: stampOffset(0) };
  db.notifications.unshift(n);
  save();
  setTimeout(() => pushListeners.forEach((fn) => fn(n)), 900);
}

/* ------------------------------------------------------------- Helpers */

const ok = <T,>(data?: T, message = 'Success'): Envelope<T> => ({ code: 0, message, data });
const fail = (message: string, code = 1, data?: any): Envelope => ({ code, message, data });

/** Bookings are addressed by numeric id or display id, as the real API does. */
function find(ref: unknown): { b: Booking; list: 'active' | 'past' } | null {
  const key = String(ref ?? '');
  for (const list of ['active', 'past'] as const) {
    const b = db[list].find((x) => String(x.id) === key || x.booking_id === key);
    if (b) return { b, list };
  }
  return null;
}

function moveToPast(b: Booking) {
  db.active = db.active.filter((x) => x.id !== b.id);
  if (!db.past.some((x) => x.id === b.id)) db.past.unshift(b);
}

function page<T>(items: T[], n: number, size: number) {
  const last = Math.max(1, Math.ceil(items.length / size));
  return { data: items.slice((n - 1) * size, n * size), current_page: n, last_page: last, total: items.length };
}

/* ------------------------------------------------------------- Routing */

export async function handle(method: 'GET' | 'POST', path: string, body: any, token: string | null): Promise<Envelope> {
  await new Promise<void>((r) => setTimeout(r, 280 + Math.random() * 320));
  const p = path.replace(/^\/+/, '');

  if (p === 'auth/user/otp/send') {
    return String(body?.mobile) === AGENT_MOBILE ? ok(undefined, 'OTP sent') : fail('Agent not registered');
  }
  if (p === 'auth/user/otp/verify') {
    if (String(body?.mobile) !== AGENT_MOBILE) return fail('Agent not registered');
    return String(body?.otp) === DEMO_OTP ? ok({ token: `kdc-agent-${Date.now()}` }) : fail('Invalid Otp.');
  }
  if (p.startsWith('cms/')) {
    const page = CMS[p.slice(4)];
    return page ? ok({ data: page }) : fail('Page not found');
  }

  if (!token) return fail('Unauthenticated', 401);

  if (method === 'GET' && p === 'secure/profile') return ok(profile);
  if (p === 'secure/profile/firebase') return ok(undefined, 'Device registered');

  if (p === 'secure/bookings/active') {
    if (body?.booking_id) {
      const hit = find(body.booking_id);
      return hit ? ok([hit.b]) : ok([]);
    }
    return ok([...db.active]);
  }
  if (p === 'secure/bookings/past') return ok([...db.past]);
  if (p === 'secure/bookingdetails') {
    const hit = find(body?.booking_id);
    return hit ? ok(hit.b) : fail('Booking not found');
  }

  if (p === 'secure/booking/status/change') {
    const hit = find(body?.booking_id);
    if (!hit) return fail('Booking not found');
    const { b } = hit;
    const to = normaliseStatus(body?.status) as any;
    const from = normaliseStatus(b.booking_status);
    if (from === to) return ok(b, 'Status unchanged');
    if (!canMoveTo(from, to)) return fail(`Booking can’t move from ${from} to ${to}.`);
    if (to === 'ONGOING' && String(body?.otp ?? '') !== b.agent_otp) return fail('Invalid booking OTP.');
    if (to === 'COMPLETED' && cashDuePending(b)) {
      return fail(`Collect ₹${b.cash_due} for the added patient first.`, 2, { cash_due: b.cash_due, cash_due_collected: b.cash_due_collected });
    }
    if (to === 'PAID' && b.payment_type !== 'CASH') return fail('Only cash bookings are marked paid.');
    b.booking_status = to;
    if (to === 'REJECTED') {
      moveToPast(b);
      push('BOOKING_REJECTED', 'Booking released', `${b.booking_id} was returned to operations for reassignment.`, b.booking_id);
    } else if (to === 'COMPLETED') {
      moveToPast(b);
      push('BOOKING_COMPLETED', 'Booking completed', `${b.booking_id} is closed and its samples are on the way to the lab.`, b.booking_id);
    } else if (to === 'PAID') {
      b.payment_status = 1;
    }
    save();
    return ok(b, 'Status updated');
  }

  if (p === 'secure/booking/cancel') return ok(undefined, 'Cancelled');

  const addMatch = /^secure\/booking\/patient\/(.+)$/.exec(p);
  if (addMatch) {
    const hit = find(addMatch[1]);
    if (!hit) return fail('Booking not found');
    const { b } = hit;
    const list = Array.isArray(body?.patients) ? body.patients : [];
    if (!list.length) return fail('Add at least one patient.');
    const price = b.per_patient_price ?? 999;
    for (const pt of list) {
      b.others.push({
        id: db.nextId++, full_name: pt.full_name, gender: pt.gender, dob: pt.dob, patient_mobile: pt.patient_mobile || undefined, samples: [], added_by_agent: 1,
      });
    }
    if (b.payment_type === 'CASH') b.amount += price * list.length;
    else {
      b.cash_due = (cashDuePending(b) ? b.cash_due : 0) + price * list.length;
      b.cash_due_collected = 0;
    }
    save();
    return ok({ ...b }, 'Patient added');
  }

  if (p === 'secure/booking/samples/upload') {
    const hit = find(body?.booking_id);
    if (!hit) return fail('Booking not found');
    const { b } = hit;
    const samples = (Array.isArray(body?.samples) ? body.samples : []).filter((s: any) => String(s?.sample_id ?? '').trim());
    if (!samples.length) return fail('Scan at least one tube.');
    const otherId = body?.booking_other_id;
    if (otherId) {
      const o = b.others.find((x) => String(x.id) === String(otherId));
      if (!o) return fail('Patient not found on this booking.');
      o.samples = samples;
    } else {
      b.user.samples = samples;
    }
    save();
    return ok(b, 'Samples uploaded');
  }

  if (p === 'secure/collect-cash-due') {
    const hit = find(body?.booking_id);
    if (!hit) return fail('Booking not found');
    const { b } = hit;
    if (cashDuePending(b)) {
      b.cash_due_collected = 1;
      save();
    }
    return ok(b, 'Payment recorded');
  }

  if (method === 'GET' && p === 'secure/payment-qr') {
    return ok({ upi_id: 'kdcplus@hdfcbank', payee_name: 'KDC+ Healthcare', note: 'KDC+ home collection' });
  }

  if (p === 'secure/booking/call-patient') {
    return find(body?.booking_id) ? ok(undefined, 'Call placed') : fail('Booking not found');
  }
  if (p === 'secure/booking/call-log') {
    db.callLog.unshift({ booking_id: String(body?.booking_id), event_type: String(body?.event_type), message: body?.message, timestamp: String(body?.timestamp) });
    save();
    return ok();
  }

  const notifMatch = /^secure\/notifications\/(\d+)$/.exec(p);
  if (notifMatch) {
    const n = Number(notifMatch[1]);
    const res = page(db.notifications, n, 20);
    if (n === 1) {
      db.notifications.forEach((x) => (x.read_flag = 1));
      save();
    }
    return ok(res);
  }

  /* Medicine deliveries (the backend's /agent/deliveries rules, docs/delivery-fleet-api.md). */
  if (method === 'GET' && (p === 'secure/deliveries/active' || p === 'secure/deliveries/past')) {
    const active = p.endsWith('active');
    return ok(db.deliveries.filter((d) => isActiveDelivery(d) === active));
  }
  const delMatch = /^secure\/deliveries\/([\w-]+)(?:\/([\w-]+))?$/.exec(p);
  if (delMatch) return deliveryAction(method, delMatch[1], delMatch[2], body);
  if (method === 'POST' && p === 'secure/files') return ok({ id: db.nextId++ }, 'File uploaded');

  if (p === 'secure/help/request') {
    db.tickets.unshift({ subject: String(body?.subject), reason: String(body?.reason), at: stampOffset(0) });
    save();
    return ok(undefined, 'Request received');
  }
  if (p === 'secure/account/delete') {
    resetMockDb();
    return ok(undefined, 'Deletion requested');
  }

  return fail(`No mock for ${method} ${p}`);
}

/* ----------------------------------------------------------- Deliveries */

const MAX_CODE_TRIES = 5;
const FAILURE_LABEL: Record<FailureReason, string> = {
  not_home: 'Patient not at home',
  refused: 'Patient refused the order',
  wrong_address: 'Wrong or incomplete address',
  unreachable: 'Patient unreachable',
  other: 'Other',
};
const isActiveDelivery = (d: Delivery) => d.canAct || d.status === 'FAILED';

/** Leaves the attempt: the agent loses the drop phone and the code counter. */
function endAttempt(d: Delivery) {
  d.canAct = false;
  d.drop.phone = null;
  d.attempts.current = null;
  d.codeTriesLeft = null;
  d.codeLocked = false;
}

function deliveryAction(method: 'GET' | 'POST', code: string, action: string | undefined, body: any): Envelope {
  const d = db.deliveries.find((x) => x.code === code);
  if (!d) return fail('Delivery not found');
  if (!action) return method === 'GET' ? ok(d) : fail('Delivery not found');
  if (action === 'call-logs') {
    db.callLog.unshift({ booking_id: code, event_type: String(body?.event_type), message: body?.message, timestamp: new Date().toISOString() });
    save();
    return ok({ logged: true });
  }
  if (action === 'call-patient') return d.canAct && d.drop.phone ? ok({ phone: d.drop.phone }) : fail('No contact number on this delivery.');
  if (!d.canAct) return fail('This delivery isn’t out with you any more.', 409);
  if (action === 'picked-up') {
    if (d.pickup && !d.pickup.pickedUpAt) d.pickup.pickedUpAt = new Date().toISOString();
    d.status = 'PICKED_UP';
    d.nextStep = 'deliver';
    save();
    return ok(d, 'Picked up');
  }
  if (action === 'deliver') {
    const wrong = db.wrongCodes[code] ?? 0;
    if (wrong >= MAX_CODE_TRIES) return fail('Too many wrong codes. Ask KDC+ to reset the delivery code.', 409);
    if (!/^\d{4}$/.test(String(body?.otp ?? ''))) return fail('otp must be 4 digits');
    if (String(body.otp) !== DEMO_DELIVERY_CODE) {
      db.wrongCodes[code] = wrong + 1;
      const left = MAX_CODE_TRIES - wrong - 1;
      d.codeTriesLeft = left;
      d.codeLocked = left <= 0;
      save();
      return left <= 0 ? fail('Too many wrong codes. Ask KDC+ to reset the delivery code.', 409) : fail(`Wrong delivery code. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
    }
    const handedTo = String(body?.deliveredTo ?? '').trim();
    if (handedTo && (handedTo.length < 2 || handedTo.length > 80)) return fail('deliveredTo must be 2–80 characters');
    d.status = 'DELIVERED';
    d.orderStatus = 'delivered';
    d.nextStep = null;
    d.deliveredAt = new Date().toISOString();
    d.deliveredTo = handedTo || null;
    if (d.payment.method === 'cod' && d.payment.collect > 0) {
      d.payment.collected = d.payment.collect;
      d.payment.collect = 0;
    }
    endAttempt(d);
    save();
    return ok(d, 'Delivered');
  }
  if (action === 'delivery-failed') {
    const reason = String(body?.reason ?? '') as FailureReason;
    if (!(reason in FAILURE_LABEL)) return fail('Choose why the delivery failed.');
    const note = String(body?.note ?? '').trim();
    if ((reason === 'other' || note) && (note.length < 3 || note.length > 255)) return fail('Add a note of 3–255 characters.');
    d.status = 'FAILED';
    d.orderStatus = 'delivery_failed';
    d.nextStep = 'return_to_pharmacy';
    d.lastFailure = { reason, label: FAILURE_LABEL[reason], note: note || null, at: new Date().toISOString() };
    endAttempt(d);
    save();
    return ok(d, 'Failed delivery recorded');
  }
  return fail(`No mock for ${method} ${action}`);
}
