/**
 * Fictional demo data for the agent prototype. Dates are relative to today so
 * the active list always reads as today's work.
 */
import type { AgentNotification, AgentProfile, Booking, Delivery, LabSample, Plan } from '../domain/types';

export const AGENT_MOBILE = '9876543210';
export const DEMO_OTP = '1234';

export const profile: AgentProfile = {
  name: 'Ravi Kumar',
  email: 'ravi.kumar@kdcplus.in',
  mobile: AGENT_MOBILE,
  agent_code: 'KDC-AG-0142',
  city: 'Hyderabad',
  // The demo agent does both, so the demo shows Collections and Deliveries.
  services: ['sample_collection', 'medicine_delivery'],
};

/** Demo only: the code every demo patient reads out for their medicine delivery. */
export const DEMO_DELIVERY_CODE = '2468';

export const SUPPORT_PHONE = '+914071234567';
export const WEBSITE = 'https://kdcplus.in';

const pad = (n: number) => String(n).padStart(2, '0');
export function dayOffset(days: number, time?: string): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return time ? `${date} ${time}` : date;
}
export function stampOffset(minutesAgo: number): string {
  const d = new Date(Date.now() - minutesAgo * 60_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/* ----------------------------------------------------------------- Tubes */

const LAB = { lab_name: 'KDC+ Central Lab, Banjara Hills', lab_code: 'KDC-CL-01' };
const tube = (id: number, sample_color: string, sample_code: string, sample_name: string): LabSample => ({
  id, sample_color, sample_code, sample_name, ...LAB,
});
const EDTA = tube(1, 'lavender', 'EDTA', 'EDTA (CBC, HbA1c)');
const SST = tube(2, 'yellow', 'SST', 'Serum separator');
const FLU = tube(3, 'grey', 'FLU', 'Fluoride (glucose)');
const CIT = tube(4, 'blue', 'CIT', 'Sodium citrate');

/* ----------------------------------------------------------------- Plans */

const fullBody: Plan = {
  id: 11,
  plan_name: 'KDC+ Full Body Checkup – Advanced',
  plan_tests: [
    { id: 1, name: 'Complete Blood Count', tests_names: ['Haemoglobin', 'RBC count', 'WBC count', 'Platelet count', 'Haematocrit'] },
    { id: 2, name: 'Lipid Profile', tests_names: ['Total cholesterol', 'HDL', 'LDL', 'Triglycerides', 'VLDL'] },
    { id: 3, name: 'Liver Function Test', tests_names: ['SGOT', 'SGPT', 'Bilirubin', 'Alkaline phosphatase', 'Albumin'] },
    { id: 4, name: 'Kidney Function Test', tests_names: ['Creatinine', 'Urea', 'Uric acid', 'eGFR'] },
    { id: 5, name: 'HbA1c', tests_names: ['Glycated haemoglobin', 'Estimated average glucose'] },
    { id: 6, name: 'Urine Routine', tests_names: ['Physical examination', 'Chemical examination', 'Microscopy'], urine_sample_flag: 1 },
  ],
};

const diabetes: Plan = {
  id: 12,
  plan_name: 'Diabetes Care Panel',
  plan_tests: [
    { id: 7, name: 'Fasting Blood Sugar', tests_names: ['Glucose, fasting'] },
    { id: 8, name: 'HbA1c', tests_names: ['Glycated haemoglobin', 'Estimated average glucose'] },
    { id: 9, name: 'Kidney Function Test', tests_names: ['Creatinine', 'Urea', 'eGFR'] },
  ],
};

const thyroid: Plan = {
  id: 13,
  plan_name: 'Thyroid Profile (T3, T4, TSH)',
  plan_tests: [{ id: 10, name: 'Thyroid Profile', tests_names: ['T3, total', 'T4, total', 'TSH, ultrasensitive'] }],
};

const cardiac: Plan = {
  id: 14,
  plan_name: 'Heart Health Screen',
  plan_tests: [
    { id: 11, name: 'Lipid Profile', tests_names: ['Total cholesterol', 'HDL', 'LDL', 'Triglycerides'] },
    { id: 12, name: 'hs-CRP', tests_names: ['C-reactive protein, high sensitivity'] },
    { id: 13, name: 'Coagulation', tests_names: ['PT', 'INR', 'aPTT'] },
  ],
};

/* -------------------------------------------------------------- Bookings */

function base(): Omit<Booking, 'id' | 'booking_id' | 'booking_status' | 'booking_date' | 'plan_name' | 'plan' | 'user' | 'dno' | 'street' | 'city' | 'pincode' | 'payment_type' | 'payment_status' | 'amount' | 'agent_otp' | 'lab_samples'> {
  return { self_flag: 1, others: [], cash_due: 0, cash_due_collected: 1 };
}

export function seedBookings(): Booking[] {
  return [
    {
      ...base(),
      id: 10421,
      booking_id: 'KDC-HC-10421',
      booking_status: 'ACCEPTED',
      booking_date: dayOffset(0),
      slot_time: '09:30:00',
      plan_name: fullBody.plan_name,
      plan: fullBody,
      user: { name: 'Aarav Sharma', mobile: '9849042187', dob: '1991-03-14', gender: 'Male', latitude: 17.4239, longitude: 78.4483, samples: [] },
      others: [{ id: 501, full_name: 'Priya Sharma', dob: '1994-06-02', gender: 'Female', patient_mobile: '9849042190', samples: [] }],
      dno: 'Flat 402, Lotus Residency',
      street: 'Road No. 12, Banjara Hills',
      city: 'Hyderabad',
      pincode: '500034',
      latitude: 17.4239,
      longitude: 78.4483,
      payment_type: 'ONLINE',
      payment_status: 1,
      amount: 3598,
      per_patient_price: 1799,
      agent_otp: '4821',
      lab_samples: [EDTA, SST, FLU],
    },
    {
      ...base(),
      id: 10424,
      booking_id: 'KDC-HC-10424',
      booking_status: 'ACCEPTED',
      booking_date: dayOffset(0, '11:00:00'),
      plan_name: diabetes.plan_name,
      plan: diabetes,
      user: { name: 'Lakshmi Narayan', mobile: '9000112233', dob: '1978-11-21', gender: 'Female', samples: [] },
      dno: 'H.No. 8-2-293/82',
      street: 'Jubilee Hills, Road No. 36',
      city: 'Hyderabad',
      pincode: '500033',
      latitude: 17.4326,
      longitude: 78.4071,
      payment_type: 'CASH',
      payment_status: 0,
      amount: 1299,
      per_patient_price: 1299,
      agent_otp: '7310',
      lab_samples: [EDTA, FLU, SST],
    },
    {
      ...base(),
      id: 10418,
      booking_id: 'KDC-HC-10418',
      booking_status: 'ONMYWAY',
      booking_date: dayOffset(0),
      time_slot: '8:00 AM',
      plan_name: thyroid.plan_name,
      plan: thyroid,
      user: { name: 'Imran Qureshi', mobile: '9963001144', dob: '1985-01-09', gender: 'Male', samples: [] },
      dno: 'Plot 17, Sri Sai Enclave',
      street: 'Madhapur, Ayyappa Society',
      city: 'Hyderabad',
      pincode: '500081',
      latitude: 17.4483,
      longitude: 78.3915,
      payment_type: 'CASH',
      payment_status: 0,
      amount: 649,
      per_patient_price: 649,
      agent_otp: '2297',
      lab_samples: [SST],
    },
    {
      ...base(),
      id: 10415,
      booking_id: 'KDC-HC-10415',
      booking_status: 'ONGOING',
      booking_date: dayOffset(0, '07:30:00'),
      plan_name: cardiac.plan_name,
      plan: cardiac,
      self_flag: 1,
      user: { name: 'Sunita Rao', mobile: '9440055661', dob: '1963-08-30', gender: 'Female', samples: [{ sample_id: 'KDC24A71903', color: 'yellow' }, { sample_id: 'KDC24A71904', color: 'blue' }] },
      others: [{ id: 502, full_name: 'Venkat Rao', dob: '1960-02-17', gender: 'Male', samples: [] }],
      dno: 'Villa 9, Aparna Hill Park',
      street: 'Chandanagar',
      city: 'Hyderabad',
      pincode: '500050',
      latitude: 17.4950,
      longitude: 78.3242,
      payment_type: 'ONLINE',
      payment_status: 1,
      amount: 3198,
      per_patient_price: 1599,
      agent_otp: '5560',
      lab_samples: [SST, CIT],
    },
  ];
}

export function seedPastBookings(): Booking[] {
  const past = (
    id: number, status: string, days: number, plan: Plan, name: string, street: string, type: 'CASH' | 'ONLINE', amount: number, time: string,
  ): Booking => ({
    ...base(),
    id,
    booking_id: `KDC-HC-${id}`,
    booking_status: status,
    booking_date: dayOffset(-days, time),
    plan_name: plan.plan_name,
    plan,
    user: { name, mobile: '98480' + String(id).slice(-5), dob: '1988-05-12', gender: id % 2 ? 'Male' : 'Female', samples: status === 'REJECTED' ? [] : [{ sample_id: `KDC24${id}A`, color: 'yellow' }] },
    dno: `H.No. ${id % 97}-${id % 13}`,
    street,
    city: 'Hyderabad',
    pincode: '5000' + String(30 + (id % 60)),
    latitude: 17.4 + (id % 9) / 100,
    longitude: 78.38 + (id % 7) / 100,
    payment_type: type,
    payment_status: status === 'REJECTED' && type === 'CASH' ? 0 : 1,
    amount,
    agent_otp: '0000',
    lab_samples: [SST],
  });
  return [
    past(10409, 'PAID', 1, diabetes, 'Kavitha Reddy', 'Kondapur, Botanical Garden Road', 'CASH', 1299, '10:30:00'),
    past(10406, 'COMPLETED', 1, fullBody, 'Rahul Verma', 'Gachibowli, DLF Road', 'ONLINE', 1799, '08:00:00'),
    past(10402, 'REJECTED', 2, thyroid, 'Meera Pillai', 'Kukatpally, KPHB Phase 3', 'CASH', 649, '17:00:00'),
    past(10398, 'COMPLETED', 3, cardiac, 'Vikram Chandra', 'Secunderabad, Sainikpuri', 'ONLINE', 1599, '09:00:00'),
    past(10391, 'PAID', 4, thyroid, 'Ananya Iyer', 'Begumpet, Prakash Nagar', 'CASH', 649, '07:45:00'),
    past(10385, 'COMPLETED', 6, fullBody, 'Sanjay Gupta', 'Manikonda, Lanco Hills', 'ONLINE', 1799, '08:30:00'),
    past(10377, 'PAID', 8, diabetes, 'Fatima Begum', 'Tolichowki, Seven Tombs Road', 'CASH', 1299, '11:15:00'),
  ];
}

/* --------------------------------------------------------- Notifications */

export function seedNotifications(): AgentNotification[] {
  const n = (id: number, type: string, title: string, message: string, minutesAgo: number, read: 0 | 1, booking_id?: string): AgentNotification => ({
    id, type, title, message, read_flag: read, created_at: stampOffset(minutesAgo), booking_id,
  });
  const list: AgentNotification[] = [
    { ...n(1302, 'agent.delivery_assigned', 'New delivery assigned', 'KDC-PH-7K2M9Q1A · Apollo Pharmacy, Madhapur → Kondapur, today 12 PM–3 PM. Collect ₹486.', 6, 0), target: 'delivery', delivery_code: 'KDC-PH-7K2M9Q1A' },
    n(1301, 'BOOKING_ASSIGNED', 'New booking assigned', 'KDC-HC-10424 · Diabetes Care Panel at Jubilee Hills, 11:00 AM today.', 12, 0, 'KDC-HC-10424'),
    n(1300, 'BOOKING_REMINDER', 'Collection in 30 minutes', 'Aarav Sharma, Banjara Hills — KDC-HC-10421 at 9:30 AM.', 45, 0, 'KDC-HC-10421'),
    n(1299, 'ADMIN_BROADCAST', 'New tube labels from Monday', 'Use the new KDC+ barcode labels for all serum tubes from Monday. Old labels are accepted until Friday.', 180, 0),
    n(1298, 'BOOKING_COMPLETED', 'Booking completed', 'KDC-HC-10409 is closed and its samples are on the way to the lab.', 60 * 26, 1, 'KDC-HC-10409'),
    n(1297, 'PAYMENT_RECEIVED', 'Cash collection recorded', '₹1,299 recorded for KDC-HC-10409.', 60 * 26 + 5, 1, 'KDC-HC-10409'),
    n(1296, 'REPORT_READY', 'Samples received at lab', 'KDC Central Lab received the samples for KDC-HC-10406.', 60 * 30, 1, 'KDC-HC-10406'),
  ];
  const fillers = [
    ['BOOKING_ASSIGNED', 'New booking assigned', 'A booking in Kondapur was assigned to you.'],
    ['BOOKING_COMPLETED', 'Booking completed', 'A Kukatpally collection was closed and sent to the lab.'],
    ['ADMIN_BROADCAST', 'Monsoon safety reminder', 'Carry a rain cover for the sample kit and keep tubes upright.'],
    ['BOOKING_REMINDER', 'Collection in 30 minutes', 'Your next home collection starts soon.'],
    ['REPORT_READY', 'Samples received at lab', 'Your samples reached KDC Central Lab within the cold-chain window.'],
  ];
  for (let i = 0; i < 22; i++) {
    const [type, title, message] = fillers[i % fillers.length];
    list.push(n(1295 - i, type, title, message, 60 * 24 * (2 + i), 1));
  }
  return list;
}

/* ------------------------------------------------------------ Deliveries */

const SLOT_DAY = () => new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const minutesAgoIso = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function delivery(over: Partial<Delivery> & Pick<Delivery, 'code' | 'drop'>): Delivery {
  return {
    status: 'ASSIGNED',
    orderStatus: 'out_for_delivery',
    canAct: true,
    nextStep: 'pick_up',
    pickup: {
      pharmacyCode: 'KDC-PS-0007',
      name: 'Apollo Pharmacy',
      line: 'Plot 12, Hitech City Road',
      locality: 'Madhapur',
      city: 'Hyderabad',
      pincode: '500081',
      phone: '9849011001',
      lat: null,
      lng: null,
      pickedUpAt: null,
    },
    items: { lines: 2, units: 3 },
    payment: { method: 'cod', collect: 486, collected: null },
    slot: `${SLOT_DAY()}, 12 PM–3 PM`,
    startsAt: null,
    attempts: { count: 1, max: 3, current: 1 },
    codeLocked: false,
    codeTriesLeft: 5,
    dispatchedAt: minutesAgoIso(20),
    deliveredAt: null,
    deliveredTo: null,
    lastFailure: null,
    ...over,
  };
}

/** Medicine orders given to the demo agent: two out now (one picked up, prepaid), one failed, and history. */
export function seedDeliveries(): Delivery[] {
  return [
    delivery({
      code: 'KDC-PH-7K2M9Q1A',
      drop: { name: 'Lakshmi Reddy', label: 'Home', line: 'Flat 402, Aparna Towers', area: 'Kondapur', city: 'Hyderabad', pincode: '500084', lat: 17.4691, lng: 78.3637, phone: '9876501234' },
    }),
    delivery({
      code: 'KDC-PH-3XQ8V2LD',
      status: 'PICKED_UP',
      nextStep: 'deliver',
      pickup: { pharmacyCode: 'KDC-PS-0011', name: 'MedPlus', line: '8-2-293, Road No. 2', locality: 'Banjara Hills', city: 'Hyderabad', pincode: '500034', phone: '9849011002', lat: null, lng: null, pickedUpAt: minutesAgoIso(8) },
      drop: { name: 'Arjun Mehta', label: 'Office', line: 'Level 5, Cyber Pearl', area: 'Hitech City', city: 'Hyderabad', pincode: '500081', lat: 17.4504, lng: 78.3809, phone: '9876505678' },
      items: { lines: 1, units: 2 },
      payment: { method: 'online', collect: 0, collected: null },
      slot: `${SLOT_DAY()}, 9 AM–12 PM`,
    }),
    delivery({
      code: 'KDC-PH-9TR4B6WN',
      status: 'FAILED',
      orderStatus: 'delivery_failed',
      canAct: false,
      nextStep: 'return_to_pharmacy',
      drop: { name: 'Sunita Rao', label: 'Home', line: '22, Lake View Colony', area: 'Gachibowli', city: 'Hyderabad', pincode: '500032', lat: null, lng: null, phone: null },
      items: { lines: 3, units: 5 },
      payment: { method: 'cod', collect: 1120, collected: null },
      slot: `${SLOT_DAY()}, 9 AM–12 PM`,
      attempts: { count: 1, max: 3, current: null },
      codeTriesLeft: null,
      lastFailure: { reason: 'not_home', label: 'Patient not at home', note: 'Gate locked, no answer on call', at: minutesAgoIso(55) },
    }),
  ];
}

export function seedPastDeliveries(): Delivery[] {
  return [
    delivery({
      code: 'KDC-PH-2HD7K5PC',
      status: 'DELIVERED',
      orderStatus: 'delivered',
      canAct: false,
      nextStep: null,
      drop: { name: 'Farhan Ali', label: 'Home', line: '5-9-30, Basheer Bagh', area: 'Himayatnagar', city: 'Hyderabad', pincode: '500029', lat: null, lng: null, phone: null },
      payment: { method: 'cod', collect: 0, collected: 312 },
      attempts: { count: 1, max: 3, current: null },
      codeTriesLeft: null,
      deliveredAt: minutesAgoIso(60 * 26),
      deliveredTo: 'Security, Gate 2',
    }),
  ];
}

/* ------------------------------------------------------------------- CMS */

export const CMS: Record<string, { title: string; updated: string; sections: { heading: string; body: string }[] }> = {
  'privacy-policy': {
    title: 'Privacy Policy',
    updated: '1 October 2026',
    sections: [
      { heading: 'What we collect', body: 'Your name, mobile number, location while a booking is in progress, and the sample identifiers you scan. We do not collect contacts, photos or microphone audio.' },
      { heading: 'How patient data is handled', body: 'Patient names, addresses and phone numbers are shown only for bookings assigned to you and only while you need them. Calls to patients are bridged through KDC+ so neither side sees the other’s number.' },
      { heading: 'Retention', body: 'Booking and sample records are kept as required by laboratory regulations. Call logs are kept for 90 days for quality and safety review.' },
      { heading: 'Your rights', body: 'You can ask for a copy of your data or request account deletion from Profile → Delete account, or by writing to privacy@kdcplus.in.' },
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    updated: '1 October 2026',
    sections: [
      { heading: 'Engagement', body: 'Field agents work with KDC+ as independent collection partners. Bookings are assigned by KDC+ operations and may be rejected before the trip starts.' },
      { heading: 'Sample handling', body: 'Follow the KDC+ collection SOP: verify identity, label every tube at the bedside, keep the cold chain and hand over to the lab within the stated window.' },
      { heading: 'Cash handling', body: 'Cash collected from patients is held on behalf of KDC+ and must be handed over to KDC+ operations as instructed.' },
    ],
  },
  'refund-policy': {
    title: 'Refund Policy',
    updated: '1 October 2026',
    sections: [
      { heading: 'Patient refunds', body: 'Refunds for cancelled or failed collections are processed by KDC+ to the original payment method within 5–7 working days.' },
      { heading: 'Agent earnings', body: 'Collection fees are credited when a booking is completed. Fees for bookings later found to be incorrectly collected may be reversed.' },
    ],
  },
};
