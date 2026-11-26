/** Agent-specific building blocks, drawn with the KDC+ design system. */
import React, { useEffect, useRef, useState } from 'react';
import { Animated as RNAnimated, Linking, Modal as RNModal, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import NetInfo from '@react-native-community/netinfo';
import { Btn, Div, P, Span } from '../primitives/index';
import {
  AlertTriangle, Banknote, Bell, CheckCircle2, CreditCard, Loader2, Navigation, Phone, PhoneCall, RefreshCw, WifiOff, X,
} from '../primitives/icons';
import { Button } from '../ui/Button';
import { FrameBox } from '../ui/DeviceFrame';
import { DEVICE } from '../ui/Screen';
import { showToast } from '../../store/toast';
import { Bookings, Deliveries, LIVE } from '../../api/endpoints';
import type { Booking, Delivery } from '../../domain/types';
import { addressLine, deliveryMeta, dropLine, pickupLine, rupee, statusMeta, tubeColour, type StatusTone } from '../../domain/rules';
import { openFromPush, useHeadsUp } from '../../notifications/push';

/* ------------------------------------------------------------ Status */

const PILL: Record<StatusTone, { bg: string; text: string; dot: string }> = {
  caution: { bg: '#FEF3E2', text: '#B45309', dot: '#EA580C' },
  brand: { bg: '#E6F1FC', text: '#0057A8', dot: '#0068C8' },
  purple: { bg: '#F3EEFF', text: '#6D28D9', dot: '#7C3AED' },
  success: { bg: '#E7F7EC', text: '#15803D', dot: '#16A34A' },
  paid: { bg: '#DCF2E4', text: '#14532D', dot: '#166534' },
  critical: { bg: '#FDECEC', text: '#B91C1C', dot: '#DC2626' },
  neutral: { bg: '#EEF2F6', text: '#475569', dot: '#94A3B8' },
};

/** Booking status badge (spec 3.1 colours). */
export function StatusPill({ status }: { status: string }) {
  return <Pill {...statusMeta(status)} />;
}

/** A delivery's status badge, in the same colours. */
export function DeliveryPill({ status }: { status: string }) {
  return <Pill {...deliveryMeta(status)} />;
}

export function Pill({ label, tone }: { label: string; tone: StatusTone }) {
  const c = PILL[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot }} />
      <P className="text-micro font-semibold uppercase tracking-[.04em]" style={{ color: c.text }}>
        {label}
      </P>
    </View>
  );
}

/* ------------------------------------------------------------- Tubes */

/** Coloured tube marker; urine is drawn as an amber container. */
export function TubeDot({ color, size = 12 }: { color: string; size?: number }) {
  const urine = color === 'urine';
  return (
    <View
      style={{
        width: size,
        height: urine ? size : size * 1.45,
        borderRadius: urine ? 4 : size / 2,
        backgroundColor: urine ? '#F5D27A' : tubeColour(color),
        borderWidth: urine ? 1 : 0,
        borderColor: '#D9A21B',
      }}
    />
  );
}

export function TubeChip({ color, label }: { color: string; label: string }) {
  return (
    <Span className="flex-row items-center gap-1.5 rounded-chip bg-ink-50 px-2.5 py-1">
      <TubeDot color={color} size={8} />
      <Span className="text-caption font-medium text-ink-700">{label}</Span>
    </Span>
  );
}

/** Cash on collection / Paid online / nothing (spec 4.4). */
export function PaymentChip({ booking, past = false }: { booking: Booking; past?: boolean }) {
  const cash = String(booking.payment_type).toUpperCase() === 'CASH';
  if (cash && !past) {
    return (
      <Span className="flex-row items-center gap-1.5 rounded-chip bg-caution-50 px-2.5 py-1">
        <Banknote className="h-[13px] w-[13px] text-caution-700" strokeWidth={2.2} />
        <Span className="text-caption font-semibold text-caution-700">Cash on collection · {rupee(booking.amount)}</Span>
      </Span>
    );
  }
  if (booking.payment_status === 1) {
    return (
      <Span className="flex-row items-center gap-1.5 rounded-chip bg-vital-50 px-2.5 py-1">
        {cash ? <Banknote className="h-[13px] w-[13px] text-vital-700" strokeWidth={2.2} /> : <CreditCard className="h-[13px] w-[13px] text-vital-700" strokeWidth={2.2} />}
        <Span className="text-caption font-semibold text-vital-700">
          {past ? (cash ? 'Cash collected' : 'Paid online') : `Paid online · ${rupee(booking.amount)}`}
        </Span>
      </Span>
    );
  }
  return past ? (
    <Span className="rounded-chip bg-ink-50 px-2.5 py-1 text-caption font-semibold text-ink-600">{rupee(booking.amount)}</Span>
  ) : null;
}

