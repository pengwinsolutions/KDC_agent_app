import {
  ageFromDob, buildUpiIntent, canMoveTo, cashDuePending, dobFromAge, extractList, hasMorePages, normaliseQr, normaliseStatus,
  patientCount, proceedCase, relativeTime, resolveTime, rupee, tubeColour, tubeSlots,
  attemptText, codDue, deliveryMeta, dropLine, failureProblem, itemsText,
} from '../src/domain/rules';
import { seedBookings, seedDeliveries } from '../src/mock-data/seed';

describe('status', () => {
  it('normalises spaces, hyphens and case', () => {
    expect(normaliseStatus('On My Way')).toBe('ONMYWAY');
    expect(normaliseStatus('on-going')).toBe('ONGOING');
  });
  it('only allows the server order, re-sends and reject from accepted', () => {
    expect(canMoveTo('ACCEPTED', 'ONMYWAY')).toBe(true);
    expect(canMoveTo('ACCEPTED', 'ONGOING')).toBe(false);
    expect(canMoveTo('ONGOING', 'ONGOING')).toBe(true);
    expect(canMoveTo('COMPLETED', 'PAID')).toBe(true);
    expect(canMoveTo('ACCEPTED', 'REJECTED')).toBe(true);
    expect(canMoveTo('ONMYWAY', 'REJECTED')).toBe(false);
  });
});

describe('time', () => {
  it('reads the first time field, in 12-hour form', () => {
    expect(resolveTime({ slot_time: '09:30:00', booking_date: '2026-11-11' })).toBe('9:30 AM');
    expect(resolveTime({ time_slot: '8:00 am' })).toBe('8:00 AM');
    expect(resolveTime({ booking_date: '2026-11-11 17:15:00' })).toBe('5:15 PM');
  });
  it('treats midnight and absence as missing', () => {
    expect(resolveTime({ booking_time: '00:00', booking_date: '2026-11-11' })).toBe('—');
    expect(resolveTime({})).toBe('—');
  });
  it('relative time', () => {
    const now = new Date('2026-11-11T12:00:00');
    expect(relativeTime('2026-11-11 11:59:40', now)).toBe('just now');
    expect(relativeTime('2026-11-11 11:55:00', now)).toBe('5m');
    expect(relativeTime('2026-11-09 12:00:00', now)).toBe('2d');
    expect(relativeTime('2026-10-20 12:00:00', now)).toBe('3w');
  });
});

describe('patients', () => {
  it('counts others plus the owner when self_flag is 1', () => {
    expect(patientCount({ others: [{} as any], self_flag: 1 })).toBe(2);
    expect(patientCount({ others: [], self_flag: 0 })).toBe(0);
  });
  it('age ↔ date of birth', () => {
    const today = new Date(2026, 10, 11);
    expect(dobFromAge(34, today)).toBe('1992-11-11');
    expect(ageFromDob('1992-11-12', today)).toBe(33);
  });
});

describe('cash due gate', () => {
  it('is pending only with an amount that is not collected', () => {
    expect(cashDuePending({ cash_due: 899, cash_due_collected: 0 })).toBe(true);
    expect(cashDuePending({ cash_due: 899, cash_due_collected: 1 })).toBe(false);
    expect(cashDuePending({ cash_due: 0, cash_due_collected: 0 })).toBe(false);
  });
  it('drives the Proceed decision table', () => {
    const [online, cash] = seedBookings();
    expect(proceedCase(cash)).toBe('cash');
    expect(proceedCase(online)).toBe('complete');
    expect(proceedCase({ ...online, cash_due: 1799, cash_due_collected: 0 })).toBe('cash_due');
    expect(proceedCase({ ...online, cash_due: 1799, cash_due_collected: 0 }, true)).toBe('complete');
  });
});

