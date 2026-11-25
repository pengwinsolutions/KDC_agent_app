/** The live layer (src/api/live.ts, src/api/client.ts) against a fake backend. */
jest.mock('../src/api/config', () => ({ API_CONFIG: { useMock: false, baseUrl: 'https://api.test/api/v1', timeoutMs: 5000 } }));

import { codeOf, idOf, toBooking, tubeOf, type ApiBooking } from '../src/api/live';
import { liveRequest, refreshSession, restoreSession, setSessionExpiredHandler } from '../src/api/client';
import { Auth, Bookings } from '../src/api/endpoints';
import { useSession } from '../src/store/session';
import { loadRefreshToken, saveRefreshToken } from '../src/store/secure';

type Reply = { status: number; body?: unknown } | Error;
let replies: ((url: string, init: RequestInit) => Reply)[] = [];
const calls: { url: string; init: RequestInit }[] = [];
const ok = (data: unknown, message = 'Request completed successfully') => ({ status: 200, body: { code: 1, message, data, errors: null } });

beforeEach(() => {
  replies = [];
  calls.length = 0;
  useSession.setState({ token: null });
  (globalThis as any).fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = replies.shift();
    if (!next) throw new Error(`unexpected call ${init.method} ${url}`);
    const r = next(url, init);
    if (r instanceof Error) throw r;
    return { status: r.status, json: async () => r.body } as Response;
  });
});

const booking = (over: Partial<ApiBooking> = {}): ApiBooking => ({
  code: 'KDC-DX-CGJ59B5F',
  status: 'agent_on_the_way',
  appStatus: 'ONMYWAY',
  slot: { date: '2026-11-15', window: '07:00–08:00', startsAt: '2026-11-15T01:30:00.000Z' },
  lab: { code: 'KDC-LB-1234', name: 'Vijaya Diagnostics' },
  address: { line: 'Flat 302, Lake View', area: 'Madhapur', city: 'Hyderabad', pincode: '500081', lat: 17.44, lng: 78.39 },
  contactPhone: '9876587002',
  people: [
    { id: 41, name: 'Rahul Verma', gender: 'male', age: 35, addedByAgent: false, tests: ['Complete Blood Count', 'Urine Routine'], requiredTubes: ['EDTA', 'URN'], samples: [{ tube: 'EDTA', barcode: 'KDC24A71903' }] },
    { id: 42, name: 'Meena Verma', gender: 'female', age: 60, addedByAgent: true, tests: ['Complete Blood Count'], requiredTubes: ['EDTA'], samples: [] },
  ],
  paymentType: 'online',
  paymentStatus: 'paid',
  amount: 698,
  perPatientPrice: 349,
  cashDue: 349,
  cashDueCollected: false,
  codeLocked: false,
  ...over,
});

describe('mapping', () => {
  it('turns booking codes into the app’s numeric ids and back', () => {
    for (const code of ['KDC-DX-CGJ59B5F', 'KDC-DX-00000001', 'KDC-DX-ZZZZZZZZ', 'KDC-DX-0A1B2C3D']) {
      expect(codeOf(idOf(code))).toBe(code);
      expect(Number.isSafeInteger(idOf(code))).toBe(true);
    }
    expect(codeOf('KDC-DX-CGJ59B5F')).toBe('KDC-DX-CGJ59B5F');
  });

  it('maps tube colours to tube types', () => {
    expect([tubeOf('lavender'), tubeOf('Yellow'), tubeOf('grey'), tubeOf('blue'), tubeOf('urine'), tubeOf('EDTA'), tubeOf('pink')]).toEqual(['EDTA', 'SST', 'FLU', 'CIT', 'URN', 'EDTA', null]);
  });

  it('builds the app’s booking: primary patient, others, tubes, money, and never the collection code', () => {
    const b = toBooking(booking());
    expect(b).toMatchObject({
      id: idOf('KDC-DX-CGJ59B5F'),
      booking_id: 'KDC-DX-CGJ59B5F',
      booking_status: 'ONMYWAY',
      booking_date: '2026-11-15',
      booking_time: '07:00',
      self_flag: 1,
      user: { name: 'Rahul Verma', mobile: '9876587002', gender: 'Male', samples: [{ sample_id: 'KDC24A71903', color: 'lavender' }] },
      others: [{ id: 42, full_name: 'Meena Verma', gender: 'Female', samples: [], added_by_agent: 1 }],
      dno: 'Flat 302, Lake View',
      street: 'Madhapur',
      payment_type: 'ONLINE',
      payment_status: 1,
      cash_due: 349,
      cash_due_collected: 0,
      agent_otp: '',
      per_patient_price: 349,
    });
    expect(b.lab_samples.map((s) => [s.sample_code, s.sample_color, s.lab_name])).toEqual([['EDTA', 'lavender', 'Vijaya Diagnostics']]);
    // Urine is a container, flagged on the plan (the app adds its slot).
    expect(b.plan.plan_tests.some((t) => t.urine_sample_flag === 1)).toBe(true);
    // An age becomes a date of birth that gives the same age today.
    const [y] = b.others[0].dob.split('-').map(Number);
    expect(new Date().getFullYear() - y).toBe(60);
  });
});