/* ------------------------------------------------------- Directions */

/** Google Maps directions to the pin, else a search on the address (spec 4.4). */
export function openDirections(b: Booking) {
  return openMaps({ lat: b.latitude ?? b.user?.latitude, lng: b.longitude ?? b.user?.longitude, address: addressLine(b) });
}

/** Directions for a delivery: to the pharmacy until it's picked up, then to the patient. */
export function openDeliveryDirections(d: Delivery, to: 'pickup' | 'drop' = d.nextStep === 'pick_up' || d.nextStep === 'return_to_pharmacy' ? 'pickup' : 'drop') {
  if (to === 'pickup') return openMaps({ lat: d.pickup?.lat, lng: d.pickup?.lng, address: d.pickup ? `${d.pickup.name}, ${pickupLine(d)}` : '' });
  return openMaps({ lat: d.drop.lat, lng: d.drop.lng, address: dropLine(d) });
}

async function openMaps({ lat, lng, address: addr }: { lat?: string | number | null; lng?: string | number | null; address: string }) {
  let url: string | null = null;
  if (lat && lng) url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  else if (addr) url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  if (!url) {
    showToast('Address unavailable for directions', 'critical');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    showToast('Couldn’t open Maps', 'critical');
  }
}

/* ------------------------------------------------------------- Calls */

let callInFlight = false;

/**
 * Call the patient with audit logging: INITIATED, then SUCCESS or FAILED. Demo: the
 * spec's server-bridged call. Live: the phone dials the booking's contact number.
 * Logging never blocks the agent; only one call at a time.
 */
export function useCallPatient() {
  const [calling, setCalling] = useState<number | null>(null);
  const call = async (b: Booking) => {
    if (callInFlight) return false;
    callInFlight = true;
    setCalling(b.id);
    Bookings.callLog(b.id, 'INITIATED').catch(() => undefined);
    try {
      const res = await Bookings.callPatient(b.id);
      if (res.code === 0 && LIVE) {
        // Live: no bridged calling; the phone dials the collection contact.
        const phone = (res.data as { phone?: string } | undefined)?.phone;
        const opened = phone ? await Linking.openURL(`tel:${phone}`).then(() => true, () => false) : false;
        Bookings.callLog(b.id, opened ? 'SUCCESS' : 'FAILED', opened ? undefined : 'Couldn’t open the dialer').catch(() => undefined);
        if (!opened) showToast('Couldn’t open the dialer', 'critical');
        return opened;
      }
      if (res.code === 0) {
        Bookings.callLog(b.id, 'SUCCESS').catch(() => undefined);
        showToast('Call initiated. Your phone will ring shortly.', 'success');
        return true;
      }
      Bookings.callLog(b.id, 'FAILED', res.message).catch(() => undefined);
      showToast(res.message || 'Couldn’t place the call', 'critical');
      return false;
    } finally {
      callInFlight = false;
      setCalling(null);
    }
  };
  return { calling, call };
}

/**
 * Call the patient of a delivery (or its pharmacy), logged like booking calls. The patient's
 * number comes from the server, which shares it only while the delivery is yours and out.
 */
export function useCallDelivery() {
  const [calling, setCalling] = useState<string | null>(null);
  const dial = (phone: string) => Linking.openURL(`tel:${phone}`).then(() => true, () => false);
  const call = async (d: Delivery) => {
    if (callInFlight) return false;
    callInFlight = true;
    setCalling(d.code);
    Deliveries.callLog(d.code, 'INITIATED').catch(() => undefined);
    try {
      const res = await Deliveries.callPatient(d.code);
      const phone = res.code === 0 ? res.data?.phone : undefined;
      const opened = phone ? await dial(phone) : false;
      Deliveries.callLog(d.code, opened ? 'SUCCESS' : 'FAILED', opened ? undefined : (res.message ?? 'Couldn’t open the dialer')).catch(() => undefined);
      if (!opened) showToast(res.code === 0 ? 'Couldn’t open the dialer' : res.message || 'Couldn’t place the call', 'critical');
      return opened;
    } finally {
      callInFlight = false;
      setCalling(null);
    }
  };
  /** The pharmacy's own number (not logged: it isn't a patient call). */
  const callPharmacy = async (d: Delivery) => {
    if (!d.pickup?.phone) return showToast('No phone number for this pharmacy', 'critical');
    if (!(await dial(d.pickup.phone))) showToast('Couldn’t open the dialer', 'critical');
  };
  return { calling, call, callPharmacy };
}

