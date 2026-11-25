/** Booking Details (spec 8.2). */
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, Div, P, Span } from '../components/primitives/index';
import { Banknote, CalendarDays, ChevronDown, ChevronUp, Clock, MapPin, Navigation, Phone, ScanLine, TestTubes, Users, X } from '../components/primitives/icons';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/Nav';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Display';
import { Banner, Skeleton, StateBlock } from '../components/ui/Feedback';
import { CallCountdownModal, openDirections, PaymentChip, StatusPill, TubeDot, useCallPatient } from '../components/agent';
import { ScannerModal } from '../components/agent/Scanner';
import { useNav, useParams } from '../navigation/navigation';
import { useFocusFetch } from '../hooks/useFocusFetch';
import { Bookings, LIVE } from '../api/endpoints';
import { showToast } from '../store/toast';
import {
  addressLine, ageFromDob, cashDuePending, formatDate, isClosed, normaliseStatus, resolveTime, rupee, tubeSlots, type TubeSlot,
} from '../domain/rules';

export function BookingDetailsScreen() {
  const nav = useNav();
  const { bookingId } = useParams<'booking-details'>();
  const { data: b, loading, error, reload } = useFocusFetch(() => Bookings.details(bookingId));
  const { call } = useCallPatient();
  const [countdown, setCountdown] = useState(false);
  const [scanned, setScanned] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState<TubeSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const slots = b ? tubeSlots(b) : [];
  const closed = b ? isClosed(b.booking_status) : true;
  const status = b ? normaliseStatus(b.booking_status) : '';
  const canScan = b ? status === 'ONGOING' : false;

  useEffect(() => {
    if (!b) return;
    const pre: Record<string, string> = {};
    for (const s of slots) {
      const hit = b.user.samples?.find((x) => x.color === s.color && x.sample_id);
      if (hit) pre[s.key] = hit.sample_id;
    }
    setScanned((cur) => ({ ...pre, ...cur }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b]);

  const startCall = useCallback(async () => {
    if (!b) return;
    // Live builds hand the number to the phone's dialer, so there's nothing to count down;
    // the countdown is only for bridged calls (demo backend), where the server rings the agent.
    if (!LIVE) setCountdown(true);
    const ok = await call(b);
    if (!ok) setCountdown(false);
  }, [b, call]);

  const submit = async () => {
    if (!b) return;
    if (cashDuePending(b)) {
      showToast(`Collect the pending payment of ${rupee(b.cash_due)} for the added patient first.`, 'caution');
      return;
    }
    if (slots.some((s) => !scanned[s.key])) {
      showToast('Scan every tube before submitting', 'caution');
      return;
    }
    setSubmitting(true);
    const res = await Bookings.uploadSamples(b.booking_id, slots.map((s) => ({ sample_id: scanned[s.key], color: s.color })));
    setSubmitting(false);
    if (res.code === 0) {
      showToast('Samples uploaded', 'success');
      reload();
    } else showToast(res.message || 'Couldn’t upload samples', 'critical');
  };

  if (loading || !b) {
    return (
      <Screen>
        <ScreenHeader title="Booking details" subtitle={bookingId} />
        <Div className="gap-3 p-4">
          {error ? (
            <StateBlock icon={<X className="h-[26px] w-[26px]" strokeWidth={2.2} />} tone="critical" title="Couldn’t load the booking" body={error} primary={<Button size="md" onClick={() => reload('initial')}>Try again</Button>} />
          ) : (
            <>
              <Skeleton className="h-[150px] w-full" rounded={18} />
              <Skeleton className="h-[220px] w-full" rounded={18} />
            </>
          )}
        </Div>
      </Screen>
    );
  }

  const others = b.others ?? [];
  const done = slots.filter((s) => scanned[s.key]).length;

  return (
    <Screen>
      <ScreenHeader title="Booking details" subtitle={b.booking_id} />
      <Div className="mx-auto w-full max-w-[760px] gap-3.5 px-4 pb-12 pt-4">
        {/* Header card */}
        <Card elevation="card">
          <Div className="flex-row items-center justify-between">
            <P className="text-caption font-semibold tabular-nums text-ink-400">{b.booking_id}</P>
            <StatusPill status={b.booking_status} />
          </Div>
          <Div className="mt-2.5 flex-row flex-wrap gap-x-4 gap-y-1.5">
            <Meta icon={<CalendarDays className="h-[14px] w-[14px] text-ink-400" strokeWidth={2.2} />} text={formatDate(b.booking_date)} />
            <Meta icon={<Clock className="h-[14px] w-[14px] text-ink-400" strokeWidth={2.2} />} text={resolveTime(b)} />
          </Div>
          <Div className="mt-3 flex-row flex-wrap gap-2">
            <PaymentChip booking={b} past={closed} />
          </Div>
          {normaliseStatus(b.booking_status) === 'ONGOING' && (
            <Div className="mt-3.5">
              <Button size="md" variant="secondary" onClick={() => nav.navigate('test-details', { params: { bookingId: b.booking_id } })}>
                Continue collection
              </Button>
            </Div>
          )}
        </Card>

        {cashDuePending(b) && !closed && (
          <Banner
            tone="caution"
            icon={<Banknote className="h-[18px] w-[18px] text-caution-700" strokeWidth={2.2} />}
            title={`Collect the pending payment of ${rupee(b.cash_due)} for the added patient first.`}
            action="Collect"
            onAction={() => nav.navigate('collect-payment', { params: { bookingId: b.booking_id, mode: 'cash_due', completeAfter: false, returnTo: 'booking-details' } })}
          />
        )}

        {/* Sample tubes */}
        <Card elevation="card">
          <Div className="flex-row items-center justify-between">
            <Div className="flex-row items-center gap-2">
              <TestTubes className="h-[18px] w-[18px] text-brand-600" strokeWidth={2.2} />
              <P className="text-title-sm text-ink-900">Sample Tubes</P>
            </Div>
            <Span className="rounded-chip bg-ink-50 px-2.5 py-1 text-caption font-bold tabular-nums text-ink-700">{done}/{slots.length}</Span>
          </Div>
          <Div className="mt-3 gap-2">
            {slots.map((s) => (
              <Div key={s.key} className="flex-row items-center gap-3 rounded-tile bg-ink-50 px-3 py-2.5">
                <TubeDot color={s.color} size={10} />
                <Div className="min-w-0 flex-1">
                  <P className="text-body-sm font-semibold text-ink-900">{s.name}{s.code ? <Span className="font-medium text-ink-400"> · {s.code}</Span> : null}</P>
                  {scanned[s.key] ? <P className="font-display text-body-sm font-bold tracking-[.04em] text-vital-700">{scanned[s.key]}</P> : <P className="text-caption text-ink-400">Not scanned</P>}
                </Div>
                {canScan && (
                  <Btn onPress={() => setScanning(s)} className="tap flex-row h-[34px] items-center gap-1.5 rounded-chip bg-white px-3">
                    <ScanLine className="h-[15px] w-[15px] text-brand-600" strokeWidth={2.4} />
                    <Span className="text-caption font-semibold text-brand-700">{scanned[s.key] ? 'Rescan' : 'Scan'}</Span>
                  </Btn>
                )}
              </Div>
            ))}
          </Div>
          {canScan && (
            <Div className="mt-3.5">
              <Button size="md" variant="success" loading={submitting} onClick={submit}>Submit samples</Button>
            </Div>
          )}
        </Card>

        {/* Plan */}
        <Card elevation="tile">
          <P className="text-caption font-semibold uppercase tracking-[.08em] text-ink-400">Plan</P>
          <P className="mt-1.5 text-title-sm text-ink-900">{b.plan_name}</P>
          <P className="mt-0.5 text-body-sm text-ink-500">{b.plan.plan_tests.length} tests · {rupee(b.amount)}</P>
        </Card>

        {/* Customer */}
        <Card elevation="tile">
          <P className="text-caption font-semibold uppercase tracking-[.08em] text-ink-400">Customer</P>
          <P className="mt-1.5 text-title-sm text-ink-900">{b.user.name}</P>
          <P className="mt-0.5 text-body-sm text-ink-500">
            {ageFromDob(b.user.dob) ?? '—'} yrs · {b.user.gender}
          </P>
          <Div className="mt-3 flex-row items-start gap-2.5">
            <MapPin className="mt-[2px] h-[15px] w-[15px] shrink-0 text-brand-600" strokeWidth={2.2} />
            <P className="min-w-0 flex-1 text-body-sm leading-[19px] text-ink-600">{addressLine(b)}</P>
          </Div>
          {!closed && (
            <Div className="mt-3.5 flex-row gap-2.5">
              <Div className="flex-1">
                <Button size="md" variant="tertiary" icon={<Navigation className="h-[16px] w-[16px] text-ink-800" strokeWidth={2.2} />} onClick={() => openDirections(b)}>
                  Directions
                </Button>
              </Div>
              <Div className="flex-1">
                <Button size="md" variant="secondary" icon={<Phone className="h-[16px] w-[16px] text-brand-700" strokeWidth={2.2} />} onClick={startCall}>
                  Call
                </Button>
              </Div>
            </Div>
          )}
        </Card>

        {/* Other patients */}
        {others.length > 0 && (
          <Card elevation="tile">
            <Div className="flex-row items-center gap-2">
              <Users className="h-[16px] w-[16px] text-ink-400" strokeWidth={2.2} />
              <P className="text-caption font-semibold uppercase tracking-[.08em] text-ink-400">Other patients</P>
            </Div>
            <Div className="mt-2">
              {others.map((o, i) => (
                <Div key={o.id} className={`flex-row items-center justify-between py-2.5 ${i ? 'border-t-[0.5px] border-ink-900/10' : ''}`}>
                  <P className="text-body font-semibold text-ink-900">{o.full_name}</P>
                  <P className="text-body-sm text-ink-500">{ageFromDob(o.dob) ?? '—'} yrs · {o.gender}</P>
                </Div>
              ))}
            </Div>
          </Card>
        )}

        {/* Tests accordion */}
        <Card elevation="tile" padded={false}>
          <P className="px-4 pb-1 pt-4 text-caption font-semibold uppercase tracking-[.08em] text-ink-400">Tests</P>
          {b.plan.plan_tests.map((t, i) => {
            const isOpen = open === t.id;
            return (
              <View key={t.id}>
                <Btn onPress={() => setOpen(isOpen ? null : t.id)} className={`tap flex-row items-center gap-3 px-4 py-3 text-left ${i ? 'border-t-[0.5px] border-ink-900/10' : ''}`}>
                  <Div className="min-w-0 flex-1">
                    <P className="text-body font-semibold text-ink-900">{t.name}</P>
                    <P className="text-caption text-ink-400">{t.tests_names.length} parameters</P>
                  </Div>
                  {isOpen ? <ChevronUp className="h-[18px] w-[18px] text-ink-400" strokeWidth={2.2} /> : <ChevronDown className="h-[18px] w-[18px] text-ink-400" strokeWidth={2.2} />}
                </Btn>
                {isOpen && (
                  <Div className="gap-1.5 bg-ink-50/60 px-4 pb-3.5 pt-1">
                    {t.tests_names.map((n) => (
                      <Div key={n} className="flex-row items-center gap-2.5">
                        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#90A4B6' }} />
                        <P className="text-body-sm text-ink-600">{n}</P>
                      </Div>
                    ))}
                  </Div>
                )}
              </View>
            );
          })}
        </Card>
      </Div>

      <ScannerModal
        visible={Boolean(scanning)}
        tube={scanning ? { name: scanning.name, color: scanning.color } : null}
        onClose={() => setScanning(null)}
        onConfirm={(id) => {
          if (scanning) setScanned((cur) => ({ ...cur, [scanning.key]: id }));
          setScanning(null);
        }}
      />
      <CallCountdownModal booking={b} visible={countdown} onClose={() => setCountdown(false)} />
    </Screen>
  );
}

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon}
      <P className="text-body-sm text-ink-600">{text}</P>
    </View>
  );
}
