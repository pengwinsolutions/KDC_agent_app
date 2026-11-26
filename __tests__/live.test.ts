/** The live layer (src/api/live.ts, src/api/client.ts) against a fake backend. */
jest.mock('../src/api/config', () => ({ API_CONFIG: { useMock: false, baseUrl: 'https://api.test/api/v1', timeoutMs: 5000 } }));

import { codeOf, idOf, servicesOf, toBooking, toDelivery, tubeOf, type ApiBooking, type ApiDelivery } from '../src/api/live';
import { liveRequest, refreshSession, restoreSession, setSessionExpiredHandler } from '../src/api/client';
import { Auth, Bookings, Deliveries, Notifications, Profile } from '../src/api/endpoints';
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

/* ------------------------------------------------------------ Deliveries */

/** The backend's delivery view, as GET /agent/deliveries sends it (docs/delivery-fleet-api.md). */
const apiDelivery = (over: Partial<ApiDelivery> = {}): ApiDelivery => ({
  code: 'KDC-PH-AB12CD34',
  status: 'out_for_delivery',
  appStatus: 'ASSIGNED',
  canAct: true,
  nextStep: 'pick_up',
  pickup: { pharmacy: { code: 'KDC-PS-0007', name: 'Apollo Pharmacy' }, address: { line: 'Plot 12', locality: 'Madhapur', city: 'Hyderabad', pincode: '500081' }, phone: '9849011001', geo: null, pickedUpAt: null },
  drop: { name: 'Lakshmi Reddy', address: { label: 'Home', line: 'Flat 402', area: 'Kondapur', city: 'Hyderabad', pincode: '500084' }, geo: { lat: 17.46, lng: 78.36 }, phone: '9876501234' },
  items: { lines: 1, units: 2 },
  payment: { method: 'cod', collectAmount: 101, collectPaise: 10100, collectedPaise: null },
  window: { slot: '26 Nov, 9 AM–12 PM', startsAt: '2026-11-26T03:30:00.000Z' },
  attempts: { count: 1, max: 3, current: 1 },
  codeLocked: false,
  codeTriesLeft: 5,
  dispatchedAt: '2026-11-25T08:00:00.000Z',
  deliveredAt: null,
  deliveredTo: null,
  lastFailure: null,
  ...over,
});

describe('deliveries mapping', () => {
  it('maps the delivery view: pickup, drop, cash in rupees from paise, window, attempts, lock', () => {
    expect(toDelivery(apiDelivery())).toEqual({
      code: 'KDC-PH-AB12CD34',
      status: 'ASSIGNED',
      orderStatus: 'out_for_delivery',
      canAct: true,
      nextStep: 'pick_up',
      pickup: { pharmacyCode: 'KDC-PS-0007', name: 'Apollo Pharmacy', line: 'Plot 12', locality: 'Madhapur', city: 'Hyderabad', pincode: '500081', phone: '9849011001', lat: null, lng: null, pickedUpAt: null },
      drop: { name: 'Lakshmi Reddy', label: 'Home', line: 'Flat 402', area: 'Kondapur', city: 'Hyderabad', pincode: '500084', lat: 17.46, lng: 78.36, phone: '9876501234' },
      items: { lines: 1, units: 2 },
      payment: { method: 'cod', collect: 101, collected: null },
      slot: '26 Nov, 9 AM–12 PM',
      startsAt: '2026-11-26T03:30:00.000Z',
      attempts: { count: 1, max: 3, current: 1 },
      codeLocked: false,
      codeTriesLeft: 5,
      dispatchedAt: '2026-11-25T08:00:00.000Z',
      deliveredAt: null,
      deliveredTo: null,
      lastFailure: null,
    });
  });

  it('copes with a past delivery: no pharmacy, no address, prepaid, collected cash, a failure', () => {
    const d = toDelivery(apiDelivery({
      appStatus: 'DELIVERED', canAct: false, nextStep: null, pickup: null,
      drop: { name: null, address: null, geo: null, phone: null },
      payment: { method: 'online', collectAmount: 0, collectPaise: 0, collectedPaise: 13200 },
      attempts: { count: 2, max: 3, current: null }, codeTriesLeft: null,
      lastFailure: { reason: 'not_home', label: 'Patient not at home', note: null, at: '2026-11-25T09:00:00.000Z' },
    }));
    expect(d).toMatchObject({ status: 'DELIVERED', pickup: null, drop: { name: '', line: '', lat: null, phone: null }, payment: { method: 'online', collect: 0, collected: 132 }, codeTriesLeft: null, lastFailure: { reason: 'not_home' } });
    expect(toDelivery(apiDelivery({ appStatus: 'SOMETHING_NEW', canAct: false })).status).toBe('DELIVERED');
  });

  it('reads the agent’s skills; an older server without them means sample collection', () => {
    expect(servicesOf(['medicine_delivery', 'x'])).toEqual(['medicine_delivery']);
    expect(servicesOf(undefined)).toEqual(['sample_collection']);
    expect(servicesOf(null)).toEqual(['sample_collection']);
  });
});

