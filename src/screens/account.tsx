/** Profile, History, Notifications, Need Help and policy pages (spec 7–10). */
import React, { useCallback, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Btn, Div, P, Span, TextField } from '../components/primitives/index';
import {
  Bell, CalendarDays, CircleAlert, ClipboardCheck, CreditCard, FileText, FlaskConical,
  Headphones, History, Inbox, LifeBuoy, LogOut, Megaphone, Package, Phone, Receipt, RefreshCw, Send, ShieldCheck, TestTubes, Trash2, X,
} from '../components/primitives/icons';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/Nav';
import { Button, StickyBar } from '../components/ui/Button';
import { Card, Group, ListRow, Segmented } from '../components/ui/Display';
import { Skeleton, StateBlock } from '../components/ui/Feedback';
import { BookingCard } from '../components/agent/BookingCard';
import { DeliveryCard } from '../components/agent/DeliveryCard';
import { useWorkTab } from '../hooks/useWorkTab';
import type { WorkTab } from '../navigation/routes';
import { ConfirmDialog, Grid, useColumns } from '../components/agent';
import { useNav, useParams } from '../navigation/navigation';
import { useFocusFetch } from '../hooks/useFocusFetch';
import { Cms, Deliveries, Help, Notifications, Profile, Bookings, LIVE } from '../api/endpoints';
import { resetMockDb } from '../api/mockServer';
import { endSession } from '../api/client';
import { useSession } from '../store/session';
import { showToast } from '../store/toast';
import { openFromPush, stopPush, useOnPush } from '../notifications/push';
import type { AgentNotification, AgentService } from '../domain/types';
import { extractList, hasMorePages, normaliseStatus, relativeTime } from '../domain/rules';
import { SUPPORT_PHONE } from '../mock-data/seed';

/* ============================================================ Profile */

