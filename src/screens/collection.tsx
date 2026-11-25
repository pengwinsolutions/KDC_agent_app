/** Test Details, Add Patient and Sample collection (spec 4.5–4.7, 6). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { create } from 'zustand';
import { Btn, Div, P, Span, TextField } from '../components/primitives/index';
import {
  AlertTriangle, Banknote, CalendarDays, Check, CheckCircle2, ChevronRight, FlaskConical, MapPin, Navigation, Phone, ScanLine,
  TestTubes, UserPlus, X,
} from '../components/primitives/icons';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/Nav';
import { Button, StickyBar } from '../components/ui/Button';
import { Card } from '../components/ui/Display';
import { Banner, ModalSheet, Skeleton, StateBlock } from '../components/ui/Feedback';
import { ConfirmDialog, openDirections, Shake, StatusPill, TubeDot, useCallPatient } from '../components/agent';
import { ScannerModal } from '../components/agent/Scanner';
import { useNav, useParams } from '../navigation/navigation';
import { useFocusFetch } from '../hooks/useFocusFetch';
import { Bookings } from '../api/endpoints';
import { showToast } from '../store/toast';
import type { Booking } from '../domain/types';
import {
  addressLine, ageFromDob, cashDuePending, dobFromAge, formatDate, isPatientDone, patientsOf, proceedCase, resolveTime, rupee,
  testCount, tubeColour, tubeSlots, type PatientRef, type TubeSlot,
} from '../domain/rules';

/** Patients the sample screen just reported as collected (spec: justCollectedKey). */
const useJustCollected = create<{ keys: Record<string, string[]>; add: (bookingId: string, key: string) => void }>((set) => ({
  keys: {},
  add: (bookingId, key) => set((s) => ({ keys: { ...s.keys, [bookingId]: [...(s.keys[bookingId] ?? []), key] } })),
}));

/** Cash due cleared locally right after collection, before the reload returns. */
const useDueCleared = create<{ ids: string[]; clear: (id: string) => void }>((set) => ({
  ids: [],
  clear: (id) => set((s) => ({ ids: [...s.ids, id] })),
}));
export const markDueCleared = (bookingId: string) => useDueCleared.getState().clear(bookingId);

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/* ======================================================= Test Details */

