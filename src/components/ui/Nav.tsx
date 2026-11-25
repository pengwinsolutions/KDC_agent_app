import { Btn, Div, P } from '../primitives/index'
import React, { useContext } from 'react'
import { ChevronLeft } from '../primitives/icons'
import { useNav } from '../../navigation/navigation'
import { DEVICE, DirectStickyHeader, InTabs } from './Screen'

/**
 * iOS-style navigation bar. Pinned below the Dynamic Island, translucent on
 * scroll, with an optional large-title variant used on section roots.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  tone = 'light',
  border = true,
  transparent = false,
  backTo,
  embedded = false,
}: {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  onBack?: () => void
  right?: React.ReactNode
  tone?: 'light' | 'dark'
  border?: boolean
  transparent?: boolean
  backTo?: string
  /** True when a parent already applies the sticky position and safe area. */
  embedded?: boolean
}) {
  const nav = useNav()
  const dark = tone === 'dark'
  const direct = useContext(DirectStickyHeader)
  const handleBack = onBack ?? (() => (backTo ? nav.navigate(backTo as any) : nav.back()))
  return (
    <Div
      className={`${embedded ? '' : 'z-40'} ${
        transparent ? '' : dark ? 'bg-ink-900/85 ' : 'bg-white/88 '
      } ${border && !transparent ? (dark ? '' : 'border-b border-ink-100') : ''}`}
      style={embedded ? undefined : { marginTop: direct ? 0 : -DEVICE.safeTop, paddingTop: DEVICE.safeTop }}
    >
      <Div className="relative flex-row h-[50px] items-center px-2">
        <Btn
          onPress={handleBack}
          className={`tap flex-col h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full ${
            transparent ? 'bg-white/88 shadow-tile ' : ''
          }`}
        >
          <ChevronLeft className={`h-[23px] w-[23px] ${dark ? 'text-white' : 'text-ink-800'}`} strokeWidth={2.4} />
        </Btn>
        <Div className="pointer-events-none absolute inset-x-[52px] text-center">
          {title && (
            <P className={`truncate text-title-sm ${dark ? 'text-white' : 'text-ink-900'}`}>{title}</P>
          )}
          {subtitle && (
            <P className={`truncate text-caption ${dark ? 'text-white/60' : 'text-ink-400'}`}>{subtitle}</P>
          )}
        </Div>
        <Div className="ml-auto flex-row shrink-0 items-center gap-1 pr-1">{right}</Div>
      </Div>
    </Div>
  )
}

/** Large-title header for section roots (Pharmacy, Diagnostics, Records...). */
export function LargeHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  right?: React.ReactNode
}) {
  const nav = useNav()
  return (
    <Div className="bg-white px-5 pb-4" style={{ marginTop: -DEVICE.safeTop, paddingTop: DEVICE.safeTop }}>
      <Div className="flex-row h-[50px] items-center justify-between">
        <Btn
          onPress={onBack ?? nav.back}
          className="tap -ml-2 flex-col h-[38px] w-[38px] items-center justify-center rounded-full"
        >
          <ChevronLeft className="h-[23px] w-[23px] text-ink-800" strokeWidth={2.4} />
        </Btn>
        <Div className="flex-row items-center gap-1">{right}</Div>
      </Div>
      <P className="mt-1 text-title-lg text-ink-900">{title}</P>
      {subtitle && <P className="mt-1 text-body text-ink-500">{subtitle}</P>}
    </Div>
  )
}

/** Kept for the shared Screen component; the agent app has no tab bar. */
export { InTabs }

/** Horizontal scroller that bleeds to the screen edges — iOS carousel pattern. */
export function HScroll({
  children,
  className = '',
  gap = 12,
  padX = 20,
}: {
  children: React.ReactNode
  className?: string
  gap?: number
  padX?: number
}) {
  return (
    <Div
      className={` flex-row overflow-x-auto ${className}`}
      contentContainerStyle={{ gap, paddingLeft: padX, paddingRight: padX }}
    >
      {children}
    </Div>
  )
}


;(ScreenHeader as any).stickyHeader = true
