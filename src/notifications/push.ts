/**
 * Push notifications (spec 9), so an agent hears about a new collection job, a cancelled one or
 * a support reply while the app is in the background or closed.
 *
 * Live builds use Firebase Cloud Messaging (android/app/google-services.json). Every Firebase call
 * here is a no-op when Firebase isn't configured for the build (no default app) and in demo
 * builds, where the mock backend sends its "pushes" through the same path a real one takes.
 *
 * - startPush (after sign-in, and on launch when the session is restored): asks permission
 *   (Android 13+, iOS), registers this phone with its FCM token (PUT me/devices/:installId, which
 *   also links this sign-in to the phone: the server only pushes to phones with a live sign-in),
 *   and re-registers when Firebase rotates the token.
 * - In the foreground a push shows as the heads-up banner, bumps the unread badge and refreshes
 *   the active bookings, so a newly assigned job appears without pulling to refresh.
 * - Tapping a push (app in the background or closed), the banner or an inbox row opens what
 *   it's about (notificationRoute).
 * - stopPush (sign-out): removes this phone from the account before the session ends, so it
 *   gets none of this agent's notifications, then forgets the FCM token.
 */
import { useEffect, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { create } from 'zustand';
import type { AgentNotification } from '../domain/types';
import { onMockPush } from '../api/mockServer';
import { Bookings, LIVE, Profile } from '../api/endpoints';
import { useSession } from '../store/session';
import { navigationRef, resetRoot } from '../navigation/navigation';
import type { RouteName } from '../navigation/routes';

// Firebase is loaded (require) only when it's configured for the build.
type Messaging = typeof import('@react-native-firebase/messaging');
type Remote = { notification?: { title?: string; body?: string }; data?: Record<string, unknown> } | null | undefined;

/** The heads-up banner currently shown in the foreground. */
export const useHeadsUp = create<{ current: AgentNotification | null; dismiss: () => void }>((set) => ({
  current: null,
  dismiss: () => set({ current: null }),
}));

/** Bumped by every push that arrives in the foreground or is tapped: screens showing server data reload on it. */
export const usePushSignal = create<{ tick: number }>(() => ({ tick: 0 }));
const signal = () => usePushSignal.setState((s) => ({ tick: s.tick + 1 }));

/** Calls `fn` for every push after the screen mounted (not for earlier ones). */
export function useOnPush(fn: () => void) {
  const tick = usePushSignal((s) => s.tick);
  const seen = useRef(tick);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (tick === seen.current) return;
    seen.current = tick;
    latest.current();
  }, [tick]);
}

/* ------------------------------------------------------------ Routing */

export interface PushRoute {
  screen: RouteName;
  params?: Record<string, unknown>;
}

/**
 * Where a notification opens, from the inbox, the banner or a push. Live notifications carry the
 * server's target (`target`: lab_booking, support_ticket, campaign) and event (`type`, e.g.
 * agent.booking_assigned); demo ones only the spec's type and booking id. Null: nothing to open.
 */
