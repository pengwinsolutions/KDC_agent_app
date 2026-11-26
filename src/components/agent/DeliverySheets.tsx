/**
 * The door-step sheets of a medicine delivery: Deliver (the patient's code, who took it, an
 * optional proof photo, the cash) and Couldn't deliver (the reason). The agent never sees the
 * delivery code: the patient reads it out from their KDC+ app and the server checks it.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Modal as RNModal, View } from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { Btn, Div, Img, P, Span, TextAreaField, TextField } from '../primitives/index';
import { Banknote, Camera as CameraIcon, Lock, Phone, X } from '../primitives/icons';
import { Button } from '../ui/Button';
import { Banner, ModalSheet } from '../ui/Feedback';
import { Checkbox, OtpInput, RadioRow } from '../ui/Inputs';
import { DEVICE } from '../ui/Screen';
import { Deliveries, LIVE } from '../../api/endpoints';
import type { Delivery, FailureReason } from '../../domain/types';
import { codDue, FAILURE_REASONS, failureProblem, rupee } from '../../domain/rules';
import { DEMO_DELIVERY_CODE, SUPPORT_PHONE } from '../../mock-data/seed';
import { showToast } from '../../store/toast';
import { askCamera } from './Scanner';

const fieldCls = (err?: string | null) =>
  `h-[52px] w-full rounded-ctl bg-white px-4 text-body-lg text-ink-900 placeholder:text-ink-300 ring-1 ring-inset ${err ? 'ring-critical-600' : 'ring-ink-200'}`;

function Label({ children, hint }: { children: string; hint?: string }) {
  return (
    <P className="text-body-sm font-semibold text-ink-600">
      {children}
      {hint ? <Span className="font-normal text-ink-400"> · {hint}</Span> : null}
    </P>
  );
}

const callKdc = () => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => showToast('Couldn’t open the dialer', 'critical'));

/* ============================================================ Deliver */

/**
 * `onDelivered` gets the delivered order; `onWrongCode` lets the screen reload the delivery, so
 * the tries left and the lock come from the server.
 */
