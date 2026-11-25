/** Splash, Login and OTP (spec 4.1–4.3). */
import React, { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Btn, Div, P, Span, TextField } from '../components/primitives/index';
import { FlaskConical, Info, Lock, Phone, ShieldCheck } from '../components/primitives/icons';
import { Screen, DEVICE, solidBarInset } from '../components/ui/Screen';
import { Button } from '../components/ui/Button';
import { OtpInput } from '../components/ui/Inputs';
import { EcgLine, Logo } from '../components/ui/Logo';
import { isDevLaunch, useNav, useParams } from '../navigation/navigation';
import { useSession } from '../store/session';
import { Auth, LIVE } from '../api/endpoints';
import { rearmLogout, restoreSession } from '../api/client';
import { showToast } from '../store/toast';
import { AGENT_MOBILE, DEMO_OTP, WEBSITE } from '../mock-data/seed';

/** "For field agents" — the mark that separates this build from the other KDC+ apps. */
export function AgentMark({ small = false }: { small?: boolean }) {
  return small ? (
    <Span className="rounded-[7px] bg-ink-900 px-2 py-[4px] text-[9.5px] font-bold uppercase tracking-[.12em] text-white">For Agents</Span>
  ) : (
    <Span className="inline-flex flex-row items-center gap-2 rounded-chip bg-ink-900 px-3.5 py-[7px]">
      <FlaskConical className="h-[13px] w-[13px] text-white" strokeWidth={2.3} />
      <Span className="text-[11.5px] font-bold uppercase tracking-[.14em] text-white">For Field Agents</Span>
    </Span>
  );
}

/* ============================================================ Splash */

export function SplashScreen() {
  const nav = useNav();
  useEffect(() => {
    useSession.getState().ensureInstallId();
    if (isDevLaunch()) return;
    let alive = true;
    const started = Date.now();
    // Live: the access token is in memory only; the Keychain's refresh token restores it.
    restoreSession().then((state) => {
      const wait = Math.max(0, (state === 'signed-out' ? 2000 : 900) - (Date.now() - started));
      setTimeout(() => alive && nav.resetTo(state === 'signed-out' ? 'login' : 'home'), wait);
    });
    return () => {
      alive = false;
    };
  }, [nav]);
  return (
    <Screen background="bg-white" padTop={false} padBottom={false}>
      <Div className="relative h-full w-full flex-col items-center justify-center bg-clinical">
        <Div className="flex-col items-center">
          <Logo variant="wordmark" width={206} className="animate-riseIn" />
          <Div className="mt-2 h-[24px]">
            <EcgLine animate width={250} height={24} stroke="#0068C8" />
          </Div>
          <P className="mt-1 text-[16px] font-semibold tracking-[-0.2px] text-vital-600">Your health in your hands</P>
          <Div className="mt-6">
            <AgentMark />
          </Div>
        </Div>
        <Div className="absolute inset-x-0 flex-col items-center" style={{ bottom: DEVICE.safeBottom + 28 + solidBarInset() }}>
          <P className="text-micro font-medium uppercase tracking-[.12em] text-ink-300">KDC Healthcare · India</P>
        </Div>
      </Div>
    </Screen>
  );
}

/* ============================================================= Login */

export function LoginScreen() {
  const nav = useNav();
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const m = mobile.replace(/\D/g, '');
    if (!m) return setError('Enter Your Mobile Number');
    if (m.length !== 10) return setError('Enter the 10-digit mobile number');
    setError(null);
    setSending(true);
    const res = await Auth.sendOtp(m);
    setSending(false);
    if (res.code === 0) nav.navigate('otp', { params: { mobile: m } });
    // The server's reason: unregistered number (404), wait before resending (429), offline or server down.
    else setError(res.message || 'Please contact admin for registration.');
  };

  return (
    <Screen background="bg-white" padBottom={false}>
      <Div className="flex-1 flex-col px-6">
        <Div className="flex-row items-center gap-2.5 pt-5">
          <Logo variant="wordmark" width={74} />
          <AgentMark small />
        </Div>

        <P className="mt-9 font-display text-[30px] font-extrabold leading-[35px] tracking-[-0.7px] text-ink-900">Agent Login</P>
        <P className="mt-2.5 text-body-lg leading-[23px] text-ink-500">
          Sign in with the mobile number KDC+ operations registered for you.
        </P>

        <Div className="mt-7">
          <P className="text-body-sm font-semibold text-ink-600">Mobile number</P>
          <Div
            className={`mt-2 flex-row h-[56px] items-center rounded-ctl bg-white px-4 ring-[1.5px] ring-inset ${error ? 'ring-critical-600' : 'ring-brand-600'}`}
          >
            <Phone className="mr-3 h-[17px] w-[17px] text-ink-400" strokeWidth={2.2} />
            <Span className="mr-3 shrink-0 border-r border-ink-200 pr-3 font-display text-[16px] font-bold text-ink-900">+91</Span>
            <TextField
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={10}
              value={mobile}
              placeholder="10-digit mobile"
              onChangeText={(v: string) => {
                setMobile(v.replace(/\D/g, '').slice(0, 10));
                setError(null);
              }}
              onSubmitEditing={submit}
              className="h-full min-w-0 flex-1 bg-transparent font-display text-[18px] font-bold tracking-[0.4px] text-ink-900 placeholder:text-ink-300"
            />
          </Div>
          {error && <P className="mt-1.5 text-caption text-critical-600">{error}</P>}
        </Div>

        <Div className="mt-6">
          <Button onClick={submit} loading={sending}>
            {sending ? 'Sending OTP...' : 'Request OTP'}
          </Button>
        </Div>

        <Div className="mt-6 rounded-tile bg-ink-50 p-4">
          <Div className="flex-row items-start gap-3">
            <Info className="mt-[1px] h-[16px] w-[16px] shrink-0 text-ink-500" strokeWidth={2.1} />
            <Div className="min-w-0 flex-1">
              <P className="text-body-sm font-bold text-ink-900">New field agent?</P>
              <P className="mt-0.5 text-body-sm leading-[19px] text-ink-600">
                Agents can’t sign up here. KDC+ operations registers you after onboarding and KYC.
              </P>
            </Div>
          </Div>
        </Div>

        {/* Demo builds only: the mock backend's registered agent. */}
        {!LIVE ? (
          <P className="mt-4 text-center text-caption text-ink-400">
            Demo account: {AGENT_MOBILE.replace(/(\d{5})(\d{5})/, '$1 $2')} · OTP {DEMO_OTP}
          </P>
        ) : null}

        <Div className="mt-auto pb-4 pt-8" style={{ paddingBottom: 16 + solidBarInset() }}>
          <Div className="flex-row items-center justify-center gap-5">
            <Div className="flex-row items-center gap-1.5">
              <ShieldCheck className="h-[14px] w-[14px] text-vital-600" strokeWidth={2.2} />
              <Span className="text-body-sm text-ink-500">Verified agents</Span>
            </Div>
            <Div className="flex-row items-center gap-1.5">
              <Lock className="h-[14px] w-[14px] text-vital-600" strokeWidth={2.2} />
              <Span className="text-body-sm text-ink-500">Encrypted</Span>
            </Div>
          </Div>
          <P className="mt-3 text-center text-caption leading-[17px] text-ink-400">
            By continuing you agree to the{' '}
            <Span className="font-semibold text-ink-700" onPress={() => Linking.openURL(`${WEBSITE}/terms`)}>Terms of service</Span>
            {' '}and{' '}
            <Span className="font-semibold text-ink-700" onPress={() => Linking.openURL(`${WEBSITE}/privacy-policy`)}>Privacy policy</Span>.
          </P>
        </Div>
      </Div>
    </Screen>
  );
}

