import { Btn, Div, P, Span } from '../primitives/index'
import React, { useEffect, useRef, useState } from 'react'
import { Dimensions, Keyboard, Modal as RNModal, Platform, View } from 'react-native'
import { FrameBox } from './DeviceFrame'
import { Check, X, Info, AlertTriangle, Loader2 } from '../primitives/icons'
import { DEVICE } from './Screen'
import { EcgLine } from './Logo'

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ className = '', rounded = 10 }: { className?: string; rounded?: number }) {
  return <Div className={`skeleton ${className}`} style={{ borderRadius: rounded }} />
}

export function SkeletonDoctorCard() {
  return (
    <Div className="rounded-card bg-white p-4 shadow-tile">
      <Div className="flex-row gap-3.5">
        <Skeleton className="h-[62px] w-[62px]" rounded={18} />
        <Div className="flex-1 gap-2 pt-1">
          <Skeleton className="h-[13px] w-[62%]" />
          <Skeleton className="h-[11px] w-[45%]" />
          <Skeleton className="h-[11px] w-[32%]" />
        </Div>
      </Div>
      <Div className="mt-3.5 flex-row gap-2">
        <Skeleton className="h-[26px] w-[82px]" rounded={12} />
        <Skeleton className="h-[26px] w-[72px]" rounded={12} />
      </Div>
      <Div className="mt-3.5 h-px bg-ink-100" />
      <Div className="mt-3.5 flex-row items-center justify-between">
        <Skeleton className="h-[13px] w-[88px]" />
        <Skeleton className="h-[34px] w-[106px]" rounded={12} />
      </Div>
    </Div>
  )
}

/* ------------------------------------------------------------- Empty/Error */

/**
 * A single, serious empty/error presentation used everywhere. The glyph sits
 * in a soft tinted disc — no illustrations, no mascots.
 */
export function StateBlock({
  icon,
  title,
  body,
  tone = 'neutral',
  primary,
  secondary,
  className = '',
  compact = false,
}: {
  icon: React.ReactNode
  title: string
  body?: string
  tone?: 'neutral' | 'brand' | 'critical' | 'caution' | 'success'
  primary?: React.ReactNode
  secondary?: React.ReactNode
  className?: string
  compact?: boolean
}) {
  const tones = {
    neutral: 'bg-ink-50 text-ink-400',
    brand: 'bg-brand-50 text-brand-600',
    critical: 'bg-critical-50 text-critical-600',
    caution: 'bg-caution-50 text-caution-600',
    success: 'bg-vital-50 text-vital-600',
  }[tone]
  return (
    <Div className={` flex-col items-center px-8 text-center ${className}`}>
      <Div
        className={`flex-col items-center justify-center rounded-[26px] ${tones}`}
        style={{ width: compact ? 64 : 80, height: compact ? 64 : 80 }}
      >
        {icon}
      </Div>
      <P className={`mt-5 text-ink-900 ${compact ? 'text-title-sm' : 'text-title-md'}`}>{title}</P>
      {body && <P className="mt-2 max-w-[290px] text-body leading-[22px] text-ink-500">{body}</P>}
      {(primary || secondary) && (
        <Div className="mt-7 w-full gap-2.5">
          {primary}
          {secondary}
        </Div>
      )}
    </Div>
  )
}

/* ---------------------------------------------------------------- Loading */

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <Div className=" flex-col items-center">
      <Div className="relative flex-col h-[76px] w-[76px] items-center justify-center">
        <Span className="absolute inset-0 animate-pulseRing rounded-full bg-brand-600/18" />
        <Span className="absolute inset-0 animate-pulseRing rounded-full bg-brand-600/18 [animation-delay:.7s]" />
        <Span className="relative flex-col h-[52px] w-[52px] items-center justify-center rounded-full bg-white shadow-card">
          <Loader2 className="h-[22px] w-[22px] animate-spinSlow text-brand-600" strokeWidth={2.6} />
        </Span>
      </Div>
      <P className="mt-5 text-body font-medium text-ink-500">{label}</P>
    </Div>
  )
}

/** Brand-owned loading moment used on payment / connection screens. */
export function EcgLoader({ label, sub }: { label: string; sub?: string }) {
  return (
    <Div className=" flex-col items-center text-center">
      <EcgLine animate width={240} height={34} stroke="#0068C8" />
      <P className="mt-6 text-title-sm text-ink-900">{label}</P>
      {sub && <P className="mt-1.5 max-w-[270px] text-body text-ink-500">{sub}</P>}
    </Div>
  )
}

/* ------------------------------------------------------------------- Toast */