describe('client', () => {
  it('translates the backend envelope: success is code 0; field errors become the message', async () => {
    useSession.setState({ token: 'kdc_at_x' });
    replies.push(() => ok({ hello: 1 }));
    replies.push(() => ({ status: 422, body: { code: 0, message: 'Validation failed', data: null, errors: { otp: ['Invalid booking code (3 attempts left)'] } } }));
    replies.push(() => ({ status: 500, body: { code: 0, message: 'Something went wrong. Please try again.' } }));
    replies.push(() => ({ status: 503, body: { code: 0, message: 'KDC+ is down for maintenance until 6 AM.' } }));
    replies.push(() => new Error('offline'));
    expect(await liveRequest('GET', 'agent/me')).toEqual({ code: 0, message: 'Request completed successfully', data: { hello: 1 } });
    expect(await liveRequest('POST', 'x')).toMatchObject({ code: 1, message: 'Invalid booking code (3 attempts left)' });
    // A server failure is not the agent's connection; maintenance shows the server's own words.
    expect(await liveRequest('GET', 'x')).toMatchObject({ code: 1, message: expect.stringContaining('having trouble') });
    expect(await liveRequest('GET', 'x')).toMatchObject({ code: 1, message: 'KDC+ is down for maintenance until 6 AM.' });
    // Unreachable: development builds name the address they tried.
    expect(await liveRequest('GET', 'x')).toMatchObject({ code: 1, message: expect.stringContaining('Can’t reach the KDC+ server at') });
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer kdc_at_x' });
  });

  it('signs in: refresh token to the Keychain, access token in memory only', async () => {
    replies.push(() => ok({ accessToken: 'kdc_at_one', refreshToken: 'kdc_rt_one' }));
    const r = await Auth.verifyOtp('9848095001', '1234');
    expect(r).toMatchObject({ code: 0, data: { token: 'kdc_at_one' } });
    expect(await loadRefreshToken()).toBe('kdc_rt_one');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ accountType: 'agent', mobile: '9848095001', code: '1234' });
  });

  it('refreshes once for many calls that find the access token expired, then retries them', async () => {
    useSession.setState({ token: 'kdc_at_old' });
    await saveRefreshToken('kdc_rt_old');
    const unauthorised = () => ({ status: 401, body: { code: 0, message: 'Unauthorized' } });
    replies.push(unauthorised, unauthorised, unauthorised);
    replies.push((url, init) => {
      expect(url).toContain('auth/refresh');
      expect(JSON.parse(init.body as string)).toEqual({ refreshToken: 'kdc_rt_old' });
      return ok({ accessToken: 'kdc_at_new', refreshToken: 'kdc_rt_new' });
    });
    replies.push(() => ok(1), () => ok(2), () => ok(3));
    const results = await Promise.all([liveRequest('GET', 'a'), liveRequest('GET', 'b'), liveRequest('GET', 'c')]);
    expect(results.map((r) => r.code)).toEqual([0, 0, 0]);
    expect(calls.filter((c) => c.url.includes('auth/refresh'))).toHaveLength(1);
    expect(await loadRefreshToken()).toBe('kdc_rt_new');
    expect(useSession.getState().token).toBe('kdc_at_new');
  });

  it('a session that can’t be refreshed signs out once; an outage doesn’t', async () => {
    const ended = jest.fn();
    setSessionExpiredHandler(ended);
    useSession.setState({ token: 'kdc_at_old' });
    await saveRefreshToken('kdc_rt_old');
    replies.push(() => ({ status: 401, body: {} }), () => ({ status: 401, body: {} }));
    expect(await liveRequest('GET', 'a')).toMatchObject({ code: 401 });
    expect(ended).toHaveBeenCalledTimes(1);
    expect(await loadRefreshToken()).toBeNull();

    await saveRefreshToken('kdc_rt_live');
    replies.push(() => new Error('offline'));
    expect(await restoreSession()).toBe('offline');
    replies.push(() => ({ status: 503, body: { code: 0, message: 'Service temporarily unavailable' } }));
    await expect(refreshSession()).rejects.toThrow();
    expect(await loadRefreshToken()).toBe('kdc_rt_live');
  });
});

