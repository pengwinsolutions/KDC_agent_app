/**
 * One typed function per backend endpoint (spec section 11). Live builds use the
 * KDC+ backend (live.ts); demo builds the spec's paths on the in-app mock backend.
 */
import { Platform } from 'react-native';
import { api, API_CONFIG } from './client';
import * as live from './live';
import type { AgentNotification, AgentProfile, Booking, BookingStatus, Delivery, Envelope, FailureReason } from '../domain/types';

const demo = {
  Auth: {
    sendOtp: (mobile: string) => api.post('auth/user/otp/send', { mobile, type: 'AGENT' }),
    verifyOtp: (mobile: string, otp: string) => api.post<{ token: string }>('auth/user/otp/verify', { mobile, otp, type: 'AGENT' }),
  },
  Profile: {
    get: () => api.get<AgentProfile>('secure/profile'),
    registerDevice: (token: string | null) =>
      api.post('secure/profile/firebase', {
        token: token ?? '',
        bundle_version: '1',
        os_type: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
        os_version: String(Platform.Version),
        app_id: 'com.kdcplus.agent',
      }),
    unregisterDevice: (): Promise<Envelope> => Promise.resolve({ code: 0 }),
    deleteAccount: () => api.post('secure/account/delete', {}),
  },
  Bookings: {
    active: (bookingId?: string) => api.post<Booking[]>('secure/bookings/active', bookingId ? { booking_id: bookingId } : {}),
    past: () => api.post<Booking[]>('secure/bookings/past', {}),
    details: (bookingId: string) => api.post<Booking>('secure/bookingdetails', { booking_id: bookingId }),
    /** Uses the numeric id, as the spec's API does. */
    setStatus: (id: number, status: BookingStatus, otp?: string) =>
      api.post<Booking>('secure/booking/status/change', { booking_id: id, status, ...(otp ? { otp } : null) }),
    addPatients: (id: number, patients: { full_name: string; gender: string; dob: string; patient_mobile: string }[]) =>
      api.post<Booking>(`secure/booking/patient/${id}`, { patients }),
    uploadSamples: (bookingId: string, samples: { color: string; sample_id: string }[], otherId?: number) =>
      api.post<Booking>('secure/booking/samples/upload', { booking_id: bookingId, samples, booking_other_id: otherId ? String(otherId) : '' }),
    collectCashDue: (bookingId: string) => api.post<Booking>('secure/collect-cash-due', { booking_id: bookingId }),
    /** The demo's QR is the company UPI ID; the agent confirms the payment by hand. */
    paymentQr: (_bookingId?: string, _forCashDue?: boolean) => api.get('secure/payment-qr'),
    qrStatus: (_bookingId: string): Promise<Envelope<{ status: string }>> => Promise.resolve({ code: 0, data: { status: 'created' } }),
    callPatient: (id: number) => api.post('secure/booking/call-patient', { booking_id: id }),
    callLog: (id: number, event_type: 'INITIATED' | 'SUCCESS' | 'FAILED', message?: string) =>
      api.post('secure/booking/call-log', { booking_id: id, event_type, message, timestamp: new Date().toISOString() }),
  },
  /** Medicine deliveries (the backend's /agent/deliveries); the demo answers them with sample orders. */
  Deliveries: {
    active: () => api.get<Delivery[]>('secure/deliveries/active'),
    past: () => api.get<Delivery[]>('secure/deliveries/past'),
    details: (code: string) => api.get<Delivery>(`secure/deliveries/${code}`),
    pickedUp: (code: string) => api.post<Delivery>(`secure/deliveries/${code}/picked-up`, {}),
    deliver: (code: string, otp: string, opts: { deliveredTo?: string; podFileId?: number } = {}) =>
      api.post<Delivery>(`secure/deliveries/${code}/deliver`, { otp, ...opts }),
    failed: (code: string, reason: FailureReason, note?: string) => api.post<Delivery>(`secure/deliveries/${code}/delivery-failed`, { reason, note }),
    uploadProof: (_uri: string) => api.post<{ id: number }>('secure/files', { purpose: 'delivery_proof' }),
    callPatient: (code: string) => api.post<{ phone: string }>(`secure/deliveries/${code}/call-patient`, {}),
    callLog: (code: string, event_type: 'INITIATED' | 'SUCCESS' | 'FAILED', message?: string) =>
      api.post(`secure/deliveries/${code}/call-logs`, { event_type, message }),
  },
  Notifications: {
    page: (n: number) => api.post<{ data: AgentNotification[]; current_page: number; last_page: number }>(`secure/notifications/${n}`, {}),
  },
  Help: {
    request: (subject: string, reason: string) => api.post('secure/help/request', { subject, reason }),
  },
  Cms: {
    page: (path: string) => api.get<{ data: { title: string; updated: string; sections: { heading: string; body: string }[] } }>(`cms/${path}`),
  },
};

/** Both implementations must offer the same functions; the type checker holds them to it. */
type Api = { [G in keyof typeof demo]: { [F in keyof (typeof demo)[G]]: (...args: never[]) => Promise<Envelope> } };
const impl = (API_CONFIG.useMock ? demo : live) satisfies Api;
const chosen = impl as unknown as typeof demo & typeof live;

/** True when the app runs on the KDC+ backend (live-only flows: typed collection code, bank-confirmed UPI, direct dialling). */
export const LIVE = !API_CONFIG.useMock;

export const Auth = chosen.Auth;
export const Profile = chosen.Profile;
export const Bookings = chosen.Bookings;
export const Deliveries = chosen.Deliveries;
export const Notifications = chosen.Notifications;
export const Help = chosen.Help;
export const Cms = chosen.Cms;