/** Round action button used on booking cards (Directions / Call). */
export function CardAction({ icon, label, onPress, busy, tone = 'neutral' }: { icon: React.ReactNode; label: string; onPress: () => void; busy?: boolean; tone?: 'neutral' | 'brand' }) {
  return (
    <Btn
      onPress={busy ? undefined : onPress}
      accessibilityLabel={label}
      className={`tap flex-1 flex-row h-[42px] items-center justify-center gap-2 rounded-ctl ${tone === 'brand' ? 'bg-brand-50' : 'bg-ink-50'}`}
    >
      {busy ? <Loader2 className="h-[16px] w-[16px] animate-spinSlow text-brand-600" strokeWidth={2.4} /> : icon}
      <Span className={`text-body-sm font-semibold ${tone === 'brand' ? 'text-brand-700' : 'text-ink-700'}`}>{label}</Span>
    </Btn>
  );
}

export const DirectionsIcon = () => <Navigation className="h-[16px] w-[16px] text-ink-700" strokeWidth={2.2} />;
export const CallIcon = () => <Phone className="h-[16px] w-[16px] text-brand-700" strokeWidth={2.2} />;

/** Countdown shown while the server connects a call (spec 8.2, default 30 s). */
export function CallCountdownModal({ booking, visible, seconds = 30, onClose }: { booking: Booking | null; visible: boolean; seconds?: number; onClose: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (!visible) return;
    setLeft(seconds);
    const t = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [visible, seconds]);
  useEffect(() => {
    if (visible && left === 0) onClose();
  }, [left, visible, onClose]);
  return (
    <RNModal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <FrameBox>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: 'rgba(7,23,36,0.42)' }}>
          <Div className="w-full max-w-[420px] rounded-[22px] bg-white p-6 shadow-lift">
            <Div className="items-center">
              <Span className="flex-col h-[64px] w-[64px] items-center justify-center rounded-full bg-brand-50">
                <PhoneCall className="h-[28px] w-[28px] text-brand-600" strokeWidth={2.1} />
              </Span>
              <P className="mt-4 text-title-md text-ink-900">Connecting your call</P>
              <P className="mt-1.5 text-center text-body text-ink-500">
                KDC+ is calling you first, then {booking?.user.name ?? 'the customer'}. Neither side sees the other’s number.
              </P>
              <P className="mt-5 font-display text-[40px] font-extrabold tabular-nums text-brand-600">{left}s</P>
              <P className="text-caption text-ink-400">Answer when your phone rings</P>
            </Div>
            <Div className="mt-6">
              <Button variant="tertiary" size="md" onClick={onClose}>Close</Button>
            </Div>
          </Div>
        </View>
      </FrameBox>
    </RNModal>
  );
}

/* ----------------------------------------------------------- Dialogs */

/** Shared confirm dialog: title, message, confirm/cancel, loading and destructive styles. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  icon,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <RNModal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={loading ? undefined : onCancel}>
      <FrameBox>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: 'rgba(7,23,36,0.42)' }}>
          <Div className="w-full max-w-[420px] rounded-[22px] bg-white p-6 text-center shadow-lift">
            <Span
              className={`mx-auto flex-col h-[58px] w-[58px] items-center justify-center rounded-[20px] ${
                destructive ? 'bg-critical-50 text-critical-600' : 'bg-brand-50 text-brand-600'
              }`}
            >
              {icon ?? (destructive ? <AlertTriangle className="h-[26px] w-[26px]" strokeWidth={2.2} /> : <CheckCircle2 className="h-[26px] w-[26px]" strokeWidth={2.2} />)}
            </Span>
            <P className="mt-4 text-title-md text-ink-900">{title}</P>
            {message ? <P className="mt-2 text-body leading-[21px] text-ink-500">{message}</P> : null}
            <Div className="mt-6 gap-2.5">
              <Button variant={destructive ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
                {confirmLabel}
              </Button>
              <Button variant="text" size="md" disabled={loading} onClick={onCancel}>
                {cancelLabel}
              </Button>
            </Div>
          </Div>
        </View>
      </FrameBox>
    </RNModal>
  );
}

/* --------------------------------------------------------- App-wide */

