/** The agent app's screens (spec section 4, plus medicine deliveries), one native stack. */
export type PaymentMode = 'booking' | 'cash_due';
/** Home and History show lab collections or medicine deliveries (agents with both skills switch). */
export type WorkTab = 'collections' | 'deliveries';

export interface RouteParams {
  splash: undefined;
  login: undefined;
  otp: { mobile: string };
  home: { tab?: WorkTab } | undefined;
  'test-details': { bookingId: string; justCollectedKey?: string };
  sample: { bookingId: string; patientKey: string };
  'collect-payment': {
    bookingId: string;
    mode?: PaymentMode;
    /** True when reached from Proceed: completes the booking after payment. */
    completeAfter?: boolean;
    /** Screen to return to after an early collection. */
    returnTo?: RouteName;
  };
  profile: undefined;
  history: { tab?: WorkTab } | undefined;
  'booking-details': { bookingId: string };
  'delivery-details': { code: string };
  notifications: undefined;
  help: undefined;
  policy: { path: 'privacy-policy' | 'terms' | 'refund-policy'; title: string };
}

export type RouteName = keyof RouteParams;
