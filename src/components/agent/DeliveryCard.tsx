import React from 'react';
import { View } from 'react-native';
import { Div, P, Span } from '../primitives/index';
import { Banknote, Clock, CreditCard, MapPin, Package, RefreshCw, Store } from '../primitives/icons';
import { Card } from '../ui/Display';
import type { Delivery } from '../../domain/types';
import { attemptText, codDue, itemsText, rupee } from '../../domain/rules';
import { CallIcon, CardAction, DeliveryPill, DirectionsIcon, openDeliveryDirections } from './index';

/**
 * A medicine delivery on Home (with Directions and Call) or in History (read-only).
 * Tapping the card opens the delivery.
 */
export function DeliveryCard({
  delivery: d,
  variant = 'active',
  calling,
  onCall,
  onOpen,
}: {
  delivery: Delivery;
  variant?: 'active' | 'past';
  calling?: boolean;
  onCall?: () => void;
  onOpen?: () => void;
}) {
  const past = variant === 'past';
  const goBack = d.nextStep === 'return_to_pharmacy';

  return (
    <Card padded={false} elevation="card" className="overflow-hidden" onClick={onOpen}>
      <Div className="p-4">
        <Div className="flex-row items-center justify-between gap-3">
          <P className="text-caption font-semibold tabular-nums tracking-[.02em] text-ink-400">{d.code}</P>
          <DeliveryPill status={d.status} />
        </Div>

        {/* Pickup → drop */}
        <Div className="mt-3 gap-2 rounded-tile bg-ink-50 p-3">
          <Div className="flex-row items-start gap-3">
            <Store className="mt-[2px] h-[16px] w-[16px] shrink-0 text-ink-500" strokeWidth={2.2} />
            <Div className="min-w-0 flex-1">
              <P className="text-caption uppercase tracking-[.06em] text-ink-400">Pick up</P>
              <P className="text-body font-semibold text-ink-900">{d.pickup?.name ?? 'Pharmacy'}</P>
              {d.pickup?.locality ? <P className="text-body-sm text-ink-500">{d.pickup.locality}</P> : null}
            </Div>
          </Div>
          <View style={{ marginLeft: 7, width: 2, height: 10, borderRadius: 1, backgroundColor: '#CBD5E1' }} />
          <Div className="flex-row items-start gap-3">
            <MapPin className="mt-[2px] h-[16px] w-[16px] shrink-0 text-brand-600" strokeWidth={2.2} />
            <Div className="min-w-0 flex-1">
              <P className="text-caption uppercase tracking-[.06em] text-ink-400">Drop</P>
              <P className="text-body font-semibold text-ink-900">{d.drop.name || 'Patient'}</P>
              <P className="text-body-sm text-ink-500">{[d.drop.area, d.drop.city].filter(Boolean).join(', ')}</P>
            </Div>
          </Div>
        </Div>

        <Div className="mt-3 flex-row flex-wrap items-center gap-x-4 gap-y-1.5">
          {d.slot ? <Meta icon={<Clock className="h-[14px] w-[14px] text-ink-400" strokeWidth={2.2} />} text={d.slot} /> : null}
          <Meta icon={<Package className="h-[14px] w-[14px] text-ink-400" strokeWidth={2.2} />} text={itemsText(d)} />
          {!past && d.attempts.max > 0 ? <Meta icon={<RefreshCw className="h-[14px] w-[14px] text-ink-400" strokeWidth={2.2} />} text={attemptText(d)} /> : null}
        </Div>

        <Div className="mt-3 flex-row flex-wrap gap-2">
          <MoneyChip delivery={d} />
        </Div>

        {goBack && !past ? (
          <P className="mt-3 text-body-sm font-semibold text-critical-600">Bring the parcel back to {d.pickup?.name ?? 'the pharmacy'}</P>
        ) : null}

        {!past && (
          <Div className="mt-3.5 flex-row gap-2.5">
            <CardAction icon={<DirectionsIcon />} label="Directions" onPress={() => openDeliveryDirections(d)} />
            {d.canAct ? <CardAction icon={<CallIcon />} label="Call patient" tone="brand" busy={calling} onPress={() => onCall?.()} /> : null}
          </Div>
        )}
      </Div>
    </Card>
  );
}

/** "Collect ₹486" (cash on delivery, still to collect), "Cash collected", or "Prepaid". */
export function MoneyChip({ delivery: d }: { delivery: Delivery }) {
  const due = codDue(d);
  if (due !== null) {
    return (
      <Span className="flex-row items-center gap-1.5 rounded-chip bg-caution-50 px-2.5 py-1">
        <Banknote className="h-[13px] w-[13px] text-caution-700" strokeWidth={2.2} />
        <Span className="text-caption font-semibold text-caution-700">Collect {rupee(due)}</Span>
      </Span>
    );
  }
  if (d.payment.collected) {
    return (
      <Span className="flex-row items-center gap-1.5 rounded-chip bg-vital-50 px-2.5 py-1">
        <Banknote className="h-[13px] w-[13px] text-vital-700" strokeWidth={2.2} />
        <Span className="text-caption font-semibold text-vital-700">Cash collected · {rupee(d.payment.collected)}</Span>
      </Span>
    );
  }
  return (
    <Span className="flex-row items-center gap-1.5 rounded-chip bg-vital-50 px-2.5 py-1">
      <CreditCard className="h-[13px] w-[13px] text-vital-700" strokeWidth={2.2} />
      <Span className="text-caption font-semibold text-vital-700">Prepaid</Span>
    </Span>
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
