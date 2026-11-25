/** Home — active bookings (spec 4.4). */
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Btn, Div, P, Span } from '../components/primitives/index';
import { Bell, ClipboardCheck, Inbox, User, X } from '../components/primitives/icons';
import { Screen, DEVICE } from '../components/ui/Screen';
import { Skeleton, StateBlock } from '../components/ui/Feedback';
import { Logo } from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { BookingCard } from '../components/agent/BookingCard';
import { ConfirmDialog, Grid, useCallPatient } from '../components/agent';
import { AgentMark } from './auth';
import { useNav } from '../navigation/navigation';
import { useFocusFetch } from '../hooks/useFocusFetch';
import { Bookings, LIVE, Profile } from '../api/endpoints';
import { CodeSheet } from '../components/agent/CodeSheet';
import { badgeText, useSession } from '../store/session';
import { showToast } from '../store/toast';
import { useOnPush } from '../notifications/push';
import type { Booking } from '../domain/types';
import { normaliseStatus } from '../domain/rules';
import { profile } from '../mock-data/seed';

export function HomeScreen() {
  const nav = useNav();
  const unread = useSession((s) => s.unread);
  const { data, loading, refreshing, error, reload, refresh } = useFocusFetch(() => Bookings.active());
  const bookings = data ?? [];
  // A push (a job assigned or cancelled): the list updates without pulling to refresh.
  useOnPush(reload);
  const { calling, call } = useCallPatient();
  const [rejecting, setRejecting] = useState<Booking | null>(null);
  const [busyReject, setBusyReject] = useState(false);
  const [coding, setCoding] = useState<Booking | null>(null);
  const { data: me } = useFocusFetch(() => Profile.get());
  const firstName = (LIVE ? (me?.name ?? '') : profile.name).split(' ')[0];

  const startCollection = async (code: string) => {
    if (!coding) return null;
    const res = await Bookings.setStatus(coding.id, 'ONGOING', code);
    if (res.code !== 0) return res.message || 'Couldn’t start collection';
    const bookingId = coding.booking_id;
    setCoding(null);
    nav.navigate('test-details', { params: { bookingId } });
    reload();
    return null;
  };

  const counts = {
    ACCEPTED: bookings.filter((b) => normaliseStatus(b.booking_status) === 'ACCEPTED').length,
    ONMYWAY: bookings.filter((b) => normaliseStatus(b.booking_status) === 'ONMYWAY').length,
    ONGOING: bookings.filter((b) => normaliseStatus(b.booking_status) === 'ONGOING').length,
  };

  const slide = useCallback(
    async (b: Booking) => {
      const status = normaliseStatus(b.booking_status);
      if (status === 'ACCEPTED') {
        const res = await Bookings.setStatus(b.id, 'ONMYWAY');
        if (res.code === 0) showToast('Trip started', 'success');
        else showToast(res.message || 'Couldn’t start the trip', 'critical');
        await reload();
      } else if (status === 'ONMYWAY') {
        // Live: the code comes from the customer at the door, not from the server.
        if (LIVE) return setCoding(b);
        const res = await Bookings.setStatus(b.id, 'ONGOING', b.agent_otp);
        if (res.code === 0) nav.navigate('test-details', { params: { bookingId: b.booking_id } });
        else showToast(res.message || 'Couldn’t start collection', 'critical');
        await reload();
      } else if (status === 'ONGOING') {
        nav.navigate('test-details', { params: { bookingId: b.booking_id } });
      }
    },
    [nav, reload],
  );

  const reject = async () => {
    if (!rejecting) return;
    setBusyReject(true);
    const res = await Bookings.setStatus(rejecting.id, 'REJECTED');
    setBusyReject(false);
    if (res.code === 0) {
      showToast('Booking rejected', 'success');
      setRejecting(null);
      reload();
    } else showToast(res.message || 'Couldn’t reject the booking', 'critical');
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <Screen background="bg-canvas" onRefresh={refresh} refreshing={refreshing} padTop={false} topScrim>
      {/* Header */}
      <Div className="bg-white px-5 pb-4" style={{ paddingTop: DEVICE.safeTop + 10 }}>
        <Div className="flex-row items-center justify-between">
          <Div className="flex-row items-center gap-2.5">
            <Logo variant="wordmark" width={74} />
            <AgentMark small />
          </Div>
          <Div className="flex-row items-center gap-2">
            <Btn
              onPress={() => nav.navigate('notifications')}
              accessibilityLabel={`Notifications, ${unread} unread`}
              className="tap relative flex-col h-[42px] w-[42px] items-center justify-center rounded-full bg-ink-50"
            >
              <Bell className="h-[20px] w-[20px] text-ink-700" strokeWidth={2.1} />
              {unread > 0 && (
                <View style={{ position: 'absolute', top: -2, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' }}>
                  <P className="text-[10px] font-bold text-white">{badgeText(unread)}</P>
                </View>
              )}
            </Btn>
            <Btn
              onPress={() => nav.navigate('profile')}
              accessibilityLabel="Profile"
              className="tap flex-col h-[42px] w-[42px] items-center justify-center rounded-full bg-brand-600"
            >
              <User className="h-[20px] w-[20px] text-white" strokeWidth={2.2} />
            </Btn>
          </Div>
        </Div>
        <P className="mt-5 text-body text-ink-500">{greeting}{firstName ? `, ${firstName}` : ''}</P>
        <P className="mt-0.5 font-display text-[26px] font-extrabold tracking-[-0.5px] text-ink-900">Today’s collections</P>
        <Div className="mt-4 flex-row gap-2.5">
          <Stat label="Accepted" value={counts.ACCEPTED} dot="#EA580C" />
          <Stat label="On the way" value={counts.ONMYWAY} dot="#0068C8" />
          <Stat label="In progress" value={counts.ONGOING} dot="#7C3AED" />
        </Div>
      </Div>

      <Div className="px-4 pb-8 pt-4">
        {loading ? (
          <Div className="gap-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-[300px] w-full" rounded={18} />
            ))}
          </Div>
        ) : error && !bookings.length ? (
          <StateBlock
            icon={<X className="h-[26px] w-[26px]" strokeWidth={2.2} />}
            tone="critical"
            title="Couldn’t load bookings"
            body={error}
            primary={<Button size="md" onClick={() => reload('initial')}>Try again</Button>}
          />
        ) : bookings.length === 0 ? (
          <Div className="mt-10">
            <StateBlock
              icon={<Inbox className="h-[26px] w-[26px]" strokeWidth={2} />}
              tone="brand"
              title="No active bookings"
              body="New bookings assigned to you will appear here."
              secondary={
                <Button variant="tertiary" size="md" icon={<ClipboardCheck className="h-[16px] w-[16px] text-ink-800" strokeWidth={2.2} />} onClick={() => nav.navigate('history')}>
                  View history
                </Button>
              }
            />
          </Div>
        ) : (
          <Grid
            items={bookings}
            keyOf={(b) => String(b.id)}
            render={(b) => (
              <BookingCard
                booking={b}
                calling={calling === b.id}
                onCall={() => call(b)}
                onSlide={() => slide(b)}
                onReject={() => setRejecting(b)}
              />
            )}
          />
        )}
      </Div>

      <ConfirmDialog
        visible={Boolean(rejecting)}
        destructive
        title="Reject this booking?"
        message="The customer will be notified that you can't take this booking."
        confirmLabel="Reject booking"
        cancelLabel="Keep booking"
        loading={busyReject}
        onConfirm={reject}
        onCancel={() => setRejecting(null)}
      />
      <CodeSheet visible={Boolean(coding)} onSubmit={startCollection} onClose={() => setCoding(null)} />
    </Screen>
  );
}

function Stat({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <Div className="flex-1 rounded-tile bg-ink-50 px-3 py-2.5">
      <Div className="flex-row items-center gap-1.5">
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
        <Span className="text-caption text-ink-500">{label}</Span>
      </Div>
      <P className="mt-1 font-display text-[22px] font-extrabold tabular-nums text-ink-900">{value}</P>
    </Div>
  );
}