export function DeliverSheet({
  visible,
  delivery: d,
  onClose,
  onDelivered,
  onWrongCode,
}: {
  visible: boolean;
  delivery: Delivery;
  onClose: () => void;
  onDelivered: (d: Delivery) => void;
  onWrongCode: () => void;
}) {
  const [code, setCode] = useState('');
  const [handedTo, setHandedTo] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [cashOk, setCashOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const due = codDue(d);

  useEffect(() => {
    if (visible) {
      setCode('');
      setHandedTo('');
      setPhoto(null);
      setCashOk(false);
      setError(null);
    }
  }, [visible]);

  const handedProblem = handedTo.trim() && (handedTo.trim().length < 2 || handedTo.trim().length > 80) ? 'Use 2–80 characters' : null;
  const ready = code.length === 4 && !handedProblem && (due === null || cashOk);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    let podFileId: number | undefined;
    if (photo) {
      const up = await Deliveries.uploadProof(photo);
      if (up.code !== 0 || !up.data) {
        setBusy(false);
        setError(`${up.message || 'Couldn’t upload the photo'}. Try again, or remove the photo.`);
        return;
      }
      podFileId = up.data.id;
    }
    const res = await Deliveries.deliver(d.code, code, { deliveredTo: handedTo.trim() || undefined, podFileId });
    setBusy(false);
    if (res.code === 0 && res.data) {
      onDelivered(res.data);
      return;
    }
    setError(res.message || 'Couldn’t record the delivery');
    setCode('');
    onWrongCode();
  };

  const locked = d.codeLocked || d.codeTriesLeft === 0;

  return (
    <>
      <ModalSheet
        visible={visible && !camera}
        onClose={onClose}
        title={locked ? 'Delivery code locked' : 'Enter the delivery code'}
        subtitle={locked ? d.code : 'Ask the patient for the 4-digit code in their KDC+ app'}
        footer={
          locked ? (
            <Button icon={<Phone className="h-[17px] w-[17px] text-white" strokeWidth={2.3} />} onClick={callKdc}>
              Call KDC+
            </Button>
          ) : (
            <Button variant="success" loading={busy} disabled={!ready} onClick={submit}>
              {due !== null ? `Collected ${rupee(due)} · Deliver` : 'Mark delivered'}
            </Button>
          )
        }
      >
        {locked ? (
          <Div className="pb-2">
            <Banner
              tone="critical"
              icon={<Lock className="h-[18px] w-[18px] text-critical-700" strokeWidth={2.2} />}
              title="Too many wrong codes"
              body="Ask KDC+ to reset the code. The patient then gets a new code in their app."
            />
          </Div>
        ) : (
          <Div className="gap-4 pb-2">
            <Div>
              <OtpInput
                length={4}
                value={code}
                error={Boolean(error)}
                onChange={(v: string) => {
                  setCode(v.replace(/\D/g, '').slice(0, 4));
                  setError(null);
                }}
              />
              {error ? (
                <P className="mt-2 text-caption text-critical-600">{error}</P>
              ) : d.codeTriesLeft !== null && d.codeTriesLeft < 5 ? (
                <P className="mt-2 text-caption font-semibold text-caution-700">{d.codeTriesLeft} {d.codeTriesLeft === 1 ? 'try' : 'tries'} left</P>
              ) : !LIVE ? (
                <P className="mt-2 text-caption text-ink-400">Demo: the patient’s code is {DEMO_DELIVERY_CODE}</P>
              ) : null}
            </Div>

            <Div className="gap-[7px]">
              <Label hint="optional">Handed to</Label>
              <TextField value={handedTo} onChangeText={setHandedTo} maxLength={80} placeholder="If not the patient, e.g. Security, Gate 2" className={fieldCls(handedProblem)} />
              {handedProblem ? <P className="text-caption text-critical-600">{handedProblem}</P> : null}
            </Div>

            <Div className="gap-[7px]">
              <Label hint="optional">Proof photo</Label>
              {photo ? (
                <Div className="flex-row items-center gap-3">
                  <Img source={{ uri: photo }} className="h-[64px] w-[64px] rounded-tile bg-ink-50" />
                  <Div className="flex-1 flex-row gap-2">
                    <Button size="sm" variant="tertiary" onClick={() => setCamera(true)}>Retake</Button>
                    <Button size="sm" variant="text" onClick={() => setPhoto(null)}>Remove</Button>
                  </Div>
                </Div>
              ) : (
                <Button size="md" variant="tertiary" icon={<CameraIcon className="h-[16px] w-[16px] text-ink-800" strokeWidth={2.2} />} onClick={() => setCamera(true)}>
                  Take a photo of the parcel
                </Button>
              )}
            </Div>

            {due !== null ? (
              <Div className="rounded-tile bg-caution-50 p-3.5">
                <Div className="mb-2 flex-row items-center gap-2">
                  <Banknote className="h-[17px] w-[17px] text-caution-700" strokeWidth={2.2} />
                  <P className="text-body font-semibold text-caution-700">Cash on delivery · {rupee(due)}</P>
                </Div>
                <Checkbox checked={cashOk} onClick={() => setCashOk((v) => !v)} label={`I collected ${rupee(due)} in cash from the patient`} />
              </Div>
            ) : null}
          </Div>
        )}
      </ModalSheet>
      <ProofCamera
        visible={visible && camera}
        onClose={() => setCamera(false)}
        onTaken={(uri) => {
          setPhoto(uri);
          setCamera(false);
        }}
      />
    </>
  );
}

/* ======================================================== Proof photo */

/**
 * A photo of the parcel at the door, with the back camera the tube scanner already uses
 * (react-native-camera-kit's capture; no other camera or picker library is needed).
 */