export function ProfileScreen() {
  const nav = useNav();
  const { data: me } = useFocusFetch(() => Profile.get());
  const [confirm, setConfirm] = useState<'logout' | 'delete' | 'reset' | null>(null);
  const [busy, setBusy] = useState(false);

  const signOut = () => {
    // This phone leaves the account first (that needs the session), then the session ends.
    stopPush().finally(endSession);
    nav.resetTo('login');
  };

  const onConfirm = async () => {
    if (confirm === 'logout') signOut();
    else if (confirm === 'delete') {
      setBusy(true);
      const r = await Profile.deleteAccount();
      setBusy(false);
      if (r.code === 0) {
        showToast('Account deletion requested', 'success');
        signOut();
      } else showToast(r.message || 'Couldn’t request deletion', 'critical');
    } else if (confirm === 'reset') {
      resetMockDb();
      useSession.setState({ unread: 3 });
      showToast('Demo data restored', 'success');
      setConfirm(null);
      nav.resetTo('home');
      return;
    }
    setConfirm(null);
  };

  const policy = (path: 'privacy-policy' | 'terms' | 'refund-policy', title: string) => nav.navigate('policy', { params: { path, title } });
  const initials = (me?.name ?? 'KDC').split(' ').map((w) => w[0]).slice(0, 2).join('');

  return (
    <Screen>
      <ScreenHeader title="Profile" />
      <Div className="mx-auto w-full max-w-[680px] gap-4 px-4 pb-10 pt-4">
        <View style={{ borderRadius: 22, padding: 20, experimental_backgroundImage: 'linear-gradient(165deg, #0A3D70 0%, #0057A8 48%, #0068C8 100%)' } as any}>
          <Div className="flex-row items-center gap-4">
            <Span className="flex-col h-[60px] w-[60px] items-center justify-center rounded-full bg-white/15">
              <Span className="font-display text-[22px] font-extrabold text-white">{initials}</Span>
            </Span>
            <Div className="min-w-0 flex-1">
              <P className="text-body-sm text-white/70">Hello,</P>
              <P className="font-display text-[22px] font-extrabold text-white">{me?.name ?? '—'}</P>
              <P className="mt-0.5 text-body-sm text-white/75">{me?.agent_code ?? ''}{me?.city ? ` · ${me.city}` : ''}</P>
            </Div>
          </Div>
          <Div className="mt-4 flex-row flex-wrap gap-2">
            <Span className="rounded-chip bg-white/14 px-3 py-1.5 text-caption font-semibold text-white">+91 {me?.mobile ?? ''}</Span>
            {me?.email ? <Span className="rounded-chip bg-white/14 px-3 py-1.5 text-caption font-semibold text-white">{me.email}</Span> : null}
          </Div>
        </View>

        {me?.services?.length ? (
          <Card elevation="tile">
            <P className="text-caption font-semibold uppercase tracking-[.08em] text-ink-400">Your skills</P>
            <Div className="mt-2.5 flex-row flex-wrap gap-2">
              {me.services.map((s) => {
                const { label, Icon } = SKILLS[s];
                return (
                  <Span key={s} className="flex-row items-center gap-1.5 rounded-chip bg-brand-50 px-3 py-1.5">
                    <Icon className="h-[14px] w-[14px] text-brand-700" strokeWidth={2.2} />
                    <Span className="text-caption font-semibold text-brand-700">{label}</Span>
                  </Span>
                );
              })}
            </Div>
            <P className="mt-2 text-caption text-ink-400">KDC+ operations set your skills.</P>
          </Card>
        ) : null}

        <Group>
          <ListRow
            icon={<History className="h-[18px] w-[18px]" strokeWidth={2.1} />}
            title="History"
            subtitle={me?.services?.includes('medicine_delivery') ? (me.services.includes('sample_collection') ? 'Past bookings and deliveries' : 'Past deliveries') : 'Completed and rejected bookings'}
            onClick={() => nav.navigate('history')}
            last
          />
        </Group>

        <Group>
          <ListRow icon={<LifeBuoy className="h-[18px] w-[18px]" strokeWidth={2.1} />} title="Get Help" subtitle="Raise a support request" onClick={() => nav.navigate('help')} />
          <ListRow
            icon={<Phone className="h-[18px] w-[18px]" strokeWidth={2.1} />}
            title="Call Us"
            subtitle="KDC+ field operations"
            onClick={() => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => showToast('Couldn’t open the dialer', 'critical'))}
            last
          />
        </Group>

        <Group>
          <ListRow icon={<Receipt className="h-[18px] w-[18px]" strokeWidth={2.1} />} title="Refund Policy" onClick={() => policy('refund-policy', 'Refund Policy')} />
          <ListRow icon={<ShieldCheck className="h-[18px] w-[18px]" strokeWidth={2.1} />} title="Privacy Policy" onClick={() => policy('privacy-policy', 'Privacy Policy')} />
          <ListRow icon={<FileText className="h-[18px] w-[18px]" strokeWidth={2.1} />} title="Terms and Conditions" onClick={() => policy('terms', 'Terms and Conditions')} last />
        </Group>

        <Group>
          <ListRow icon={<Trash2 className="h-[18px] w-[18px]" strokeWidth={2.1} />} title="Delete Account" danger onClick={() => setConfirm('delete')} />
          <ListRow icon={<LogOut className="h-[18px] w-[18px]" strokeWidth={2.1} />} title="Logout" danger onClick={() => setConfirm('logout')} last />
        </Group>

        {!LIVE ? (
          <Group>
            <ListRow icon={<RefreshCw className="h-[18px] w-[18px]" strokeWidth={2.1} />} title="Reset demo data" subtitle="Prototype only: restores the sample bookings" onClick={() => setConfirm('reset')} last />
          </Group>
        ) : null}

        <P className="text-center text-caption text-ink-400">KDC+ Agent · version 1.0 (1)</P>
      </Div>

      <ConfirmDialog
        visible={confirm !== null}
        destructive={confirm !== 'reset'}
        loading={busy}
        title={confirm === 'logout' ? 'Log out?' : confirm === 'delete' ? 'Delete your account?' : 'Reset demo data?'}
        message={
          confirm === 'logout'
            ? 'You’ll need an OTP to sign in again.'
            : confirm === 'delete'
              ? 'KDC+ operations will close your agent account. This can’t be undone.'
              : 'All bookings and notifications go back to the original sample data.'
        }
        confirmLabel={confirm === 'logout' ? 'Log out' : confirm === 'delete' ? 'Request deletion' : 'Reset'}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </Screen>
  );
}