export function TestDetailsScreen() {
  const nav = useNav();
  const { bookingId, justCollectedKey } = useParams<'test-details'>();
  const { data, loading, error, reload } = useFocusFetch(() => Bookings.active(bookingId));
  const booking: Booking | undefined = (data as Booking[] | null)?.[0];
  const collectedKeys = useJustCollected((s) => s.keys[bookingId]);
  const dueClearedLocal = useDueCleared((s) => s.ids.includes(bookingId));
  const { calling, call } = useCallPatient();
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [shake, setShake] = useState(0);

  const just = useMemo(() => new Set([...(collectedKeys ?? []), ...(justCollectedKey ? [justCollectedKey] : [])]), [collectedKeys, justCollectedKey]);
  const patients = booking ? patientsOf(booking) : [];
  const done = patients.filter((p) => isPatientDone(p, just)).length;
  const total = patients.length;
  const allDone = total > 0 && done === total;
  const duePending = booking ? cashDuePending(booking) && !dueClearedLocal : false;

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Collection" subtitle={bookingId} />
        <Div className="gap-3 p-4">
          <Skeleton className="h-[170px] w-full" rounded={18} />
          <Skeleton className="h-[260px] w-full" rounded={18} />
        </Div>
      </Screen>
    );
  }
  if (!booking) {
    return (
      <Screen>
        <ScreenHeader title="Collection" subtitle={bookingId} />
        <Div className="p-6">
          <StateBlock
            icon={<X className="h-[26px] w-[26px]" strokeWidth={2.2} />}
            tone="critical"
            title="Booking not available"
            body={error ?? 'This booking is no longer active.'}
            primary={<Button size="md" onClick={() => nav.resetTo('home')}>Back to bookings</Button>}
          />
        </Div>
      </Screen>
    );
  }

  const pcase = proceedCase(booking, dueClearedLocal);
  const proceed = () => {
    if (!allDone) {
      setShake((n) => n + 1);
      showToast(`Scan samples for ${total - done} more ${total - done === 1 ? 'patient' : 'patients'}`, 'caution');
      return;
    }
    // Cash to collect: straight to Collect Cash, which has its own checklist and final confirm.
    if (pcase === 'cash' || pcase === 'cash_due') {
      nav.navigate('collect-payment', { params: { bookingId: booking.booking_id, mode: pcase === 'cash' ? 'booking' : 'cash_due', completeAfter: true } });
      return;
    }
    setConfirm(true);
  };

  /** Only a prepaid booking gets here: completing it closes the booking and sends the samples to the lab. */
  const onConfirm = async () => {
    setCompleting(true);
    const res = await Bookings.setStatus(booking.id, 'COMPLETED');
    setCompleting(false);
    setConfirm(false);
    if (res.code === 0) {
      showToast('Booking completed', 'success');
      nav.resetTo('home');
    } else if (res.code === 2) {
      showToast(res.message || 'Collect the added-patient payment first', 'caution');
      nav.navigate('collect-payment', { params: { bookingId: booking.booking_id, mode: 'cash_due', completeAfter: true } });
    } else showToast(res.message || 'Couldn’t complete the booking', 'critical');
  };

  const dialog = { title: 'Complete this booking?', message: 'All samples are scanned and uploaded. The booking will close and the samples go to the lab.', label: 'Complete booking' };

  return (
    <Screen padBottom={false}>
      <ScreenHeader
        title="Collection"
        subtitle={booking.booking_id}
        backTo="home"
        right={
          <Btn onPress={() => call(booking)} accessibilityLabel="Call customer" className="tap flex-col h-[38px] w-[38px] items-center justify-center rounded-full bg-brand-50">
            <Phone className="h-[18px] w-[18px] text-brand-600" strokeWidth={2.2} />
          </Btn>
        }
      />
      <Div className="gap-3.5 px-4 pb-[150px] pt-4">
        {/* Summary */}
        <Card elevation="card">
          <Div className="flex-row items-center justify-between">
            <P className="text-caption font-semibold tabular-nums text-ink-400">{booking.booking_id}</P>
            <StatusPill status="ONGOING" />
          </Div>
          <P className="mt-2 text-title-sm text-ink-900">{booking.plan_name}</P>
          <Div className="mt-2.5 flex-row flex-wrap gap-x-4 gap-y-1.5">
            <Div className="flex-row items-center gap-1.5">
              <CalendarDays className="h-[14px] w-[14px] text-ink-400" strokeWidth={2.2} />
              <Span className="text-body-sm text-ink-600">{formatDate(booking.booking_date)} · {resolveTime(booking)}</Span>
            </Div>
            <Div className="flex-row items-center gap-1.5">
              <FlaskConical className="h-[14px] w-[14px] text-ink-400" strokeWidth={2.2} />
              <Span className="text-body-sm text-ink-600">{testCount(booking)} tests</Span>
            </Div>
          </Div>
          <Div className="mt-3.5 flex-row items-center gap-3 rounded-tile bg-ink-50 p-3">
            <MapPin className="h-[16px] w-[16px] shrink-0 text-brand-600" strokeWidth={2.2} />
            <P className="min-w-0 flex-1 text-body-sm leading-[19px] text-ink-600">{addressLine(booking)}</P>
            <Btn onPress={() => openDirections(booking)} accessibilityLabel="Directions" className="tap flex-col h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-white">
              <Navigation className="h-[16px] w-[16px] text-brand-600" strokeWidth={2.2} />
            </Btn>
          </Div>
          {calling === booking.id && <P className="mt-2 text-caption text-brand-600">Placing call…</P>}
        </Card>

        {/* Added-patient payment gate */}
        {duePending ? (
          <Banner
            tone="caution"
            icon={<Banknote className="h-[18px] w-[18px] text-caution-700" strokeWidth={2.2} />}
            title={`${rupee(booking.cash_due)} to collect for the added patient`}
            body="Not covered by the online payment. You’ll be taken to payment after all samples are collected."
            action="Collect now"
            onAction={() => nav.navigate('collect-payment', { params: { bookingId: booking.booking_id, mode: 'cash_due', completeAfter: false, returnTo: 'test-details' } })}
          />
        ) : booking.cash_due > 0 ? (
          <Banner tone="success" icon={<CheckCircle2 className="h-[18px] w-[18px] text-vital-700" strokeWidth={2.2} />} title={`${rupee(booking.cash_due)} collected for the added patient`} />
        ) : null}

        {/* Patients */}
        <Card elevation="card">
          <Div className="flex-row items-end justify-between">
            <Div>
              <P className="text-title-sm text-ink-900">Patient Details</P>
              <P className="mt-0.5 text-body-sm text-ink-500">{total} {total === 1 ? 'patient' : 'patients'} on this booking</P>
            </Div>
            <P className={`font-display text-[20px] font-extrabold tabular-nums ${allDone ? 'text-vital-600' : 'text-brand-600'}`}>
              {total ? Math.round((done / total) * 100) : 0}%
            </P>
          </Div>
          <Progress pct={total ? done / total : 0} />
          <P className="mt-2 text-caption text-ink-500">{done} of {total} samples collected</P>

          <Div className="mt-3.5 gap-2.5">
            {patients.map((p) => {
              const isDone = isPatientDone(p, just);
              const row = <PatientRow p={p} done={isDone} onPress={() => nav.navigate('sample', { params: { bookingId: booking.booking_id, patientKey: p.key } })} />;
              return isDone ? <View key={p.key}>{row}</View> : <Shake key={p.key} trigger={shake}>{row}</Shake>;
            })}
          </Div>

          <Btn onPress={() => setAdding(true)} className="tap mt-3 flex-row items-center gap-3 rounded-tile border border-dashed border-brand-200 bg-brand-50/50 p-3.5 text-left">
            <Span className="flex-col h-[38px] w-[38px] items-center justify-center rounded-full bg-brand-600">
              <UserPlus className="h-[18px] w-[18px] text-white" strokeWidth={2.2} />
            </Span>
            <Div className="min-w-0 flex-1">
              <P className="text-body font-semibold text-brand-700">Add Patient</P>
              <P className="text-caption text-ink-500">Someone else at this address wants the same tests</P>
            </Div>
            <ChevronRight className="h-[18px] w-[18px] text-brand-400" strokeWidth={2.2} />
          </Btn>
        </Card>
      </Div>

      <StickyBar>
        <P className="text-center text-body-sm font-semibold text-ink-700">
          {allDone ? 'All samples collected' : `${done} of ${total} patients done`}
        </P>
        {!allDone && <P className="mt-0.5 text-center text-caption text-ink-400">Tap a patient above to scan their samples</P>}
        <Div className="mt-2.5">
          <Button onClick={proceed} className={allDone ? '' : 'opacity-50'} icon={allDone ? <Check className="h-[18px] w-[18px] text-white" strokeWidth={2.8} /> : undefined}>
            {allDone ? 'Proceed' : 'Collect Samples'}
          </Button>
        </Div>
      </StickyBar>

      <AddPatientSheet visible={adding} booking={booking} onClose={() => setAdding(false)} onAdded={() => reload()} />
      <ConfirmDialog
        visible={confirm}
        title={dialog.title}
        message={dialog.message}
        confirmLabel={dialog.label}
        loading={completing}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(false)}
      />
    </Screen>
  );
}

