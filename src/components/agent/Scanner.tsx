import React, { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Linking, Modal as RNModal, PermissionsAndroid, Platform, Vibration, View } from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { Btn, Div, P, Span, TextField } from '../primitives/index';
import { Camera as CameraIcon, Check, ScanLine, X, Zap, ZapOff } from '../primitives/icons';
import { Button } from '../ui/Button';
import { DEVICE } from '../ui/Screen';
import { TubeDot } from './index';

const FORMATS = ['code-128', 'code-39', 'code-93', 'codabar', 'ean-13', 'ean-8', 'itf', 'upc-e', 'upc-a', 'qr', 'pdf-417', 'aztec', 'data-matrix'];

type Perm = 'checking' | 'granted' | 'denied';

async function askCamera(): Promise<boolean> {
  if (Platform.OS !== 'android') return true; // iOS prompts on first camera use (NSCameraUsageDescription)
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
    title: 'Camera access',
    message: 'KDC+ Agent uses the camera to scan the barcode on each sample tube.',
    buttonPositive: 'Allow',
  });
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

/** What the server accepts as a tube barcode (SampleDto): 4–40 letters, digits or hyphens. */
const SAMPLE_ID = /^[A-Z0-9-]{4,40}$/;
const clean = (v: string) => v.trim().toUpperCase();

/**
 * Back-camera barcode scanner (spec 4.7). A valid read goes straight back to the
 * tube row (which shows the ID with "Remove scan" until the samples are submitted),
 * so there's no confirm step per tube. A label that isn't a sample barcode shows a
 * note and scanning carries on. The white sheet is only for typing an ID by hand.
 */