const SKILLS: Record<AgentService, { label: string; Icon: typeof Package }> = {
  sample_collection: { label: 'Home sample collection', Icon: TestTubes },
  medicine_delivery: { label: 'Medicine delivery', Icon: Package },
};

/* ============================================================ History */

export function HistoryScreen() {
  const { data: me } = useFocusFetch(() => Profile.get());
  const { tab, setTab, both } = useWorkTab(me, useParams<'history'>()?.tab);
  return (
    <>
      {tab === 'deliveries' ? <PastDeliveries both={both} onTab={setTab} /> : <PastBookings both={both} onTab={setTab} />}
    </>
  );
}

function WorkSwitch({ value, onTab }: { value: WorkTab; onTab: (t: WorkTab) => void }) {
  return (
    <Segmented
      className="mb-4"
      value={value}
      onChange={(id) => onTab(id as WorkTab)}
      options={[
        { id: 'collections', label: 'Collections' },
        { id: 'deliveries', label: 'Deliveries' },
      ]}
    />
  );
}

function PastDeliveries({ both, onTab }: { both: boolean; onTab: (t: WorkTab) => void }) {
  const nav = useNav();
  const { data, loading, error, refreshing, refresh, reload } = useFocusFetch(() => Deliveries.past());
  const list = data ?? [];
  const delivered = list.filter((d) => d.status === 'DELIVERED').length;
  const other = list.length - delivered;

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <ScreenHeader title="History" subtitle="Past deliveries" />
      <Div className="px-4 pb-10 pt-4">
        {both ? <WorkSwitch value="deliveries" onTab={onTab} /> : null}
        <Div className="mb-4 flex-row gap-2.5">
          <Summary label="Total" value={list.length} tone="text-ink-900" />
          <Summary label="Delivered" value={delivered} tone="text-vital-700" />
          <Summary label="Returned / other" value={other} tone="text-ink-600" />
        </Div>
        {loading ? (
          <Div className="gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[200px] w-full" rounded={18} />)}</Div>
        ) : error ? (
          <StateBlock icon={<X className="h-[26px] w-[26px]" strokeWidth={2.2} />} tone="critical" title="Couldn’t load history" body={error} primary={<Button size="md" onClick={() => reload('initial')}>Try again</Button>} />
        ) : list.length === 0 ? (
          <StateBlock icon={<Package className="h-[26px] w-[26px]" strokeWidth={2} />} tone="brand" title="No past deliveries yet" body="Delivered and returned orders appear here." />
        ) : (
          <Grid
            items={list}
            keyOf={(d) => d.code}
            render={(d) => <DeliveryCard delivery={d} variant="past" onOpen={() => nav.navigate('delivery-details', { params: { code: d.code } })} />}
          />
        )}
      </Div>
    </Screen>
  );
}

function PastBookings({ both, onTab }: { both: boolean; onTab: (t: WorkTab) => void }) {
  const nav = useNav();
  const { data, loading, error, refreshing, refresh, reload } = useFocusFetch(() => Bookings.past());
  const list = extractList(data ?? []);
  const completed = list.filter((b: any) => ['COMPLETED', 'PAID'].includes(normaliseStatus(b.booking_status))).length;
  const rejected = list.filter((b: any) => normaliseStatus(b.booking_status) === 'REJECTED').length;

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <ScreenHeader title="History" subtitle="Past bookings" />
      <Div className="px-4 pb-10 pt-4">
        {both ? <WorkSwitch value="collections" onTab={onTab} /> : null}
        <Div className="mb-4 flex-row gap-2.5">
          <Summary label="Total" value={list.length} tone="text-ink-900" />
          <Summary label="Completed" value={completed} tone="text-vital-700" />
          <Summary label="Rejected" value={rejected} tone="text-critical-600" />
        </Div>
        {loading ? (
          <Div className="gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[200px] w-full" rounded={18} />)}</Div>
        ) : error ? (
          <StateBlock icon={<X className="h-[26px] w-[26px]" strokeWidth={2.2} />} tone="critical" title="Couldn’t load history" body={error} primary={<Button size="md" onClick={() => reload('initial')}>Try again</Button>} />
        ) : list.length === 0 ? (
          <StateBlock icon={<ClipboardCheck className="h-[26px] w-[26px]" strokeWidth={2} />} tone="brand" title="No past bookings yet" body="Completed and rejected bookings appear here." />
        ) : (
          <Grid
            items={list}
            keyOf={(b: any) => String(b.id)}
            render={(b: any) => <BookingCard booking={b} variant="past" onOpen={() => nav.navigate('booking-details', { params: { bookingId: b.booking_id } })} />}
          />
        )}
      </Div>
    </Screen>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card elevation="tile" className="flex-1 !p-3.5">
      <P className="text-caption text-ink-500">{label}</P>
      <P className={`mt-1 font-display text-[22px] font-extrabold tabular-nums ${tone}`}>{value}</P>
    </Card>
  );
}