describe('live delivery flows', () => {
  beforeEach(() => useSession.setState({ token: 'kdc_at_x' }));

  it('profile: GET agent/me with services', async () => {
    replies.push(() => ok({ code: 'KDC-AG-4MCE', name: 'Ravi Kumar', city: 'Hyderabad', mobile: '9440012345', email: null, status: 'active', services: ['sample_collection', 'medicine_delivery'] }));
    expect(await Profile.get()).toMatchObject({ code: 0, data: { agent_code: 'KDC-AG-4MCE', services: ['sample_collection', 'medicine_delivery'] } });
  });

  it('lists by scope, opens one, picks up', async () => {
    replies.push((url) => {
      expect(url).toBe('https://api.test/api/v1/agent/deliveries?scope=active');
      return ok([apiDelivery()]);
    });
    expect((await Deliveries.active()).data![0].code).toBe('KDC-PH-AB12CD34');
    replies.push((url) => {
      expect(url).toContain('agent/deliveries?scope=past');
      return ok([]);
    });
    expect(await Deliveries.past()).toMatchObject({ code: 0, data: [] });
    replies.push((url, init) => {
      expect(url).toContain('agent/deliveries/KDC-PH-AB12CD34/picked-up');
      expect(init.method).toBe('POST');
      return ok(apiDelivery({ appStatus: 'PICKED_UP', nextStep: 'deliver' }), 'Picked up');
    });
    expect(await Deliveries.pickedUp('KDC-PH-AB12CD34')).toMatchObject({ code: 0, message: 'Picked up', data: { status: 'PICKED_UP' } });
  });

  it('deliver: the code, who took it and the photo id; a wrong code is the server’s words', async () => {
    replies.push((_url, init) => {
      expect(JSON.parse(init.body as string)).toEqual({ otp: '0000' });
      return { status: 422, body: { code: 0, message: 'Validation failed', data: null, errors: { otp: ['Wrong delivery code. 4 tries left.'] } } };
    });
    expect(await Deliveries.deliver('KDC-PH-AB12CD34', '0000', { deliveredTo: '  ' })).toMatchObject({ code: 1, message: 'Wrong delivery code. 4 tries left.' });
    replies.push((url, init) => {
      expect(url).toContain('agent/deliveries/KDC-PH-AB12CD34/deliver');
      expect(JSON.parse(init.body as string)).toEqual({ otp: '4821', deliveredTo: 'Security, Gate 2', podFileId: 77 });
      return ok(apiDelivery({ appStatus: 'DELIVERED', status: 'delivered', canAct: false, nextStep: null, deliveredTo: 'Security, Gate 2' }), 'Delivered');
    });
    expect(await Deliveries.deliver('KDC-PH-AB12CD34', '4821', { deliveredTo: ' Security, Gate 2 ', podFileId: 77 })).toMatchObject({ code: 0, data: { status: 'DELIVERED' } });
    replies.push(() => ({ status: 409, body: { code: 0, message: 'Too many wrong codes. Ask KDC+ to reset the delivery code.', data: null, errors: null } }));
    expect(await Deliveries.deliver('KDC-PH-AB12CD34', '1111')).toMatchObject({ code: 1, message: expect.stringContaining('reset') });
  });

  it('the proof photo goes up as multipart with purpose delivery_proof', async () => {
    // The app runs on React Native's FormData (file parts as {uri, name, type}), not Node's.
    const g = globalThis as unknown as { FormData: unknown };
    const nodeFormData = g.FormData;
    // eslint-disable-next-line @react-native/no-deep-imports -- React Native doesn't export its FormData
    g.FormData = require('react-native/Libraries/Network/FormData').default;
    replies.push((url, init) => {
      expect(url).toBe('https://api.test/api/v1/files');
      expect(init.body).toBeInstanceOf(FormData);
      expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
      const parts = (init.body as any)._parts as [string, any][];
      expect(parts.find(([k]) => k === 'purpose')?.[1]).toBe('delivery_proof');
      expect(parts.find(([k]) => k === 'file')?.[1]).toMatchObject({ uri: 'file:///cache/shot.jpg', type: 'image/jpeg' });
      return ok({ id: 77, purpose: 'delivery_proof' });
    });
    try {
      expect(await Deliveries.uploadProof('file:///cache/shot.jpg')).toEqual({ code: 0, message: 'Request completed successfully', data: { id: 77 } });
    } finally {
      g.FormData = nodeFormData;
    }
  });

  it('a failed delivery sends the reason and a trimmed note; calls are logged in the server’s words', async () => {
    replies.push((url, init) => {
      expect(url).toContain('agent/deliveries/KDC-PH-AB12CD34/delivery-failed');
      expect(JSON.parse(init.body as string)).toEqual({ reason: 'other', note: 'Gate closed' });
      return ok(apiDelivery({ appStatus: 'FAILED', status: 'delivery_failed', canAct: false, nextStep: 'return_to_pharmacy' }));
    });
    expect(await Deliveries.failed('KDC-PH-AB12CD34', 'other', ' Gate closed ')).toMatchObject({ code: 0, data: { status: 'FAILED', nextStep: 'return_to_pharmacy' } });
    replies.push((url, init) => {
      expect(url).toContain('agent/deliveries/KDC-PH-AB12CD34/call-logs');
      expect(JSON.parse(init.body as string)).toEqual({ event: 'initiated' });
      return ok({ logged: true });
    });
    expect((await Deliveries.callLog('KDC-PH-AB12CD34', 'INITIATED')).code).toBe(0);
    replies.push(() => ok(apiDelivery({ drop: { name: 'X', address: null, geo: null, phone: null } })));
    expect(await Deliveries.callPatient('KDC-PH-AB12CD34')).toMatchObject({ code: 1 });
  });

  it('inbox rows about a delivery carry its order code', async () => {
    replies.push(() => ok({ rows: [{ id: 9, event: 'agent.delivery_assigned', title: 'New delivery', body: 'x', data: { type: 'delivery', code: 'KDC-PH-AB12CD34' }, unread: true, createdAt: '2026-11-25T08:00:00.000Z' }], total: 1, page: 1, pageSize: 20 }));
    replies.push(() => ok({ updated: 1 }));
    const r = await Notifications.page(1);
    expect(r.data!.data[0]).toMatchObject({ target: 'delivery', delivery_code: 'KDC-PH-AB12CD34', booking_id: undefined });
  });
});
