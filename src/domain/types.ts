/** Booking data model, as the backend sends it (spec section 12). */

export type BookingStatus = 'ACCEPTED' | 'ONMYWAY' | 'ONGOING' | 'COMPLETED' | 'PAID' | 'REJECTED';

export interface Sample {
  sample_id: string;
  color: string;
}

export interface LabSample {
  id: number;
  sample_color: string;
  sample_code: string;
  sample_name: string;
  lab_name: string;
  lab_code: string;
}

export interface PlanTest {
  id: number;
  name: string;
  tests_names: string[];
  tests_colors?: string[];
  urine_sample_flag?: 0 | 1;
}

export interface Plan {
  id: number;
  plan_name: string;
  plan_tests: PlanTest[];
}

export interface BookingUser {
  name: string;
  mobile: string;
  dob: string;
  gender: string;
  latitude?: string | number;
  longitude?: string | number;
  samples: Sample[];
}

export interface OtherPatient {
  id: number;
  full_name: string;
  dob: string;
  gender: string;
  patient_mobile?: string;
  samples: Sample[];
  /** Added on the spot by the agent. */
  added_by_agent?: 0 | 1;
}

export interface Booking {
  id: number;
  booking_id: string;
  booking_status: string;
  booking_date: string;
  /** The appointment time arrives under one of several names. */
  booking_time?: string;
  slot_time?: string;
  time_slot?: string;
  slot?: string;
  appointment_time?: string;
  collection_time?: string;
  plan_name: string;
  plan: Plan;
  self_flag: 0 | 1;
  user: BookingUser;
  others: OtherPatient[];
  dno: string;
  street: string;
  city: string;
  pincode: string;
  latitude?: string | number;
  longitude?: string | number;
  payment_type: 'CASH' | 'ONLINE';
  payment_status: 0 | 1;
  amount: number;
  cash_due: number;
  cash_due_collected: 0 | 1;
  agent_otp: string;
  lab_samples: LabSample[];
  /** Price of one extra patient on this plan (mock backend only). */
  per_patient_price?: number;
}

export interface AgentNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  image?: string;
  booking_id?: string;
  /** Live: what the notification is about on the server (lab_booking, support_ticket, campaign). */
  target?: string;
  read_flag: 0 | 1;
  created_at: string;
}

export interface AgentProfile {
  name: string;
  email: string;
  mobile: string;
  agent_code: string;
  city: string;
}

/** The backend's response envelope. code 0 = success. */
export interface Envelope<T = any> {
  code: number;
  message?: string;
  data?: T;
}