/* ====================================================== Notifications */

const pick = (o: any, keys: string[]) => keys.map((k) => o?.[k]).find((v) => v !== undefined && v !== null && v !== '');

/** Field names vary across the API; normalise them (spec 9.4). */
function normaliseNotification(raw: any): AgentNotification {
  const read = pick(raw, ['read_flag', 'is_read', 'read_at']);
  return {
    id: Number(raw.id),
    type: String(raw.type ?? raw.data?.type ?? ''),
    title: String(pick(raw, ['title', 'heading', 'subject']) ?? 'KDC+ Agent'),
    message: String(pick(raw, ['message', 'body', 'description', 'content']) ?? ''),
    image: pick(raw, ['image', 'image_url']),
    booking_id: raw.booking_id ?? raw.data?.booking_id,
    delivery_code: raw.delivery_code,
    target: raw.target ?? raw.data?.type,
    read_flag: read === 1 || read === true || (typeof read === 'string' && read !== '0') ? 1 : 0,
    created_at: String(pick(raw, ['created_at', 'date']) ?? ''),
  };
}

function iconFor(type: string) {
  const t = type.toUpperCase();
  if (t.includes('DELIVERY')) return { Icon: Package, bg: 'bg-brand-50', fg: 'text-brand-600' };
  if (t.startsWith('BOOK')) return { Icon: CalendarDays, bg: 'bg-brand-50', fg: 'text-brand-600' };
  if (t.startsWith('PAY')) return { Icon: CreditCard, bg: 'bg-vital-50', fg: 'text-vital-600' };
  if (t.includes('REPORT') || t.includes('TEST')) return { Icon: FlaskConical, bg: 'bg-caution-50', fg: 'text-caution-700' };
  if (t.includes('BROADCAST')) return { Icon: Megaphone, bg: 'bg-ink-50', fg: 'text-ink-700' };
  return { Icon: Bell, bg: 'bg-ink-50', fg: 'text-ink-600' };
}

