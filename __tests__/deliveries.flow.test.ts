/** Medicine deliveries against the in-app backend: the demo build's whole door-step flow. */
import { Auth, Deliveries, Profile } from '../src/api/endpoints';
import { resetMockDb } from '../src/api/mockServer';
import { useSession } from '../src/store/session';
import { DEMO_DELIVERY_CODE } from '../src/mock-data/seed';
import { codDue } from '../src/domain/rules';

jest.setTimeout(30000);

const COD = 'KDC-PH-7K2M9Q1A'; // out, not picked up, cash ₹486
const PREPAID = 'KDC-PH-3XQ8V2LD'; // picked up, prepaid
const FAILED = 'KDC-PH-9TR4B6WN'; // failed: bring it back

beforeEach(async () => {
  resetMockDb();
  useSession.setState({ token: null });
  await Auth.sendOtp('9876543210');
  const v = await Auth.verifyOtp('9876543210', '1234');
  useSession.getState().setToken(v.data!.token);
});

it('the demo agent has both skills', async () => {
  expect((await Profile.get()).data!.services).toEqual(['sample_collection', 'medicine_delivery']);
});

it('lists active deliveries (out, and failed to bring back) apart from past ones; never a delivery code', async () => {
  const active = (await Deliveries.active()).data!;
  expect(active.map((d) => [d.code, d.status, d.nextStep])).toEqual([
    [COD, 'ASSIGNED', 'pick_up'],
    [PREPAID, 'PICKED_UP', 'deliver'],
    [FAILED, 'FAILED', 'return_to_pharmacy'],
  ]);
  expect(codDue(active[0])).toBe(486);
  expect(codDue(active[1])).toBeNull();
  expect(JSON.stringify(active)).not.toContain(DEMO_DELIVERY_CODE);
  const past = (await Deliveries.past()).data!;
  expect(past.every((d) => !d.canAct)).toBe(true);
  expect(past[0]).toMatchObject({ status: 'DELIVERED', deliveredTo: 'Security, Gate 2', payment: { collected: 312 } });
});

it('pick up (idempotent), a wrong code counts down, the right one delivers and records the cash', async () => {
  expect((await Deliveries.pickedUp(COD)).data).toMatchObject({ status: 'PICKED_UP', nextStep: 'deliver' });
  expect((await Deliveries.pickedUp(COD)).code).toBe(0);

  const wrong = await Deliveries.deliver(COD, '0000');
  expect(wrong).toMatchObject({ code: 1, message: 'Wrong delivery code. 4 tries left.' });
  expect((await Deliveries.details(COD)).data!.codeTriesLeft).toBe(4);

  const proof = await Deliveries.uploadProof('file:///tmp/proof.jpg');
  expect(proof.data!.id).toBeGreaterThan(0);
  const done = await Deliveries.deliver(COD, DEMO_DELIVERY_CODE, { deliveredTo: 'Neighbour, Flat 401', podFileId: proof.data!.id });
  expect(done).toMatchObject({ code: 0, data: { status: 'DELIVERED', canAct: false, deliveredTo: 'Neighbour, Flat 401', payment: { collect: 0, collected: 486 }, drop: { phone: null } } });

  expect((await Deliveries.active()).data!.some((d) => d.code === COD)).toBe(false);
  expect((await Deliveries.past()).data!.some((d) => d.code === COD)).toBe(true);
  // Done: no more actions on it.
  expect((await Deliveries.deliver(COD, DEMO_DELIVERY_CODE)).code).not.toBe(0);
});

it('five wrong codes lock the delivery until KDC+ resets it', async () => {
  for (let i = 0; i < 4; i++) expect((await Deliveries.deliver(PREPAID, '1111')).code).toBe(1);
  const fifth = await Deliveries.deliver(PREPAID, '1111');
  expect(fifth.message).toContain('Ask KDC+ to reset');
  expect((await Deliveries.details(PREPAID)).data).toMatchObject({ codeLocked: true, codeTriesLeft: 0 });
  // Even the right code is refused now.
  expect((await Deliveries.deliver(PREPAID, DEMO_DELIVERY_CODE)).code).not.toBe(0);
});

it('a failed delivery needs a reason (and a note for “other”), then the parcel goes back', async () => {
  expect((await Deliveries.failed(COD, 'other')).code).not.toBe(0);
  const r = await Deliveries.failed(COD, 'not_home', 'Door locked');
  expect(r).toMatchObject({ code: 0, data: { status: 'FAILED', canAct: false, nextStep: 'return_to_pharmacy', lastFailure: { reason: 'not_home', label: 'Patient not at home', note: 'Door locked' } } });
  // Still on the active list, to bring back.
  expect((await Deliveries.active()).data!.find((d) => d.code === COD)?.status).toBe('FAILED');
});

it('calls the patient only while the delivery is out, and logs it', async () => {
  expect((await Deliveries.callPatient(COD)).data!.phone).toBe('9876501234');
  expect((await Deliveries.callLog(COD, 'INITIATED')).code).toBe(0);
  expect((await Deliveries.callPatient(FAILED)).code).not.toBe(0);
});
