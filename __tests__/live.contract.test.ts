/// <reference types="node" />
/**
 * Contract test: the app's own endpoints module, on a real KDC+ backend, through a whole home
 * collection visit. Runs only when pointed at a server:
 *   AGENT_LIVE_URL=http://127.0.0.1:4000/api/v1 AGENT_DATA=/path/p11b-data.json npx jest live.contract
 * AGENT_DATA comes from the backend test kit (an agent, two assigned bookings, their codes);
 * SMS codes are read from the MSG91 stand-in's log; AGENT_QR_CONTROL pays a UPI QR like a customer.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { endSession, restoreSession, setSessionExpiredHandler } from '../src/api/client';
import { Auth, Bookings, Cms, Deliveries, Help, Notifications, Profile } from '../src/api/endpoints';
import { idOf } from '../src/api/live';
import { patientsOf } from '../src/domain/rules';
import { useSession } from '../src/store/session';
import { loadRefreshToken } from '../src/store/secure';

const LIVE = process.env.AGENT_LIVE_URL;
const suite = LIVE ? describe : describe.skip;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const data = LIVE ? JSON.parse(readFileSync(process.env.AGENT_DATA!, 'utf8')) : null;
const who = Number(process.env.AGENT_INDEX ?? 0);

async function smsCodeFor(mobile: string, since: number): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const lines = readFileSync(data.smsLog, 'utf8').trim().split('\n').slice(since).map((l: string) => JSON.parse(l));
    const hit = lines.filter((e: { kind: string; to: string }) => e.kind === 'sms' && e.to === `91${mobile}`).at(-1);
    if (hit) return hit.code;
    await sleep(100);
  }
  throw new Error(`no SMS for ${mobile}`);
}
const smsCount = () => readFileSync(data.smsLog, 'utf8').trim().split('\n').length;

suite('the agent app on the live backend', () => {
  jest.setTimeout(180_000);
  const agent = data?.agents[who];
  const [online, cash] = agent?.bookings ?? [];
  const ended = jest.fn();

  beforeAll(() => setSessionExpiredHandler(ended));

  it('signs in with an SMS code; the refresh token goes to the Keychain', async () => {
    const before = smsCount();
    expect(await Auth.sendOtp(agent.mobile)).toMatchObject({ code: 0 });
    const code = await smsCodeFor(agent.mobile, before);
    expect(code).toMatch(/^\d{4}$/);
    expect(await Auth.verifyOtp(agent.mobile, '0000')).toMatchObject({ code: 1 });
    const r = await Auth.verifyOtp(agent.mobile, code);
    expect(r).toMatchObject({ code: 0, data: { token: expect.stringMatching(/^kdc_at_/) } });
    expect(await loadRefreshToken()).toMatch(/^kdc_rt_/);
    const me = await Profile.get();
    expect(me).toMatchObject({ code: 0, data: { mobile: agent.mobile, agent_code: agent.code, city: 'Hyderabad' } });
    expect(await Profile.registerDevice(null)).toMatchObject({ code: 0 });
  });

  it('lists both assigned bookings in the app’s shape, without the collection code', async () => {
    const r = await Bookings.active();
    expect(r.code).toBe(0);
    const mine = r.data!.filter((b) => [online.code, cash.code].includes(b.booking_id));
    expect(mine).toHaveLength(2);
    for (const b of mine) {
      expect(b).toMatchObject({ booking_status: 'ACCEPTED', agent_otp: '', self_flag: 1, city: 'Hyderabad', user: { mobile: online.contactPhone } });
      expect(b.lab_samples.map((s) => s.sample_code)).toContain('EDTA');
    }
    const c = mine.find((b) => b.booking_id === cash.code)!;
    expect(c).toMatchObject({ payment_type: 'CASH', payment_status: 0 });
    expect(c.plan.plan_tests.some((t) => t.urine_sample_flag === 1)).toBe(true);
    expect((await Bookings.details(online.code)).data).toMatchObject({ booking_id: online.code, payment_type: 'ONLINE', payment_status: 1 });
  });

  it('online booking: trip, the patient’s code (wrong first), a person added at the door, samples, cash due, done', async () => {
    const id = idOf(online.code);
    expect(await Bookings.setStatus(id, 'ONMYWAY')).toMatchObject({ code: 0, data: { booking_status: 'ONMYWAY' } });
    expect(await Bookings.setStatus(id, 'ONGOING')).toMatchObject({ code: 1, message: expect.stringMatching(/code/i) });
    const wrong = online.collectionCode === '0000' ? '1111' : '0000';
    expect(await Bookings.setStatus(id, 'ONGOING', wrong)).toMatchObject({ code: 1, message: expect.stringMatching(/attempts left/) });
    expect(await Bookings.setStatus(id, 'ONGOING', online.collectionCode)).toMatchObject({ code: 0, data: { booking_status: 'ONGOING' } });
    // Re-sending is harmless, as the payment screen does.
    expect(await Bookings.setStatus(id, 'ONGOING')).toMatchObject({ code: 0 });

    const added = await Bookings.addPatients(id, [{ full_name: 'Meena Verma', gender: 'Female', dob: '1966-04-12', patient_mobile: '9876500111' }]);
    expect(added).toMatchObject({ code: 0, data: { cash_due: 349, cash_due_collected: 0 } });
    const people = patientsOf(added.data!);
    expect(people.map((p) => p.name)).toEqual(['Rahul Verma', 'Meena Verma']);

    const tube = added.data!.lab_samples[0].sample_color;
    expect(await Bookings.uploadSamples(online.code, [{ color: tube, sample_id: `B${Date.now()}A` }])).toMatchObject({ code: 0 });
    // Not done yet: the added person has no samples.
    expect(await Bookings.setStatus(id, 'COMPLETED')).toMatchObject({ code: 1, message: expect.stringContaining('Meena Verma') });
    const afterSamples = await Bookings.uploadSamples(online.code, [{ color: tube, sample_id: `B${Date.now()}B` }], people[1].otherId);
    expect(afterSamples.code).toBe(0);
    expect(patientsOf(afterSamples.data!).every((p) => p.samples.length === 1)).toBe(true);
    expect(await Bookings.setStatus(id, 'COMPLETED')).toMatchObject({ code: 1, message: expect.stringMatching(/cash due/i) });
    expect(await Bookings.collectCashDue(online.code)).toMatchObject({ code: 0, data: { cash_due_collected: 1 } });
    expect(await Bookings.collectCashDue(online.code)).toMatchObject({ code: 0 });
    expect(await Bookings.setStatus(id, 'COMPLETED')).toMatchObject({ code: 0, data: { booking_status: 'COMPLETED' } });
  });

  it('cash booking paid by UPI: the QR is the booking’s, the payment counts when the bank confirms it', async () => {
    const id = idOf(cash.code);
    await Bookings.setStatus(id, 'ONMYWAY');
    expect(await Bookings.setStatus(id, 'ONGOING', cash.collectionCode)).toMatchObject({ code: 0 });
    const b = (await Bookings.details(cash.code)).data!;
    const tubes = b.lab_samples.map((s) => s.sample_color);
    expect(await Bookings.uploadSamples(cash.code, [...tubes.map((c, i) => ({ color: c, sample_id: `C${Date.now()}${i}` })), { color: 'urine', sample_id: `U${Date.now()}` }])).toMatchObject({ code: 0 });

    // While the visit is on, the agent can call the collection contact.
    expect(await Bookings.callPatient(id)).toMatchObject({ code: 0, data: { phone: cash.contactPhone } });
    const qr = await Bookings.paymentQr(cash.code, false);
    expect(qr).toMatchObject({ code: 0, data: { qr_image: expect.stringMatching(/^https:/), amount: b.amount, status: 'created' } });
    expect((await Bookings.qrStatus(cash.code)).data?.status).toBe('created');
    const scan = await fetch(`${process.env.AGENT_QR_CONTROL}/payqr`, { method: 'POST', body: JSON.stringify({ booking: cash.code, amount: Math.round(b.amount * 100) }) });
    expect(scan.status).toBe(200);
    let status = 'created';
    for (let i = 0; i < 40 && status !== 'paid'; i++) {
      await sleep(2000);
      status = (await Bookings.qrStatus(cash.code)).data?.status ?? status;
    }
    expect(status).toBe('paid');
    // The payment screen's sequence after the QR: each step succeeds, including the ones already done.
    expect(await Bookings.setStatus(id, 'ONGOING')).toMatchObject({ code: 0 });
    expect(await Bookings.setStatus(id, 'COMPLETED')).toMatchObject({ code: 0 });
    expect(await Bookings.setStatus(id, 'PAID')).toMatchObject({ code: 0, data: { payment_status: 1 } });
    const past = await Bookings.past();
    expect(past.data!.map((x) => x.booking_id)).toEqual(expect.arrayContaining([online.code, cash.code]));
  });

  it('calls, notifications, help and pages', async () => {
    // Visits that are over no longer share the patient's number.
    expect(await Bookings.callPatient(idOf(online.code))).toMatchObject({ code: 1, message: expect.stringContaining('No contact number') });
    expect(await Bookings.callLog(idOf(online.code), 'INITIATED')).toMatchObject({ code: 0 });
    const n = await Notifications.page(1);
    expect(n).toMatchObject({ code: 0, data: { current_page: 1 } });
    expect(n.data!.data.length).toBeGreaterThan(0);
    expect(n.data!.data[0]).toMatchObject({ title: expect.any(String), message: expect.any(String) });
    expect((await Notifications.page(1)).data!.data.every((x) => x.read_flag === 1)).toBe(true);
    expect(await Help.request('Scanner not working', 'The barcode scanner does not focus on small tubes.')).toMatchObject({ code: 0 });
    expect(await Cms.page('privacy-policy')).toMatchObject({ code: 0, data: { data: { title: 'Privacy policy for field agents', sections: [{ heading: 'What we collect' }] } } });
    expect(await Cms.page('no-such-page')).toMatchObject({ code: 1 });
  });

  it('skills and medicine deliveries in the app’s shape (whatever is out with this agent now)', async () => {
    const me = await Profile.get();
    expect(me.data!.services.length).toBeGreaterThan(0);
    for (const scope of ['active', 'past'] as const) {
      const r = await Deliveries[scope]();
      expect(r.code).toBe(0);
      expect(Array.isArray(r.data)).toBe(true);
      for (const d of r.data!) {
        expect(d).toMatchObject({ code: expect.stringMatching(/^KDC-PH-/), status: expect.any(String), items: { units: expect.any(Number) }, payment: { collect: expect.any(Number) } });
        expect(JSON.stringify(d)).not.toMatch(/otp|deliveryCode/i);
        if (scope === 'past') expect(d.canAct).toBe(false);
      }
    }
    // Someone else's (or no such) order is not found.
    expect(await Deliveries.details('KDC-PH-NOTMINE0')).toMatchObject({ code: 1 });
  });

  it('refreshes an expired access token quietly; after sign-out the session is gone', async () => {
    execSync(`mysql ${process.env.AGENT_DB ?? 'kdcplus_r2'} -N -e "update user_sessions s join users u on u.id = s.user_id set s.access_expires_at = utc_timestamp(3) - interval 1 minute where u.mobile = '${agent.mobile}' and u.account_type = 'agent' and s.revoked_at is null"`);
    const before = await loadRefreshToken();
    expect(await Profile.get()).toMatchObject({ code: 0 });
    expect(await loadRefreshToken()).not.toBe(before);
    expect(ended).not.toHaveBeenCalled();

    const token = useSession.getState().token!;
    await endSession();
    expect(await loadRefreshToken()).toBeNull();
    const res = await fetch(`${LIVE}/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
    expect(await restoreSession()).toBe('signed-out');
  });
});