export function ScannerModal({
  visible,
  tube,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  tube: { name: string; color: string } | null;
  onConfirm: (sampleId: string) => void;
  onClose: () => void;
}) {
  const [perm, setPerm] = useState<Perm>('checking');
  /** null: camera; a string: typing the ID by hand. */
  const [manual, setManual] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const line = useRef(new Animated.Value(0)).current;
  const read = useRef(false);
  const resume = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    setManual(null);
    setError(null);
    setNotice(null);
    read.current = false;
    setPerm('checking');
    askCamera().then((ok) => setPerm(ok ? 'granted' : 'denied'));
    return () => {
      if (resume.current) clearTimeout(resume.current);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || manual !== null) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(line, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(line, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, manual, line]);

  const onRead = (raw: string) => {
    if (read.current) return;
    const code = clean(raw);
    if (!code) return;
    read.current = true;
    if (!SAMPLE_ID.test(code)) {
      setNotice('That isn’t a sample tube barcode. Scan the label on the tube.');
      resume.current = setTimeout(() => {
        read.current = false;
        setNotice(null);
      }, 1800);
      return;
    }
    Vibration.vibrate(40);
    onConfirm(code);
  };

  const save = () => {
    const v = clean(manual ?? '');
    if (!v) return setError('Enter the sample ID from the tube label');
    if (!SAMPLE_ID.test(v)) return setError('Use 4–40 letters, digits or hyphens, as on the label');
    onConfirm(v);
  };

  const camera = perm === 'granted' && manual === null;

  return (
    <RNModal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={manual !== null && perm === 'granted' ? () => setManual(null) : onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#071724' }} behavior="padding">
        {/* Camera */}
        {camera && (
          <Camera
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            cameraType={CameraType.Back}
            scanBarcode
            allowedBarcodeTypes={FORMATS as any}
            torchMode={torch ? 'on' : 'off'}
            zoomMode="on"
            onReadCode={(e: any) => onRead(String(e?.nativeEvent?.codeStringValue ?? ''))}
          />
        )}

        {/* Header */}
        <View style={{ paddingTop: DEVICE.safeTop + 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Btn onPress={onClose} accessibilityLabel="Close scanner" className="tap flex-col h-[40px] w-[40px] items-center justify-center rounded-full bg-white/14">
            <X className="h-[20px] w-[20px] text-white" strokeWidth={2.4} />
          </Btn>
          <Div className="min-w-0 flex-1">
            <P className="text-caption font-semibold uppercase tracking-[.08em] text-white/60">Scan tube</P>
            <Div className="mt-0.5 flex-row items-center gap-2">
              {tube && <TubeDot color={tube.color} size={10} />}
              <P className="text-title-sm text-white" numberOfLines={1}>{tube?.name ?? 'Sample tube'}</P>
            </Div>
          </Div>
          {camera && (
            <Btn onPress={() => setTorch((t) => !t)} accessibilityLabel="Torch" className="tap flex-col h-[40px] w-[40px] items-center justify-center rounded-full bg-white/14">
              {torch ? <Zap className="h-[18px] w-[18px] text-white" strokeWidth={2.4} /> : <ZapOff className="h-[18px] w-[18px] text-white" strokeWidth={2.4} />}
            </Btn>
          )}
        </View>

        {/* Frame */}
        {camera && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
            <View style={{ width: '78%', maxWidth: 420, aspectRatio: 1.6, borderRadius: 18, borderWidth: 2, borderColor: notice ? 'rgba(248,113,113,0.95)' : 'rgba(255,255,255,0.85)', overflow: 'hidden' }}>
              <Animated.View
                style={{
                  position: 'absolute', left: 12, right: 12, height: 2, borderRadius: 1, backgroundColor: '#54A3FA',
                  boxShadow: '0 0 12px 2px rgba(84,163,250,0.8)',
                  transform: [{ translateY: line.interpolate({ inputRange: [0, 1], outputRange: [14, 240] }) }],
                } as any}
              />
            </View>
            <P accessibilityLiveRegion="polite" className={`mt-5 px-8 text-center text-body ${notice ? 'font-semibold text-critical-200' : 'text-white/80'}`}>
              {notice ?? 'Align the barcode inside the frame. It saves as soon as it reads.'}
            </P>
          </View>
        )}
        {camera && (
          <View style={{ alignItems: 'center', paddingBottom: DEVICE.safeBottom + 28, paddingTop: 12 }}>
            <Btn onPress={() => setManual('')} accessibilityLabel="Type the sample ID" className="tap flex-row h-[48px] items-center gap-2 rounded-chip bg-white/14 px-5">
              <Span className="text-body-sm font-semibold text-white">Label won’t scan? Type the ID</Span>
            </Btn>
          </View>
        )}

        {perm === 'denied' && manual === null && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <Span className="flex-col h-[64px] w-[64px] items-center justify-center rounded-[20px] bg-white/10">
              <CameraIcon className="h-[28px] w-[28px] text-white" strokeWidth={2} />
            </Span>
            <P className="mt-4 text-title-md text-white">Camera access needed</P>
            <P className="mt-2 text-center text-body text-white/70">Allow the camera in Settings to scan tubes, or type the sample ID instead.</P>
            <Div className="mt-6 w-full max-w-[340px] gap-2.5">
              <Button variant="light" onClick={() => Linking.openSettings()}>Open Settings</Button>
              <Button variant="onDark" onClick={() => setManual('')}>Enter ID manually</Button>
            </Div>
          </View>
        )}

        {perm === 'checking' && <View style={{ flex: 1 }} />}

        {/* Typing the ID by hand: sits above the keyboard */}
        {manual !== null && (
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Div className="rounded-t-[26px] bg-white px-5 pt-5" style={{ paddingBottom: DEVICE.safeBottom + 18 }}>
              <P className="text-title-sm text-ink-900">Enter sample ID</P>
              <P className="mt-0.5 text-body-sm text-ink-500">Type it exactly as printed on the tube label.</P>
              <TextField
                className={`mt-4 h-[54px] w-full rounded-ctl bg-white px-4 font-display text-title-sm tracking-[.06em] text-ink-900 ring-[1.5px] ring-inset ${error ? 'ring-critical-500' : 'ring-brand-600'}`}
                value={manual}
                autoFocus
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={save}
                accessibilityLabel="Sample ID"
                onChangeText={(v: string) => {
                  setManual(v.toUpperCase());
                  setError(null);
                }}
                placeholder="e.g. KDC24A71903"
              />
              {error && <P className="mt-1.5 text-caption text-critical-600">{error}</P>}
              <Div className="mt-4 flex-row gap-3">
                {perm === 'granted' && (
                  <Div className="flex-1">
                    <Button variant="tertiary" icon={<ScanLine className="h-[17px] w-[17px] text-ink-800" strokeWidth={2.4} />} onClick={() => { setManual(null); setError(null); }}>
                      Scan instead
                    </Button>
                  </Div>
                )}
                <Div className="flex-1">
                  <Button icon={<Check className="h-[18px] w-[18px] text-white" strokeWidth={2.6} />} onClick={save}>
                    Save ID
                  </Button>
                </Div>
              </Div>
            </Div>
          </View>
        )}
      </KeyboardAvoidingView>
    </RNModal>
  );
}