export function NotificationsScreen() {
  const [items, setItems] = useState<AgentNotification[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(true);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const fetching = useRef(false);

  const load = useCallback(async () => {
    setState((s) => (s === 'ready' ? s : 'loading'));
    const r = await Notifications.page(1);
    useSession.getState().resetUnread();
    if (r.code !== 0) {
      setState('error');
      return;
    }
    const list = extractList(r.data).map(normaliseNotification);
    setItems(list);
    setPage(1);
    setMore(hasMorePages(r.data, list.length, 20));
    setState('ready');
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // A push while the inbox is open: show it (opening the inbox marks it read).
  const focused = useIsFocused();
  useOnPush(() => {
    if (focused) load();
  });

  const loadMore = async () => {
    if (!more || fetching.current || state !== 'ready') return;
    fetching.current = true;
    setLoadingMore(true);
    const r = await Notifications.page(page + 1);
    fetching.current = false;
    setLoadingMore(false);
    if (r.code !== 0) return;
    const list = extractList(r.data).map(normaliseNotification);
    setItems((cur) => [...cur, ...list.filter((n) => !cur.some((c) => c.id === n.id))]);
    setPage(page + 1);
    setMore(hasMorePages(r.data, list.length, 20));
  };

  return (
    <Screen onEndReached={loadMore} onRefresh={load}>
      <ScreenHeader title="Notifications" />
      <Div className="mx-auto w-full max-w-[720px] px-4 pb-10 pt-3">
        {state === 'loading' ? (
          <Div className="gap-2.5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[76px] w-full" rounded={16} />)}</Div>
        ) : state === 'error' ? (
          <Div className="mt-8">
            <StateBlock icon={<CircleAlert className="h-[26px] w-[26px]" strokeWidth={2.1} />} tone="critical" title="Couldn’t load notifications" body="Check your connection and try again." primary={<Button size="md" onClick={load}>Retry</Button>} />
          </Div>
        ) : items.length === 0 ? (
          <Div className="mt-8">
            <StateBlock icon={<Inbox className="h-[26px] w-[26px]" strokeWidth={2} />} tone="brand" title="You’re all caught up" body="Booking alerts and messages from KDC+ appear here." />
          </Div>
        ) : (
          <Div className="gap-2.5">
            {items.map((n) => {
              const { Icon, bg, fg } = iconFor(n.type);
              const unread = n.read_flag !== 1;
              return (
                <Btn
                  key={n.id}
                  onPress={() => openFromPush(n)}
                  className={`tap flex-row items-start gap-3 rounded-tile p-3.5 text-left ${unread ? 'bg-brand-50/70' : 'bg-white shadow-tile'}`}
                >
                  <Span className={`flex-col h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] ${bg}`}>
                    <Icon className={`h-[18px] w-[18px] ${fg}`} strokeWidth={2.2} />
                  </Span>
                  <Div className="min-w-0 flex-1">
                    <Div className="flex-row items-start justify-between gap-3">
                      <P className={`min-w-0 flex-1 text-body ${unread ? 'font-bold' : 'font-semibold'} text-ink-900`}>{n.title}</P>
                      <Span className="shrink-0 text-caption text-ink-400">{relativeTime(n.created_at)}</Span>
                    </Div>
                    <P className="mt-0.5 text-body-sm leading-[19px] text-ink-500">{n.message}</P>
                  </Div>
                  {unread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#0068C8', marginTop: 6 }} />}
                </Btn>
              );
            })}
            {loadingMore && <P className="py-3 text-center text-caption text-ink-400">Loading…</P>}
            {!more && items.length > 20 && <P className="py-3 text-center text-caption text-ink-400">That’s everything</P>}
          </Div>
        )}
      </Div>
    </Screen>
  );
}

/* =========================================================== Need Help */

const SUBJECTS = ['Booking issue', 'Payment problem', 'Test results', 'App not working', 'Other'];

export function HelpScreen() {
  const nav = useNav();
  const [subject, setSubject] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ subject?: string; reason?: string }>({});
  const [sending, setSending] = useState(false);
  const cols = useColumns();

  const submit = async () => {
    const e: typeof errors = {};
    if (!subject.trim()) e.subject = 'Choose or type a subject';
    if (reason.trim().length < 10) e.reason = 'Describe the issue in at least 10 characters';
    setErrors(e);
    if (e.subject || e.reason) return;
    setSending(true);
    const r = await Help.request(subject.trim(), reason.trim());
    setSending(false);
    if (r.code === 0) {
      showToast('We’ve received your request', 'success');
      nav.resetTo('home');
    } else showToast(r.message || 'Couldn’t send your request', 'critical');
  };

  return (
    <Screen padBottom={false}>
      <ScreenHeader title="Get Help" />
      <Div className="mx-auto w-full max-w-[680px] gap-5 px-4 pb-[140px] pt-4">
        <Card elevation="tile">
          <Div className="flex-row items-center gap-3">
            <Span className="flex-col h-[42px] w-[42px] items-center justify-center rounded-full bg-brand-50">
              <Headphones className="h-[20px] w-[20px] text-brand-600" strokeWidth={2.1} />
            </Span>
            <Div className="min-w-0 flex-1">
              <P className="text-body font-semibold text-ink-900">KDC+ field operations</P>
              <P className="text-body-sm text-ink-500">Average response time is under 24 hours.</P>
            </Div>
          </Div>
        </Card>

        <Div>
          <P className="text-body-sm font-semibold text-ink-600">What’s it about?</P>
          <Div className="mt-2.5 flex-row flex-wrap gap-2">
            {SUBJECTS.map((s) => {
              const on = subject === s;
              return (
                <Btn
                  key={s}
                  onPress={() => {
                    setSubject(s);
                    setErrors((x) => ({ ...x, subject: undefined }));
                  }}
                  className={`tap rounded-chip px-3.5 py-2 ${on ? 'bg-brand-600' : 'bg-white ring-1 ring-inset ring-ink-200'}`}
                  style={cols > 1 ? undefined : undefined}
                >
                  <Span className={`text-body-sm font-semibold ${on ? 'text-white' : 'text-ink-700'}`}>{s}</Span>
                </Btn>
              );
            })}
          </Div>
          <TextField
            value={subject}
            maxLength={80}
            onChangeText={(v: string) => {
              setSubject(v.slice(0, 80));
              setErrors((x) => ({ ...x, subject: undefined }));
            }}
            placeholder="Or type a subject"
            className={`mt-3 h-[52px] w-full rounded-ctl bg-white px-4 text-body-lg text-ink-900 placeholder:text-ink-300 ring-1 ring-inset ${errors.subject ? 'ring-critical-600' : 'ring-ink-200'}`}
          />
          {errors.subject && <P className="mt-1.5 text-caption text-critical-600">{errors.subject}</P>}
        </Div>

        <Div>
          <Div className="flex-row items-center justify-between">
            <P className="text-body-sm font-semibold text-ink-600">Describe the issue</P>
            <P className={`text-caption tabular-nums ${reason.length > 500 ? 'text-critical-600' : 'text-ink-400'}`}>{reason.length}/500</P>
          </Div>
          <TextField
            multiline
            value={reason}
            maxLength={500}
            onChangeText={(v: string) => {
              setReason(v.slice(0, 500));
              setErrors((x) => ({ ...x, reason: undefined }));
            }}
            placeholder="Booking ID, what happened and what you’ve tried"
            className={`mt-2 min-h-[150px] w-full rounded-ctl bg-white px-4 py-3 text-body-lg text-ink-900 placeholder:text-ink-300 ring-1 ring-inset ${errors.reason ? 'ring-critical-600' : 'ring-ink-200'}`}
          />
          {errors.reason && <P className="mt-1.5 text-caption text-critical-600">{errors.reason}</P>}
        </Div>
      </Div>
      <StickyBar>
        <Button loading={sending} icon={<Send className="h-[17px] w-[17px] text-white" strokeWidth={2.2} />} onClick={submit}>
          Send request
        </Button>
      </StickyBar>
    </Screen>
  );
}

/* ============================================================== Policy */

export function PolicyScreen() {
  const { path, title } = useParams<'policy'>();
  const { data, loading, error, reload } = useFocusFetch(() => Cms.page(path));
  const page = data?.data;
  return (
    <Screen>
      <ScreenHeader title={title} />
      <Div className="mx-auto w-full max-w-[720px] px-5 pb-10 pt-4">
        {loading ? (
          <Div className="gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[90px] w-full" rounded={14} />)}</Div>
        ) : error || !page ? (
          <StateBlock icon={<X className="h-[26px] w-[26px]" strokeWidth={2.2} />} tone="critical" title="Couldn’t load this page" body={error ?? ''} primary={<Button size="md" onClick={() => reload('initial')}>Try again</Button>} />
        ) : (
          <>
            <P className="font-display text-[26px] font-extrabold tracking-[-0.5px] text-ink-900">{page.title}</P>
            <P className="mt-1 text-body-sm text-ink-400">Last updated {page.updated}</P>
            <Div className="mt-5 gap-5">
              {page.sections.map((s) => (
                <Div key={s.heading}>
                  <P className="text-title-sm text-ink-900">{s.heading}</P>
                  <P className="mt-1.5 text-body leading-[23px] text-ink-600">{s.body}</P>
                </Div>
              ))}
            </Div>
          </>
        )}
      </Div>
    </Screen>
  );
}

