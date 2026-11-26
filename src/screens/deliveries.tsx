/** Delivery details: a medicine order the agent picks up at a pharmacy and delivers to a patient. */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Div, P } from '../components/primitives/index';
import { AlertTriangle, Check, Clock, Lock, MapPin, Navigation, Package, Phone, RefreshCw, Store, X } from '../components/primitives/icons';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/Nav';
import { Button, StickyBar } from '../components/ui/Button';
import { Card } from '../components/ui/Display';
import { Banner, Skeleton, StateBlock } from '../components/ui/Feedback';
import { DeliveryPill, openDeliveryDirections, useCallDelivery } from '../components/agent';
import { MoneyChip } from '../components/agent/DeliveryCard';
import { DeliverSheet, FailSheet } from '../components/agent/DeliverySheets';
import { useNav, useParams } from '../navigation/navigation';
import { useFocusFetch } from '../hooks/useFocusFetch';
import { useOnPush } from '../notifications/push';
import { Deliveries } from '../api/endpoints';
import { showToast } from '../store/toast';
import { attemptText, dropLine, itemsText, pickupLine } from '../domain/rules';

const timeOf = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '');

export function DeliveryDetailsScreen() {
  const nav = useNav();
  const { code } = useParams<'delivery-details'>();
  const { data: d, setData, loading, error, reload } = useFocusFetch(() => Deliveries.details(code));
  // Reassigned or reset by KDC+ while open: show what the server says now.
  useOnPush(reload);
  const { calling, call, callPharmacy } = useCallDelivery();
  const [sheet, setSheet] = useState<'deliver' | 'fail' | null>(null);
  const [picking, setPicking] = useState(false);

  if (loading || !d) {
    return (
      <Screen>
        <ScreenHeader title="Delivery" subtitle={code} />
        <Div className="gap-3 p-4">
          {error ? (
            <StateBlock icon={<X className="h-[26px] w-[26px]" strokeWidth={2.2} />} tone="critical" title="Couldn’t load the delivery" body={error} primary={<Button size="md" onClick={() => reload('initial')}>Try again</Button>} />
          ) : (
            <>
              <Skeleton className="h-[150px] w-full" rounded={18} />
              <Skeleton className="h-[180px] w-full" rounded={18} />
            </>
          )}
        </Div>
      </Screen>
    );
  }

  const pickedUp = Boolean(d.pickup?.pickedUpAt) || d.status === 'PICKED_UP';
  const locked = d.codeLocked || d.codeTriesLeft === 0;

  const markPickedUp = async () => {
    setPicking(true);
    const res = await Deliveries.pickedUp(d.code);
    setPicking(false);
    if (res.code === 0 && res.data) {
      setData(res.data);
      showToast('Picked up', 'success');
    } else showToast(res.message || 'Couldn’t mark it picked up', 'critical');
  };

  /** Back to the list, which shows the delivery's new status. */
  const done = (message: string, tone: 'success' | 'caution') => {
    setSheet(null);
    showToast(message, tone);
    nav.resetTo('home', { tab: 'deliveries' });
  };

  return (
    <Screen padBottom={!d.canAct}>
      <ScreenHeader title="Delivery" subtitle={d.code} backTo="home" />
      <Div className={`mx-auto w-full max-w-[760px] gap-3.5 px-4 pt-4 ${d.canAct ? 'pb-[150px]' : 'pb-12'}`}>
        {/* Summary */}
        <Card elevation="card">
          <Div className="flex-row items-center justify-between">
            <P className="text-caption font-semibold tabular-nums text-ink-400">{d.code}</P>
            <DeliveryPill status={d.status} />
          </Div>
          <Div className="mt-2.5 flex-row flex-wrap gap-x-4 gap-y-1.5">
            {d.slot ? <Meta icon={<Clock className="h-[14px] w-[14px] text-ink-400" strokeWidth={2.2} />} text={d.slot} /> : null}
            <Meta icon={<Package className="h-[14px] w-[14px] text-ink-400" strokeWidth={2.2} />} text={`${itemsText(d)} · ${d.items.lines} ${d.items.lines === 1 ? 'medicine' : 'medicines'}`} />
            <Meta icon={<RefreshCw className="h-[14px] w-[14px] text-ink-400" strokeWidth={2.2} />} text={attemptText(d)} />
          </Div>
          <Div className="mt-3 flex-row flex-wrap gap-2">
            <MoneyChip delivery={d} />
          </Div>
          {d.status === 'DELIVERED' && (d.deliveredAt || d.deliveredTo) ? (
            <P className="mt-3 text-body-sm text-ink-600">
              Delivered{d.deliveredAt ? ` at ${timeOf(d.deliveredAt)}` : ''}{d.deliveredTo ? ` · handed to ${d.deliveredTo}` : ''}
            </P>
          ) : null}
        </Card>

        {d.status === 'FAILED' && d.lastFailure ? (
          <Banner
            tone="critical"
            icon={<AlertTriangle className="h-[18px] w-[18px] text-critical-700" strokeWidth={2.2} />}
            title={`Couldn’t deliver: ${d.lastFailure.label ?? 'failed attempt'}`}
            body={[d.lastFailure.note, d.nextStep === 'return_to_pharmacy' ? `Bring the parcel back to ${d.pickup?.name ?? 'the pharmacy'}.` : null].filter(Boolean).join(' ')}
          />
        ) : null}
        {d.status === 'REASSIGNED' ? (
          <Banner tone="brand" title="KDC+ gave this delivery to someone else" body="You don’t need to do anything more with it." />
        ) : null}
        {d.canAct && locked ? (
          <Banner
            tone="critical"
            icon={<Lock className="h-[18px] w-[18px] text-critical-700" strokeWidth={2.2} />}
            title="Delivery code locked"
            body="Too many wrong codes. Ask KDC+ to reset the code; the patient then gets a new one."
          />
        ) : null}

        {/* Pick up */}
        {d.pickup ? (
          <Card elevation="tile">
            <Div className="flex-row items-center justify-between">
              <P className="text-caption font-semibold uppercase tracking-[.08em] text-ink-400">Pick up</P>
              {pickedUp ? (
                <Div className="flex-row items-center gap-1">
                  <Check className="h-[14px] w-[14px] text-vital-700" strokeWidth={2.6} />
                  <P className="text-caption font-semibold text-vital-700">Picked up{d.pickup.pickedUpAt ? ` ${timeOf(d.pickup.pickedUpAt)}` : ''}</P>
                </Div>
              ) : null}
            </Div>
            <Div className="mt-1.5 flex-row items-center gap-2">
              <Store className="h-[16px] w-[16px] text-ink-500" strokeWidth={2.2} />
              <P className="text-title-sm text-ink-900">{d.pickup.name}</P>
            </Div>
            <P className="mt-1 text-body-sm leading-[19px] text-ink-600">{pickupLine(d)}</P>
            {d.pickup.phone ? <P className="mt-0.5 text-body-sm text-ink-500">{d.pickup.phone}</P> : null}
            {d.canAct || d.nextStep === 'return_to_pharmacy' ? (
              <Div className="mt-3.5 flex-row gap-2.5">
                <Div className="flex-1">
                  <Button size="md" variant="tertiary" icon={<Navigation className="h-[16px] w-[16px] text-ink-800" strokeWidth={2.2} />} onClick={() => openDeliveryDirections(d, 'pickup')}>
                    Directions
                  </Button>
                </Div>
                {d.pickup.phone ? (
                  <Div className="flex-1">
                    <Button size="md" variant="secondary" icon={<Phone className="h-[16px] w-[16px] text-brand-700" strokeWidth={2.2} />} onClick={() => callPharmacy(d)}>
                      Call
                    </Button>
                  </Div>
                ) : null}
              </Div>
            ) : null}
            {d.canAct && !pickedUp ? (
              <Div className="mt-2.5">
                <Button size="md" variant="secondary" loading={picking} icon={<Package className="h-[16px] w-[16px] text-brand-700" strokeWidth={2.2} />} onClick={markPickedUp}>
                  Picked up the parcel
                </Button>
              </Div>
            ) : null}
          </Card>
        ) : null}

        {/* Drop */}
        <Card elevation="tile">
          <P className="text-caption font-semibold uppercase tracking-[.08em] text-ink-400">Deliver to</P>
          <P className="mt-1.5 text-title-sm text-ink-900">{d.drop.name || 'Patient'}</P>
          {d.drop.label ? <P className="mt-0.5 text-body-sm text-ink-500">{d.drop.label.charAt(0).toUpperCase() + d.drop.label.slice(1)}</P> : null}
          <Div className="mt-2.5 flex-row items-start gap-2.5">
            <MapPin className="mt-[2px] h-[15px] w-[15px] shrink-0 text-brand-600" strokeWidth={2.2} />
            <P className="min-w-0 flex-1 text-body-sm leading-[19px] text-ink-600">{dropLine(d)}</P>
          </Div>
          {d.drop.phone ? <P className="mt-1 text-body-sm text-ink-500">{d.drop.phone}</P> : null}
          {d.canAct ? (
            <Div className="mt-3.5 flex-row gap-2.5">
              <Div className="flex-1">
                <Button size="md" variant="tertiary" icon={<Navigation className="h-[16px] w-[16px] text-ink-800" strokeWidth={2.2} />} onClick={() => openDeliveryDirections(d, 'drop')}>
                  Directions
                </Button>
              </Div>
              <Div className="flex-1">
                <Button size="md" variant="secondary" loading={calling === d.code} icon={<Phone className="h-[16px] w-[16px] text-brand-700" strokeWidth={2.2} />} onClick={() => call(d)}>
                  Call
                </Button>
              </Div>
            </Div>
          ) : null}
        </Card>
      </Div>

      {d.canAct ? (
        <StickyBar>
          <Div className="flex-row gap-2.5">
            <Div className="flex-1">
              <Button variant="tertiary" onClick={() => setSheet('fail')}>Couldn’t deliver</Button>
            </Div>
            <Div className="flex-1">
              <Button variant="success" icon={<Check className="h-[18px] w-[18px] text-white" strokeWidth={2.8} />} onClick={() => setSheet('deliver')}>
                Deliver
              </Button>
            </Div>
          </Div>
        </StickyBar>
      ) : null}

      <DeliverSheet
        visible={sheet === 'deliver'}
        delivery={d}
        onClose={() => setSheet(null)}
        onWrongCode={() => reload()}
        onDelivered={() => done('Delivered', 'success')}
      />
      <FailSheet
        visible={sheet === 'fail'}
        delivery={d}
        onClose={() => setSheet(null)}
        onFailed={(after) => done(`Failed delivery recorded. Bring the parcel back to ${after.pickup?.name ?? 'the pharmacy'}.`, 'caution')}
      />
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