export function Toast({
  tone = 'success',
  title,
  body,
  className = '',
}: {
  tone?: 'success' | 'critical' | 'info' | 'caution'
  title: string
  body?: string
  className?: string
}) {
  const map = {
    success: { bg: 'bg-vital-600', Icon: Check },
    critical: { bg: 'bg-critical-600', Icon: X },
    info: { bg: 'bg-brand-600', Icon: Info },
    caution: { bg: 'bg-caution-600', Icon: AlertTriangle },
  }[tone]
  const Icon = map.Icon
  return (
    <Div
      className={`flex-row items-center gap-3 rounded-tile bg-ink-900/95 px-3.5 py-3 shadow-lift  ${className}`}
    >
      <Span className={`flex-col h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full ${map.bg}`}>
        <Icon className="h-[15px] w-[15px] text-white" strokeWidth={3} />
      </Span>
      <Div className="min-w-0 flex-1">
        <P className="truncate text-body-sm font-semibold text-white">{title}</P>
        {body && <P className="truncate text-caption text-white/60">{body}</P>}
      </Div>
    </Div>
  )
}

/* ------------------------------------------------------------- Bottom sheet */

/**
 * How much of the bottom of a full-window view the keyboard covers (0 when it's closed).
 * KeyboardAvoidingView misjudges this inside a Modal on Android (edge-to-edge: the keyboard's
 * reported height leaves out the navigation bar, and its screenY is in the app window's
 * coordinates), which hid the code boxes and the button. So: the keyboard's height, plus the
 * navigation bar on Android; and nothing when the window itself shrank for the keyboard.
 */
export function useKeyboardInset() {
  const [keyboard, setKeyboard] = useState(0)
  const [height, setHeight] = useState(0)
  const fullHeight = useRef(0)
  useEffect(() => {
    const ios = Platform.OS === 'ios'
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboard(e.endCoordinates?.height ?? 0))
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  const onLayout = (e: { nativeEvent: { layout: { height: number } } }) => {
    const h = e.nativeEvent.layout.height
    if (!keyboard || h > fullHeight.current) fullHeight.current = h
    setHeight(h)
  }
  if (!keyboard) return { inset: 0, onLayout }
  // The window was resized for the keyboard (adjustResize): the view already ends above it.
  const resized = fullHeight.current > 0 && fullHeight.current - height > keyboard * 0.5
  return { inset: resized ? 0 : keyboard + (Platform.OS === 'android' ? DEVICE.safeBottom : 0), onLayout }
}

export function BottomSheet({
  title,
  subtitle,
  children,
  onClose,
  footer,
  scrim = true,
}: {
  title?: string
  subtitle?: string
  children: React.ReactNode
  onClose?: () => void
  footer?: React.ReactNode
  scrim?: boolean
}) {
  const { inset, onLayout } = useKeyboardInset()
  // With the keyboard open the sheet sits on top of it, and its body scrolls within what's left.
  const room = Dimensions.get('window').height - inset - DEVICE.safeTop - (title ? 96 : 40) - (footer ? 80 : 0)
  return (
    <View onLayout={onLayout} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50 }}>
    <Div className="flex-1 flex-col justify-end">
      {scrim && <Btn onPress={onClose} className="absolute inset-0 bg-ink-900/40 " />}
      <Div
        className="relative animate-sheetUp rounded-t-[26px] bg-white shadow-sheet"
        style={{ paddingBottom: inset ? inset + 8 : DEVICE.safeBottom }}
      >
        <Div className="flex-row justify-center pb-1 pt-2.5">
          <Span className="h-[5px] w-[38px] rounded-full bg-ink-200" />
        </Div>
        {title && (
          <Div className="flex-row items-start justify-between gap-4 px-5 pb-1 pt-2">
            <Div className="min-w-0 flex-1">
              <P className="text-title-md text-ink-900">{title}</P>
              {subtitle && <P className="mt-1 text-body-sm text-ink-500">{subtitle}</P>}
            </Div>
            {onClose && (
              <Btn
                onPress={onClose}
                className="tap -mr-1 flex-col h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-ink-50"
              >
                <X className="h-[16px] w-[16px] text-ink-500" strokeWidth={2.6} />
              </Btn>
            )}
          </Div>
        )}
        <Div className="max-h-[520px] overflow-y-auto  px-5 pb-2 pt-3" style={inset ? { maxHeight: Math.max(160, Math.min(520, room)) } : undefined}>{children}</Div>
        {footer && <Div className="border-t border-ink-100 px-5 pb-1 pt-3.5">{footer}</Div>}
      </Div>
    </Div>
    </View>
  )
}

/** A BottomSheet any component can raise, wherever it sits in the screen tree. */
export function ModalSheet({
  visible,
  onClose,
  children,
  ...sheet
}: React.ComponentProps<typeof BottomSheet> & { visible: boolean }) {
  return (
    <RNModal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <FrameBox>
        <BottomSheet onClose={onClose} {...sheet}>
          {children}
        </BottomSheet>
      </FrameBox>
    </RNModal>
  )
}

/* ------------------------------------------------------------------- Modal */