function Progress({ pct }: { pct: number }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: pct, duration: 500, useNativeDriver: false }).start();
  }, [pct, w]);
  return (
    <View style={{ marginTop: 12, height: 8, borderRadius: 4, backgroundColor: '#EDF2F7', overflow: 'hidden' }}>
      <Animated.View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: pct >= 1 ? '#16A34A' : '#0068C8',
          width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

function PatientRow({ p, done, onPress }: { p: PatientRef; done: boolean; onPress: () => void }) {
  const age = ageFromDob(p.dob);
  return (
    <Btn onPress={onPress} className={`tap flex-row items-center gap-3 rounded-tile p-3 text-left ${done ? 'bg-vital-50/60' : 'bg-ink-50'}`}>
      <Span className={`flex-col h-[42px] w-[42px] items-center justify-center rounded-full ${done ? 'bg-vital-600' : 'bg-white'}`}>
        {done ? <Check className="h-[20px] w-[20px] text-white" strokeWidth={3} /> : <Span className="text-body-sm font-bold text-ink-700">{initials(p.name)}</Span>}
      </Span>
      <Div className="min-w-0 flex-1">
        <Div className="flex-row items-center gap-2">
          <P className="text-body font-semibold text-ink-900" numberOfLines={1}>{p.name}</P>
          {p.key === 'user-primary' && <Span className="rounded-[6px] bg-white px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-[.06em] text-ink-500">Booked by</Span>}
          {p.addedByAgent && <Span className="rounded-[6px] bg-caution-50 px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-[.06em] text-caution-700">Added</Span>}
        </Div>
        <P className="mt-0.5 text-body-sm text-ink-500">
          {age !== null ? `${age} yrs` : '—'} · {p.gender}
        </P>
        {p.mobile ? <P className="mt-0.5 text-caption text-ink-400">Notified on +91 {p.mobile}</P> : null}
      </Div>
      <Span className={`rounded-chip px-2.5 py-1 text-caption font-bold ${done ? 'bg-vital-600 text-white' : 'bg-caution-50 text-caution-700'}`}>
        {done ? 'Done' : 'Pending'}
      </Span>
    </Btn>
  );
}

/* ======================================================= Add Patient */

function AddPatientSheet({ visible, booking, onClose, onAdded }: { visible: boolean; booking: Booking; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | ''>('');
  const [age, setAge] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setMobile('');
      setGender('');
      setAge('');
      setErrors({});
    }
  }, [visible]);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Enter patient name';
    if (mobile && mobile.length !== 10) e.mobile = 'Enter a 10-digit mobile number';
    if (!gender) e.gender = 'Select gender';
    const n = Number(age);
    if (!age || !Number.isFinite(n) || n < 0 || n > 120) e.age = 'Enter age in years';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const res = await Bookings.addPatients(booking.id, [{ full_name: name.trim(), gender, dob: dobFromAge(n), patient_mobile: mobile }]);
    setSaving(false);
    if (res.code !== 0) {
      showToast(res.message || 'Couldn’t add the patient', 'critical');
      return;
    }
    const after = res.data;
    if (after && cashDuePending(after)) showToast(`Patient added · ${rupee(after.cash_due)} to collect after the samples`, 'caution');
    else showToast('Patient added', 'success');
    onClose();
    onAdded();
  };

  const price = booking.per_patient_price;
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Add Patient"
      subtitle={booking.plan_name}
      footer={<Button loading={saving} onClick={submit}>Add patient</Button>}
    >
      <Div className="gap-4 pb-2">
        {price ? (
          <Banner
            tone="brand"
            icon={<AlertTriangle className="h-[17px] w-[17px] text-brand-700" strokeWidth={2.2} />}
            title={`${rupee(price)} for this patient`}
            body={booking.payment_type === 'CASH' ? 'Added to the cash you collect for this booking.' : 'Not covered by the online payment; collect it after the samples.'}
          />
        ) : null}
        <SheetField label="Full name" required error={errors.name}>
          <TextField value={name} onChangeText={setName} placeholder="As on ID" className={fieldCls(errors.name)} />
        </SheetField>
        <SheetField label="Patient mobile" hint="Reports for this patient go here. Leave blank to use the booking owner’s number." error={errors.mobile}>
          <TextField value={mobile} keyboardType="number-pad" maxLength={10} onChangeText={(v: string) => setMobile(v.replace(/\D/g, '').slice(0, 10))} placeholder="Optional" className={fieldCls(errors.mobile)} />
        </SheetField>
        <Div className="flex-row gap-3">
          <Div className="flex-1">
            <SheetField label="Gender" required error={errors.gender}>
              <Div className="flex-row gap-2">
                {(['Male', 'Female'] as const).map((g) => (
                  <Btn
                    key={g}
                    onPress={() => setGender(g)}
                    className={`tap flex-1 flex-row h-[52px] items-center justify-center rounded-ctl ${gender === g ? 'bg-brand-600' : 'bg-white ring-1 ring-inset ring-ink-200'}`}
                  >
                    <Span className={`text-body font-semibold ${gender === g ? 'text-white' : 'text-ink-700'}`}>{g}</Span>
                  </Btn>
                ))}
              </Div>
            </SheetField>
          </Div>
          <Div className="w-[110px]">
            <SheetField label="Age" required error={errors.age}>
              <TextField value={age} keyboardType="number-pad" maxLength={3} onChangeText={(v: string) => setAge(v.replace(/\D/g, '').slice(0, 3))} placeholder="Years" className={fieldCls(errors.age)} />
            </SheetField>
          </Div>
        </Div>
      </Div>
    </ModalSheet>
  );
}