export function ProofCamera({ visible, onClose, onTaken }: { visible: boolean; onClose: () => void; onTaken: (uri: string) => void }) {
  const [perm, setPerm] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [taking, setTaking] = useState(false);
  const ref = useRef<{ capture: () => Promise<{ uri: string }> } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPerm('checking');
    askCamera('KDC+ Agent uses the camera to take a photo of the parcel when you deliver it.').then((ok) => setPerm(ok ? 'granted' : 'denied'));
  }, [visible]);

  const take = async () => {
    if (!ref.current || taking) return;
    setTaking(true);
    try {
      const shot = await ref.current.capture();
      if (shot?.uri) onTaken(shot.uri);
      else showToast('Couldn’t take the photo', 'critical');
    } catch {
      showToast('Couldn’t take the photo', 'critical');
    } finally {
      setTaking(false);
    }
  };

  return (
    <RNModal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#071724' }}>
        {perm === 'granted' && <Camera ref={ref as never} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} cameraType={CameraType.Back} zoomMode="on" />}
        <View style={{ paddingTop: DEVICE.safeTop + 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Btn onPress={onClose} accessibilityLabel="Close camera" className="tap flex-col h-[40px] w-[40px] items-center justify-center rounded-full bg-white/14">
            <X className="h-[20px] w-[20px] text-white" strokeWidth={2.4} />
          </Btn>
          <P className="text-title-sm text-white">Photo of the parcel</P>
        </View>
        {perm === 'denied' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <P className="text-title-md text-white">Camera access needed</P>
            <P className="mt-2 text-center text-body text-white/70">Allow the camera in Settings, or deliver without a photo.</P>
            <Div className="mt-6 w-full max-w-[300px] gap-2.5">
              <Button variant="light" onClick={() => Linking.openSettings()}>Open Settings</Button>
              <Button variant="onDark" onClick={onClose}>Skip the photo</Button>
            </Div>
          </View>
        ) : (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: DEVICE.safeBottom + 24, alignItems: 'center' }}>
            <Btn
              onPress={take}
              accessibilityLabel="Take photo"
              className="tap flex-col h-[76px] w-[76px] items-center justify-center rounded-full bg-white"
            >
              <Span className={`h-[62px] w-[62px] rounded-full ${taking ? 'bg-ink-200' : 'bg-white ring-2 ring-inset ring-ink-900'}`} />
            </Btn>
          </View>
        )}
      </View>
    </RNModal>
  );
}

/* ======================================================= Couldn't deliver */

export function FailSheet({ visible, delivery: d, onClose, onFailed }: { visible: boolean; delivery: Delivery; onClose: () => void; onFailed: (d: Delivery) => void }) {
  const [reason, setReason] = useState<FailureReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setReason(null);
      setNote('');
      setError(null);
    }
  }, [visible]);

  const submit = async () => {
    const problem = failureProblem(reason, note);
    if (problem) return setError(problem);
    setBusy(true);
    const res = await Deliveries.failed(d.code, reason!, note.trim() || undefined);
    setBusy(false);
    if (res.code === 0 && res.data) onFailed(res.data);
    else setError(res.message || 'Couldn’t record the failed delivery');
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Couldn’t deliver"
      subtitle={`${d.code} · ${d.attempts.current ?? d.attempts.count} of ${d.attempts.max} attempts`}
      footer={
        <Button variant="danger" loading={busy} disabled={!reason} onClick={submit}>
          Record failed delivery
        </Button>
      }
    >
      <Div className="gap-2.5 pb-2">
        {FAILURE_REASONS.map((r) => (
          <RadioRow
            key={r.id}
            selected={reason === r.id}
            title={r.label}
            onClick={() => {
              setReason(r.id);
              setError(null);
            }}
          />
        ))}
        <Div className="mt-1.5 gap-[7px]">
          <Label hint={reason === 'other' ? 'required' : 'optional'}>Note</Label>
          <TextAreaField
            value={note}
            onChangeText={(v: string) => {
              setNote(v);
              setError(null);
            }}
            maxLength={255}
            placeholder="What happened at the door"
            className="min-h-[84px] w-full rounded-ctl bg-white px-4 py-3 text-body text-ink-900 placeholder:text-ink-300 ring-1 ring-inset ring-ink-200"
          />
        </Div>
        {error ? <P className="text-caption text-critical-600">{error}</P> : null}
        <P className="text-caption text-ink-400">After a failed attempt, bring the parcel back to {d.pickup?.name ?? 'the pharmacy'}. KDC+ arranges the next attempt.</P>
      </Div>
    </ModalSheet>
  );
}
