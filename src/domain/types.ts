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
  /** A medicine delivery's order code (target `delivery`). */
  delivery_code?: string;
  /** What the notification is about (lab_booking, delivery, support_ticket, campaign); demo lab rows have none. */
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
  /** The agent's skills; operations set them (Admin → Field agents). */
  services: AgentService[];
}

export type AgentService = 'sample_collection' | 'medicine_delivery';

/* ------------------------------------------------------------ Deliveries */

/** A medicine delivery as the agent sees it (docs/delivery-fleet-api.md, "Delivery view"). */
export type DeliveryStatus = 'ASSIGNED' | 'PICKED_UP' | 'FAILED' | 'DELIVERED' | 'RETURNED' | 'CANCELLED' | 'REASSIGNED';
export type FailureReason = 'not_home' | 'refused' | 'wrong_address' | 'unreachable' | 'other';

export interface Delivery {
  /** The order code, e.g. KDC-PH-…. */
  code: string;
  status: DeliveryStatus;
  /** The order's own status on the server (out_for_delivery, delivered, …). */
  orderStatus: string;
  /** Yours and out for delivery: you may pick up, deliver, record a failure, call. */
  canAct: boolean;
  nextStep: 'pick_up' | 'deliver' | 'return_to_pharmacy' | null;
  pickup: {
    pharmacyCode: string;
    name: string;
    line: string;
    locality: string;
    city: string;
    pincode: string;
    phone: string | null;
    lat: number | null;
    lng: number | null;
    pickedUpAt: string | null;
  } | null;
  drop: {
    name: string;
    label: string;
    line: string;
    area: string;
    city: string;
    pincode: string;
    lat: number | null;
    lng: number | null;
    /** Only while the delivery is yours and out. */
    phone: string | null;
  };
  items: { lines: number; units: number };
  payment: {
    method: 'cod' | 'online';
    /** Cash to collect at the door, rupees; 0 when prepaid or already paid. */
    collect: number;
    /** Cash you collected on this order, rupees (null: none). */
    collected: number | null;
  };
  slot: string;
  startsAt: string | null;
  attempts: { count: number; max: number; current: number | null };
  codeLocked: boolean;
  codeTriesLeft: number | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  deliveredTo: string | null;
  lastFailure: { reason: FailureReason | null; label: string | null; note: string | null; at: string | null } | null;
}

/** The backend's response envelope. code 0 = success. */
export interface Envelope<T = any> {
  code: number;
  message?: string;
  data?: T;
}