export function Modal({
  icon,
  tone = 'brand',
  title,
  body,
  actions,
}: {
  icon?: React.ReactNode
  tone?: 'brand' | 'critical' | 'caution'
  title: string
  body?: string
  actions: React.ReactNode
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    critical: 'bg-critical-50 text-critical-600',
    caution: 'bg-caution-50 text-caution-600',
  }[tone]
  return (
    <Div className="absolute inset-0 z-50 flex-col items-center justify-center px-7">
      <Div className="absolute inset-0 bg-ink-900/42 " />
      <Div className="relative w-full animate-riseIn rounded-[22px] bg-white p-6 text-center shadow-lift">
        {icon && <Div className={`mx-auto flex-col h-[58px] w-[58px] items-center justify-center rounded-[20px] ${tones}`}>{icon}</Div>}
        <P className="mt-4 text-title-md text-ink-900">{title}</P>
        {body && <P className="mt-2 text-body leading-[21px] text-ink-500">{body}</P>}
        <Div className="mt-6 gap-2.5">{actions}</Div>
      </Div>
    </Div>
  )
}

/* ---------------------------------------------------------------- Timeline */

export type TimelineStep = {
  title: string
  time?: string
  body?: string
  state: 'done' | 'active' | 'pending' | 'failed'
  meta?: React.ReactNode
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <Div className="relative">
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        const done = s.state === 'done'
        const active = s.state === 'active'
        const failed = s.state === 'failed'
        return (
          <Div key={i} className={`relative flex-row gap-3.5 ${last ? '' : 'pb-6'}`}>
            {/* Rail */}
            {!last && (
              <Span
                className={`absolute left-[11px] top-[24px] w-[2px] rounded-full ${
                  done ? 'bg-vital-600' : 'bg-ink-100'
                }`}
                style={{ bottom: 2 }}
              />
            )}
            {/* Node */}
            <Span className="relative z-10 shrink-0 pt-[1px]">
              {done ? (
                <Span className="flex-col h-[24px] w-[24px] items-center justify-center rounded-full bg-vital-600">
                  <Check className="h-[13px] w-[13px] text-white" strokeWidth={3.4} />
                </Span>
              ) : failed ? (
                <Span className="flex-col h-[24px] w-[24px] items-center justify-center rounded-full bg-critical-600">
                  <X className="h-[13px] w-[13px] text-white" strokeWidth={3.4} />
                </Span>
              ) : active ? (
                <Span className="relative flex-col h-[24px] w-[24px] items-center justify-center">
                  <Span className="absolute inset-0 animate-pulseRing rounded-full bg-brand-600/35" />
                  <Span className="relative flex-col h-[24px] w-[24px] items-center justify-center rounded-full bg-brand-600 ring-[3px] ring-brand-100">
                    <Span className="h-[7px] w-[7px] rounded-full bg-white" />
                  </Span>
                </Span>
              ) : (
                <Span className="flex-col h-[24px] w-[24px] items-center justify-center rounded-full bg-white ring-[2px] ring-inset  ring-ink-200">
                  <Span className="h-[7px] w-[7px] rounded-full bg-ink-200" />
                </Span>
              )}
            </Span>
            {/* Content */}
            <Div className="min-w-0 flex-1 pt-[1px]">
              <Div className="flex-row items-baseline justify-between gap-3">
                <P
                  className={`text-body-lg font-semibold ${
                    s.state === 'pending' ? 'text-ink-400' : failed ? 'text-critical-700' : 'text-ink-900'
                  }`}
                >
                  {s.title}
                </P>
                {s.time && <Span className="shrink-0 text-caption tabular-nums text-ink-400">{s.time}</Span>}
              </Div>
              {s.body && <P className="mt-1 text-body-sm leading-[19px] text-ink-500">{s.body}</P>}
              {s.meta && <Div className="mt-2.5">{s.meta}</Div>}
            </Div>
          </Div>
        )
      })}
    </Div>
  )
}

/** Thin inline banner for contextual warnings inside a screen. */
export function Banner({
  tone = 'caution',
  icon,
  title,
  body,
  action,
  onAction,
}: {
  tone?: 'caution' | 'critical' | 'brand' | 'success'
  icon?: React.ReactNode
  title: string
  body?: string
  action?: string
  onAction?: () => void
}) {
  const tones = {
    caution: 'bg-caution-50 text-caution-700',
    critical: 'bg-critical-50 text-critical-700',
    brand: 'bg-brand-50 text-brand-700',
    success: 'bg-vital-50 text-vital-700',
  }[tone]
  return (
    <Div className={`flex-row items-start gap-3 rounded-tile p-3.5 ${tones}`}>
      {icon && <Span className="mt-[1px] shrink-0">{icon}</Span>}
      <Div className="min-w-0 flex-1">
        <P className="text-body-sm font-semibold">{title}</P>
        {body && <P className="mt-0.5 text-body-sm leading-[18px] opacity-80">{body}</P>}
      </Div>
      {action && (
        <Btn onPress={onAction} className="tap shrink-0 text-body-sm font-bold underline">
          {action}
        </Btn>
      )}
    </Div>
  )
}

;(BottomSheet as any).overlay = true
;(Modal as any).overlay = true