/** Full-screen cover whenever the device is offline, with a Retry (spec 10.3). */
export function OfflineOverlay() {
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        setOffline(s.isConnected === false || s.isInternetReachable === false);
      }),
    [],
  );
  if (!offline) return null;
  const retry = async () => {
    setChecking(true);
    const s = await NetInfo.refresh();
    setOffline(s.isConnected === false || s.isInternetReachable === false);
    setChecking(false);
  };
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <Span className="flex-col h-[76px] w-[76px] items-center justify-center rounded-[24px] bg-ink-50">
        <WifiOff className="h-[32px] w-[32px] text-ink-500" strokeWidth={2} />
      </Span>
      <P className="mt-5 text-title-md text-ink-900">You’re offline</P>
      <P className="mt-2 max-w-[340px] text-center text-body text-ink-500">
        Bookings, scans and payments need a connection. Your work so far is safe on the server.
      </P>
      <Div className="mt-7 w-full max-w-[320px]">
        <Button loading={checking} onClick={retry} icon={<RefreshCw className="h-[18px] w-[18px] text-white" strokeWidth={2.4} />}>
          Retry
        </Button>
      </Div>
    </View>
  );
}

/** Foreground push shown as a heads-up card; tap routes like a notification tap. */
export function HeadsUpBanner() {
  const n = useHeadsUp((s) => s.current);
  const dismiss = useHeadsUp((s) => s.dismiss);
  if (!n) return null;
  return (
    <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(180)} style={{ position: 'absolute', left: 12, right: 12, top: DEVICE.safeTop + 6, zIndex: 150, alignItems: 'center' }}>
      <Btn onPress={() => openFromPush(n)} className="tap w-full max-w-[560px] flex-row items-start gap-3 rounded-tile bg-white p-3.5 text-left shadow-lift">
        <Span className="flex-col h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[11px] bg-brand-600">
          <Bell className="h-[18px] w-[18px] text-white" strokeWidth={2.2} />
        </Span>
        <Div className="min-w-0 flex-1">
          <P className="text-caption font-semibold uppercase tracking-[.06em] text-ink-400">KDC+ Agent · now</P>
          <P className="mt-0.5 text-body font-semibold text-ink-900">{n.title}</P>
          <P className="mt-0.5 text-body-sm text-ink-500" numberOfLines={2}>{n.message}</P>
        </Div>
        <Btn onPress={dismiss} accessibilityLabel="Dismiss" className="tap -mr-1 flex-col h-[28px] w-[28px] items-center justify-center rounded-full bg-ink-50">
          <X className="h-[14px] w-[14px] text-ink-500" strokeWidth={2.6} />
        </Btn>
      </Btn>
    </Animated.View>
  );
}

/* ------------------------------------------------------------ Layout */

/** Columns for lists: 1 on phones, 2 on tablets, 3 on large landscape tablets. */
export function useColumns() {
  const { width } = useWindowDimensions();
  return width >= 1100 ? 3 : width >= 700 ? 2 : 1;
}

/** Lays items out in equal columns on tablets (spec: responsive grid). */
export function Grid<T>({ items, render, keyOf, gap = 12 }: { items: T[]; render: (item: T) => React.ReactNode; keyOf: (item: T) => string; gap?: number }) {
  const cols = useColumns();
  if (cols === 1) return <View style={{ gap }}>{items.map((it) => <View key={keyOf(it)}>{render(it)}</View>)}</View>;
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={{ gap }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap }}>
          {row.map((it) => <View key={keyOf(it)} style={{ flex: 1 }}>{render(it)}</View>)}
          {Array.from({ length: cols - row.length }).map((_, j) => <View key={`pad${j}`} style={{ flex: 1 }} />)}
        </View>
      ))}
    </View>
  );
}

/** Shakes its child when `trigger` changes (pending rows on an early Proceed). */
export function Shake({ trigger, children }: { trigger: number; children: React.ReactNode }) {
  const x = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (!trigger) return;
    RNAnimated.sequence([10, -10, 7, -7, 3, 0].map((v) => RNAnimated.timing(x, { toValue: v, duration: 55, useNativeDriver: true }))).start();
  }, [trigger, x]);
  return <RNAnimated.View style={{ transform: [{ translateX: x }] }}>{children}</RNAnimated.View>;
}