const fieldCls = (err?: string) =>
  `h-[52px] w-full rounded-ctl bg-white px-4 text-body-lg text-ink-900 placeholder:text-ink-300 ring-1 ring-inset ${err ? 'ring-critical-600' : 'ring-ink-200'}`;

function SheetField({ label, hint, error, required, children }: { label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <Div className="gap-[7px]">
      <P className="text-body-sm font-semibold text-ink-600">
        {label}
        {required && <Span className="ml-0.5 text-critical-600">*</Span>}
      </P>
      {children}
      {error ? <P className="text-caption text-critical-600">{error}</P> : hint ? <P className="text-caption text-ink-400">{hint}</P> : null}
    </Div>
  );
}

/* ============================================================ Sample */

export function SampleScreen() {
  const nav = useNav();
  const { bookingId, patientKey } = useParams<'sample'>();
  const { data: booking, loading, error } = useFocusFetch(() => Bookings.details(bookingId));
  const [scanned, setScanned] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState<TubeSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const seeded = useRef(false);

  const patient = useMemo(() => (booking ? patientsOf(booking).find((p) => p.key === patientKey) : undefined), [booking, patientKey]);
  const slots = useMemo(() => (booking ? tubeSlots(booking) : []), [booking]);

  useEffect(() => {
    if (!booking || !patient || seeded.current) return;
    seeded.current = true;
    const pre: Record<string, string> = {};
    for (const s of slots) {
      const hit = patient.samples.find((x) => x.color === s.color && x.sample_id);
      if (hit) pre[s.key] = hit.sample_id;
    }
    setScanned(pre);
  }, [booking, patient, slots]);

  const count = slots.filter((s) => scanned[s.key]).length;
  const remaining = slots.length - count;
  const nextSlot = slots.find((s) => !scanned[s.key]) ?? null;

  const submit = async () => {
    if (!booking || !patient) return;
    const samples = slots.filter((s) => scanned[s.key]).map((s) => ({ color: s.color, sample_id: scanned[s.key] }));
    if (!samples.length) {
      showToast('Scan at least one tube', 'caution');
      return;
    }
    setSubmitting(true);
    const res = await Bookings.uploadSamples(booking.booking_id, samples, patient.otherId);
    setSubmitting(false);
    if (res.code === 0) {
      showToast('Samples uploaded', 'success');
      useJustCollected.getState().add(booking.booking_id, patient.key);
      nav.back();
      return;
    }
    if (res.data && cashDuePending(res.data as any)) {
      showToast(res.message || 'Collect the added-patient payment first', 'caution');
      nav.navigate('collect-payment', { params: { bookingId: booking.booking_id, mode: 'cash_due', completeAfter: false, returnTo: 'sample' } });
      return;
    }
    showToast(res.message || 'Couldn’t upload samples', 'critical');
  };

  if (loading || !booking) {
    return (
      <Screen>
        <ScreenHeader title="Collect samples" />
        <Div className="gap-3 p-4">
          {error ? (
            <StateBlock icon={<X className="h-[26px] w-[26px]" strokeWidth={2.2} />} tone="critical" title="Couldn’t load the booking" body={error} />
          ) : (
            <>
              <Skeleton className="h-[96px] w-full" rounded={18} />
              <Skeleton className="h-[280px] w-full" rounded={18} />
            </>
          )}
        </Div>
      </Screen>
    );
  }
  if (!patient) {
    return (
      <Screen>
        <ScreenHeader title="Collect samples" />
        <Div className="p-6">
          <StateBlock icon={<X className="h-[26px] w-[26px]" strokeWidth={2.2} />} tone="critical" title="Patient not found" body="This patient is no longer on the booking." />
        </Div>
      </Screen>
    );
  }

  const age = ageFromDob(patient.dob);
  const lab = booking.lab_samples?.[0]?.lab_name ?? 'KDC+ partner lab';

  return (
    <Screen padBottom={false}>
      <ScreenHeader title="Collect samples" subtitle={booking.booking_id} />
      <Div className="gap-3.5 px-4 pb-[150px] pt-4">
        <Card elevation="card">
          <Div className="flex-row items-center gap-3.5">
            <Span className="flex-col h-[50px] w-[50px] items-center justify-center rounded-full bg-brand-50">
              <Span className="text-body-lg font-bold text-brand-700">{initials(patient.name)}</Span>
            </Span>
            <Div className="min-w-0 flex-1">
              <P className="text-title-sm text-ink-900">{patient.name}</P>
              <P className="mt-0.5 text-body-sm text-ink-500">{age !== null ? `${age} yrs` : '—'} · {patient.gender}</P>
            </Div>
          </Div>
          <Div className="mt-3.5 flex-row items-center gap-2.5 rounded-tile bg-brand-50 px-3 py-2.5">
            <FlaskConical className="h-[16px] w-[16px] text-brand-600" strokeWidth={2.2} />
            <P className="min-w-0 flex-1 text-body-sm text-brand-700">
              Sending to: <Span className="font-semibold">{lab}</Span>
            </P>
          </Div>
        </Card>

        <Card elevation="card">
          <Div className="flex-row items-center justify-between">
            <P className="text-title-sm text-ink-900">Select Tube to Scan</P>
            <Span className="rounded-chip bg-ink-50 px-2.5 py-1 text-caption font-bold tabular-nums text-ink-700">{count}/{slots.length}</Span>
          </Div>
          {slots.length === 0 ? (
            <Div className="mt-4">
              <Banner tone="critical" icon={<AlertTriangle className="h-[17px] w-[17px] text-critical-700" strokeWidth={2.2} />} title="No vacutainer tubes are configured for this test. Contact admin." />
            </Div>
          ) : (
            <Div className="mt-3 gap-2.5">
              {slots.map((s) => (
                <TubeRow
                  key={s.key}
                  slot={s}
                  value={scanned[s.key]}
                  onScan={() => setScanning(s)}
                  onRemove={() => setScanned((cur) => {
                    const next = { ...cur };
                    delete next[s.key];
                    return next;
                  })}
                />
              ))}
            </Div>
          )}
        </Card>
      </Div>

      <StickyBar>
        <Div className="mb-2.5 flex-row items-center justify-center gap-1.5">
          {slots.map((s) => (
            <View key={s.key} style={{ width: scanned[s.key] ? 18 : 8, height: 8, borderRadius: 4, backgroundColor: scanned[s.key] ? '#16A34A' : '#BBC8D5' }} />
          ))}
        </Div>
        {remaining > 0 ? (
          <Div className="gap-1.5">
            <Button icon={<ScanLine className="h-[18px] w-[18px] text-white" strokeWidth={2.4} />} disabled={!slots.length} onClick={() => nextSlot && setScanning(nextSlot)}>
              {`Scan ${remaining} more ${remaining === 1 ? 'tube' : 'tubes'}`}
            </Button>
            {count > 0 && (
              <Button variant="text" size="sm" loading={submitting} onClick={submit}>
                {`Submit ${count} scanned now`}
              </Button>
            )}
          </Div>
        ) : (
          <Button variant="success" loading={submitting} icon={<TestTubes className="h-[18px] w-[18px] text-white" strokeWidth={2.2} />} onClick={submit}>
            Submit Samples
          </Button>
        )}
      </StickyBar>

      <ScannerModal
        visible={Boolean(scanning)}
        tube={scanning ? { name: scanning.name, color: scanning.color } : null}
        onClose={() => setScanning(null)}
        onConfirm={(id) => {
          if (scanning) setScanned((cur) => ({ ...cur, [scanning.key]: id }));
          setScanning(null);
        }}
      />
    </Screen>
  );
}