export function notificationRoute(n: Pick<AgentNotification, 'type' | 'booking_id' | 'target'>): PushRoute | null {
  switch (n.target) {
    case 'lab_booking':
      // A cancelled or reassigned job is no longer the agent's: the active list shows what's left.
      if (n.type === 'agent.booking_cancelled' || !n.booking_id) return { screen: 'home' };
      return { screen: 'booking-details', params: { bookingId: n.booking_id } };
    case 'support_ticket':
    case 'campaign':
      // The reply's status and a campaign's text are in the inbox; the help screen is a request form.
      return { screen: 'notifications' };
    case undefined:
    case '':
      break;
    default:
      return null;
  }
  // Demo notifications (spec 9.3).
  if (n.type === 'ADMIN_BROADCAST' || !n.booking_id) return { screen: 'notifications' };
  return { screen: 'booking-details', params: { bookingId: n.booking_id } };
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** A push as the app's notification. Its data has the target (`type`, `code`) and the `event`. */
export function pushNotification(remote: Remote): AgentNotification | null {
  const data = remote?.data ?? {};
  const target = str(data.type);
  if (!target) return null;
  const code = str(data.code);
  return {
    id: Number(data.notificationId) || Date.now(),
    type: str(data.event) ?? target,
    target,
    title: remote?.notification?.title ?? 'KDC+ Agent',
    message: remote?.notification?.body ?? '',
    booking_id: target === 'lab_booking' ? code : undefined,
    read_flag: 0,
    created_at: new Date().toISOString(),
  };
}

/** Where a tapped push opens; null for a push without a target or of an unknown kind (it just refreshes). */
export function pushRoute(remote: Remote): PushRoute | null {
  const n = pushNotification(remote);
  return n ? notificationRoute(n) : null;
}

/* ---------------------------------------------------- Opening, banner */

export function receivePush(n: AgentNotification) {
  useSession.getState().bumpUnread();
  signal();
  useHeadsUp.setState({ current: n });
  setTimeout(() => {
    if (useHeadsUp.getState().current?.id === n.id) useHeadsUp.getState().dismiss();
  }, 5000);
}

/** Screens before sign-in finishes: a push opened there waits until the agent is in. */
const PRE_AUTH = new Set(['splash', 'login', 'otp']);
let pending: AgentNotification | null = null;

/** Tap routing (spec 9.3), queued until navigation is ready and the splash has finished. */
export async function openFromPush(n: AgentNotification) {
  if (!useSession.getState().token) return;
  if (!navigationRef.isReady() || PRE_AUTH.has(navigationRef.getCurrentRoute()?.name ?? 'splash')) {
    pending = n;
    return;
  }
  useHeadsUp.getState().dismiss();
  const route = notificationRoute(n);
  if (!route) return;
  if (route.screen !== 'booking-details') {
    if (route.screen === 'home') resetRoot('home');
    else navigationRef.navigate(...([route.screen, route.params] as never));
    return;
  }
  // The job may have moved on since the notification (reassigned, closed): check it's still there.
  const res = await Bookings.details(String(route.params?.bookingId));
  if (res.code === 0 && res.data) navigationRef.navigate(...(['booking-details', { bookingId: res.data.booking_id }] as never));
  else resetRoot('home');
}

/** On every navigation change: opens a push that arrived before the agent reached the app. */
export function flushPendingPush() {
  if (pending && navigationRef.isReady() && !PRE_AUTH.has(navigationRef.getCurrentRoute()?.name ?? 'splash')) {
    const n = pending;
    pending = null;
    openFromPush(n);
  }
}

/* ----------------------------------------------------------- Firebase */

/** The messaging module, or null in demo builds and when Firebase isn't configured for this build. */
function firebase(): { m: Messaging; instance: ReturnType<Messaging['getMessaging']> } | null {
  if (!LIVE) return null;
  try {
    const { getApps } = require('@react-native-firebase/app') as typeof import('@react-native-firebase/app');
    if (!getApps().length) return null;
    const m = require('@react-native-firebase/messaging') as Messaging;
    return { m, instance: m.getMessaging() };
  } catch {
    return null;
  }
}

export const pushAvailable = () => firebase() !== null;

async function allowed(fb: ReturnType<typeof firebase>): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < 33) return true;
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return r === PermissionsAndroid.RESULTS.GRANTED;
  }
  if (!fb) return false;
  const status = await fb.m.requestPermission(fb.instance);
  return status === fb.m.AuthorizationStatus.AUTHORIZED || status === fb.m.AuthorizationStatus.PROVISIONAL;
}

let stop: (() => void) | null = null;
let mockStarted = false;
let initialChecked = false;

/**
 * Once per sign-in (RootNavigator's usePush). Registers this phone either way, with the FCM token
 * when notifications are allowed: the server lists it among the agent's devices.
 */
export async function startPush(): Promise<'on' | 'denied' | 'unavailable'> {
  stop?.();
  if (!LIVE) {
    // Demo: the mock backend's pushes, and a stand-in token.
    if (!mockStarted) onMockPush(receivePush);
    mockStarted = true;
    await allowed(null).catch(() => false);
    await Profile.registerDevice(`mock-fcm-${useSession.getState().ensureInstallId().slice(0, 8)}`);
    return 'on';
  }
  const fb = firebase();
  if (!fb) {
    // No Firebase in this build: still link this sign-in to the phone, without a token.
    await Profile.registerDevice(null);
    return 'unavailable';
  }
  const granted = await allowed(fb).catch(() => false);
  const token = granted ? await fb.m.getToken(fb.instance).catch(() => null) : null;
  await Profile.registerDevice(token);
  // Signed out (or the session ended) while this ran: nothing to listen for.
  if (!useSession.getState().token) return granted ? 'on' : 'denied';

  stop?.();
  const offRefresh = fb.m.onTokenRefresh(fb.instance, (t) => {
    Profile.registerDevice(t);
  });
  const offMessage = fb.m.onMessage(fb.instance, (remote) => {
    const n = pushNotification(remote as Remote);
    if (n) receivePush(n);
    else signal();
  });
  const offOpened = fb.m.onNotificationOpenedApp(fb.instance, (remote) => {
    signal();
    const n = pushNotification(remote as Remote);
    if (n) openFromPush(n);
  });
  stop = () => {
    offRefresh();
    offMessage();
    offOpened();
    stop = null;
  };
  // The push that started the app from closed (opened once the splash has finished); once per launch.
  if (!initialChecked) {
    initialChecked = true;
    const initial = await fb.m.getInitialNotification(fb.instance).catch(() => null);
    const n = pushNotification(initial as Remote);
    if (n) openFromPush(n);
  }
  return granted ? 'on' : 'denied';
}

/** The session ended without a sign-out (expired, revoked): stop listening; the server already stops sending. */
export function pausePush() {
  stop?.();
}

/** Sign-out: forget this phone on the server first (that needs the session), then the FCM token. */
export async function stopPush(): Promise<void> {
  stop?.();
  pending = null;
  if (!LIVE || !useSession.getState().token) return;
  await Profile.unregisterDevice().catch(() => undefined);
  const fb = firebase();
  if (fb) await fb.m.deleteToken(fb.instance).catch(() => undefined);
}

/** index.js: data that arrives while the app is closed needs a handler (the system shows the notification itself). */
export function registerBackgroundPush() {
  const fb = firebase();
  fb?.m.setBackgroundMessageHandler(fb.instance, async () => undefined);
}