/* =============================================================== OTP */

export function OtpScreen() {
  const nav = useNav();
  const { mobile = AGENT_MOBILE } = useParams<'otp'>() ?? {};
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [left, setLeft] = useState(30);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const verify = async (value = code) => {
    if (value.length !== 4) return setError('Enter Your Otp');
    setVerifying(true);
    const res = await Auth.verifyOtp(mobile, value);
    if (res.code === 0 && res.data?.token) {
      useSession.getState().setToken(res.data.token);
      rearmLogout();
      setVerifying(false);
      nav.resetTo('home');
    } else {
      setVerifying(false);
      setError('Invalid Otp.');
    }
  };

  const resend = async () => {
    setResending(true);
    const res = await Auth.sendOtp(mobile);
    setResending(false);
    if (res.code === 0) {
      setLeft(30);
      setCode('');
      setError(null);
      showToast('OTP sent again', 'success');
    } else showToast(res.message || 'Couldn’t resend the OTP', 'critical');
  };

  return (
    <Screen background="bg-white" padBottom={false}>
      <Div className="flex-1 flex-col px-6">
        <Div className="flex-row items-center gap-2.5 pt-5">
          <Logo variant="wordmark" width={74} />
          <AgentMark small />
        </Div>

        <P className="mt-9 font-display text-[30px] font-extrabold leading-[35px] tracking-[-0.7px] text-ink-900">Verify your number</P>
        <P className="mt-2.5 text-body-lg leading-[23px] text-ink-500">
          We’ve sent an SMS with an activation code to your phone{' '}
          <Span className="font-semibold text-ink-900">+91 {mobile.replace(/(\d{5})(\d{5})/, '$1 $2')}</Span>
        </P>

        <Div className="mt-8">
          <OtpInput
            length={4}
            value={code}
            error={Boolean(error)}
            onChange={(v: string) => {
              const next = v.slice(0, 4);
              setCode(next);
              setError(null);
              if (next.length === 4) verify(next);
            }}
          />
          {error && <P className="mt-2 text-caption text-critical-600">{error}</P>}
        </Div>

        <Div className="mt-5 flex-row items-center justify-between">
          <Btn onPress={() => nav.back()} className="tap text-body-sm font-semibold text-ink-500">
            Change number
          </Btn>
          {left > 0 ? (
            <P className="text-body-sm text-ink-400">Resend in 0:{String(left).padStart(2, '0')}</P>
          ) : (
            <Btn onPress={resending ? undefined : resend} className="tap text-body-sm font-semibold text-brand-600">
              {resending ? 'Sending…' : 'Resend'}
            </Btn>
          )}
        </Div>

        <Div className="mt-7">
          <Button onClick={() => verify()} loading={verifying}>
            Verify &amp; continue
          </Button>
        </Div>

        <Div className="mt-auto flex-row items-start gap-2.5 rounded-tile bg-caution-50 p-3.5" style={{ marginBottom: 16 + solidBarInset() }}>
          <ShieldCheck className="mt-[1px] h-[16px] w-[16px] shrink-0 text-caution-700" strokeWidth={2.2} />
          <P className="min-w-0 flex-1 text-body-sm leading-[19px] text-caution-700">
            KDC+ never asks for this code by phone. Don’t share it with customers or anyone else.
          </P>
        </Div>
      </Div>
    </Screen>
  );
}