function TubeRow({ slot, value, onScan, onRemove }: { slot: TubeSlot; value?: string; onScan: () => void; onRemove: () => void }) {
  return (
    <Div className={`flex-row items-center gap-3 overflow-hidden rounded-tile ${value ? 'bg-vital-50/60' : 'bg-ink-50'}`}>
      <View style={{ width: 6, alignSelf: 'stretch', backgroundColor: slot.color === 'urine' ? '#F5D27A' : tubeColour(slot.color) }} />
      <Div className="min-w-0 flex-1 py-3">
        <Div className="flex-row items-center gap-2">
          <TubeDot color={slot.color} size={10} />
          <P className="min-w-0 flex-1 text-body font-semibold text-ink-900">
            {slot.name}
            {slot.code ? <Span className="font-medium text-ink-400"> · {slot.code}</Span> : null}
          </P>
        </Div>
        <P className="mt-0.5 text-caption text-ink-500">{slot.colourName}</P>
        {value ? <P className="mt-1 font-display text-body font-bold tracking-[.04em] text-vital-700">{value}</P> : null}
      </Div>
      {value ? (
        <Btn onPress={onRemove} accessibilityLabel="Remove scan" className="tap mr-3 flex-col h-[34px] w-[34px] items-center justify-center rounded-full bg-white">
          <X className="h-[16px] w-[16px] text-ink-500" strokeWidth={2.6} />
        </Btn>
      ) : (
        <Btn onPress={onScan} className="tap mr-3 flex-row h-[38px] items-center gap-1.5 rounded-chip bg-brand-600 px-3.5">
          <ScanLine className="h-[16px] w-[16px] text-white" strokeWidth={2.4} />
          <Span className="text-body-sm font-semibold text-white">Scan tube</Span>
        </Btn>
      )}
    </Div>
  );
}