describe('tubes', () => {
  it('maps colour names and adds a urine slot when a test needs it', () => {
    expect(tubeColour('Lavender')).toBe('#9B59B6');
    expect(tubeColour('grey')).toBe('#6B7280');
    expect(tubeColour('#123456')).toBe('#123456');
    expect(tubeColour('mystery')).toBe('#94A3B8');
    const slots = tubeSlots(seedBookings()[0]);
    expect(slots.map((s) => s.name)).toEqual(['EDTA (CBC, HbA1c)', 'Serum separator', 'Fluoride (glucose)', 'Urine']);
  });
  it('falls back to legacy plan colours', () => {
    const b = { ...seedBookings()[2], lab_samples: [], plan: { id: 1, plan_name: 'x', plan_tests: [{ id: 1, name: 't', tests_names: [], tests_colors: ['#EAB308', '#EAB308', '#DC2626'] }] } };
    expect(tubeSlots(b as any)).toHaveLength(2);
  });
});

describe('UPI', () => {
  it('builds the intent with a 2-decimal amount', () => {
    expect(buildUpiIntent('kdc@hdfc', 'KDC+ Healthcare', 649, 'note')).toBe('upi://pay?pa=kdc%40hdfc&pn=KDC%2B%20Healthcare&cu=INR&am=649.00&tn=note');
  });
  it('accepts image, intent and raw-field shapes', () => {
    expect(normaliseQr('https://x/qr.png')?.kind).toBe('image');
    expect(normaliseQr('/storage/qr.png')?.value).toBe('https://kdcplus.in/storage/qr.png');
    expect(normaliseQr('iVBORw0KGgo')?.value.startsWith('data:image/png;base64,')).toBe(true);
    expect(normaliseQr({ upi_string: 'upi://pay?pa=a@b' })?.kind).toBe('intent');
    expect(normaliseQr({ vpa: 'a@b' }, 100)?.value).toContain('am=100.00');
    expect(normaliseQr({})).toBeNull();
  });
});

describe('lists and money', () => {
  it('digs the first array out of wrapped responses', () => {
    expect(extractList([1, 2])).toEqual([1, 2]);
    expect(extractList({ data: { data: [3] } })).toEqual([3]);
    expect(extractList({ notifications: [4] })).toEqual([4]);
  });
  it('has-more from next_page_url, last_page or a full page', () => {
    expect(hasMorePages({ next_page_url: null }, 20, 20)).toBe(false);
    expect(hasMorePages({ current_page: 1, last_page: 2 }, 20, 20)).toBe(true);
    expect(hasMorePages(null, 20, 20)).toBe(true);
    expect(hasMorePages(null, 7, 20)).toBe(false);
  });
  it('formats rupees in the Indian grouping', () => {
    expect(rupee(214380)).toBe('₹2,14,380');
    expect(rupee(649)).toBe('₹649');
    expect(rupee(-1299)).toBe('−₹1,299');
  });
});

describe('deliveries', () => {
  const [cod, prepaid] = seedDeliveries();

  it('labels every status, unknown ones neutrally', () => {
    expect(deliveryMeta('ASSIGNED')).toEqual({ label: 'Out for delivery', tone: 'caution' });
    expect(deliveryMeta('FAILED').tone).toBe('critical');
    expect(deliveryMeta('SOMETHING')).toEqual({ label: 'SOMETHING', tone: 'neutral' });
  });
  it('cash to collect only for unpaid cash on delivery', () => {
    expect(codDue(cod)).toBe(486);
    expect(codDue(prepaid)).toBeNull();
    expect(codDue({ payment: { method: 'cod', collect: 0, collected: 486 } })).toBeNull();
  });
  it('a failure needs a reason, and a 3–255 character note for “other”', () => {
    expect(failureProblem(null, '')).toContain('Choose');
    expect(failureProblem('other', ' ')).toContain('note');
    expect(failureProblem('other', 'ok')).toContain('3–255');
    expect(failureProblem('other', 'Dog at the gate')).toBeNull();
    expect(failureProblem('not_home', '')).toBeNull();
  });
  it('texts for cards', () => {
    expect(itemsText(cod)).toBe('3 items');
    expect(itemsText({ items: { lines: 1, units: 1 } })).toBe('1 item');
    expect(attemptText(cod)).toBe('Attempt 1 of 3');
    expect(dropLine(cod)).toBe('Flat 402, Aparna Towers, Kondapur, Hyderabad, 500084');
  });
});