describe('live booking flows', () => {
  beforeEach(() => useSession.setState({ token: 'kdc_at_x' }));

  it('starting collection needs the patient’s code, and is a no-op once started', async () => {
    replies.push(() => ok(booking()));
    expect(await Bookings.setStatus(idOf('KDC-DX-CGJ59B5F'), 'ONGOING')).toMatchObject({ code: 1, message: expect.stringContaining('code') });
    replies.push(() => ok(booking()), (url, init) => {
      expect(url).toContain('agent/bookings/KDC-DX-CGJ59B5F/status');
      expect(JSON.parse(init.body as string)).toEqual({ status: 'collecting', otp: '4821' });
      return ok(booking({ status: 'collecting', appStatus: 'ONGOING' }));
    });
    expect(await Bookings.setStatus(idOf('KDC-DX-CGJ59B5F'), 'ONGOING', '4821')).toMatchObject({ code: 0, data: { booking_status: 'ONGOING' } });
    replies.push(() => ok(booking({ status: 'collecting', appStatus: 'ONGOING' })));
    expect(await Bookings.setStatus(idOf('KDC-DX-CGJ59B5F'), 'ONGOING')).toMatchObject({ code: 0 });
    replies.push(() => ok(booking({ codeLocked: true })));
    expect(await Bookings.setStatus(idOf('KDC-DX-CGJ59B5F'), 'ONGOING', '1111')).toMatchObject({ code: 1, message: expect.stringContaining('operations') });
  });

  it('samples go to the right person with tube types; cash due already settled is fine', async () => {
    replies.push(() => ok(booking()), (url, init) => {
      expect(JSON.parse(init.body as string)).toEqual({ patientId: 41, samples: [{ tube: 'EDTA', barcode: 'KDC24A71903' }, { tube: 'URN', barcode: 'URN-77' }] });
      return ok(booking());
    });
    expect(await Bookings.uploadSamples('KDC-DX-CGJ59B5F', [{ color: 'lavender', sample_id: 'KDC24A71903' }, { color: 'urine', sample_id: 'URN-77' }, { color: 'blue', sample_id: ' ' }])).toMatchObject({ code: 0 });
    replies.push((url, init) => {
      expect(JSON.parse(init.body as string)).toMatchObject({ patientId: 42 });
      return ok(booking());
    });
    expect(await Bookings.uploadSamples('KDC-DX-CGJ59B5F', [{ color: 'lavender', sample_id: 'B-2' }], 42)).toMatchObject({ code: 0 });
    replies.push(() => ok(booking({ cashDueCollected: true })));
    expect(await Bookings.collectCashDue('KDC-DX-CGJ59B5F')).toMatchObject({ code: 0 });
    expect(calls.at(-1)!.url).toContain('agent/bookings/KDC-DX-CGJ59B5F');
  });

  it('people added at the door: age from the date of birth, mobile digits only', async () => {
    replies.push((url, init) => {
      expect(url).toContain(`agent/bookings/KDC-DX-CGJ59B5F/patients`);
      const body = JSON.parse(init.body as string);
      expect(body.patients[0]).toMatchObject({ fullName: 'Meena Verma', gender: 'female', mobile: '9876500001' });
      expect(body.patients[0].age).toBeGreaterThanOrEqual(59);
      return ok(booking());
    });
    const dob = `${new Date().getFullYear() - 60}-01-01`;
    expect(await Bookings.addPatients(idOf('KDC-DX-CGJ59B5F'), [{ full_name: 'Meena Verma', gender: 'Female', dob, patient_mobile: '+91 98765 00001' }])).toMatchObject({ code: 0 });
  });
});
