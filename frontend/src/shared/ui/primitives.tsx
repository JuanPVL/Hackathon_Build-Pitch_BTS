import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import s from './primitives.module.css'

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ')

/* ---------- Button ---------- */
export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'onDark' | 'ghost'
interface ButtonBase { variant?: ButtonVariant; icon?: LucideIcon; iconRight?: LucideIcon; block?: boolean; children: ReactNode }
export function Button({ variant = 'secondary', icon: Icon, iconRight: IconRight, block, children, className, ...rest }: ButtonBase & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cx(s.button, s[variant], block && s.block, className)} {...rest}>
      {Icon && <Icon size={16} aria-hidden />}{children}{IconRight && <IconRight size={16} aria-hidden />}
    </button>
  )
}
export function ButtonLink({ variant = 'secondary', icon: Icon, iconRight: IconRight, block, children, to }: ButtonBase & { to: string }) {
  return (
    <Link to={to} className={cx(s.button, s[variant], block && s.block)}>
      {Icon && <Icon size={16} aria-hidden />}{children}{IconRight && <IconRight size={16} aria-hidden />}
    </Link>
  )
}

/* ---------- Card ---------- */
export type CardTone = 'light' | 'navy' | 'cream'
export function Card({ tone = 'light', outlined, compact, className, children, as: Tag = 'section', ...aria }: { tone?: CardTone; outlined?: boolean; compact?: boolean; className?: string; children: ReactNode; as?: 'section' | 'div' | 'article'; 'aria-label'?: string }) {
  return <Tag className={cx(s.card, tone !== 'light' && s[tone], outlined && s.outlined, compact && s.compact, className)} {...aria}>{children}</Tag>
}
export function CardHeader({ title, aside, level = 2 }: { title: ReactNode; aside?: ReactNode; level?: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3'
  return <header className={s.cardHeader}><H className={s.cardTitle}>{title}</H>{aside && <div className={s.cardAside}>{aside}</div>}</header>
}

/* ---------- Eyebrow ---------- */
export function Eyebrow({ children, onDark }: { children: ReactNode; onDark?: boolean }) {
  return <p className={cx(s.eyebrow, onDark && s.onDark)}>{children}</p>
}

/* ---------- Chip ---------- */
export type ChipTone = 'ok' | 'err' | 'warn' | 'info' | 'neutral' | 'brand' | 'key'
export function Chip({ tone = 'neutral', icon: Icon, square, children }: { tone?: ChipTone; icon?: LucideIcon; square?: boolean; children: ReactNode }) {
  return <span className={cx(s.chip, s[tone], square && s.square)}>{Icon && <Icon size={12} aria-hidden />}{children}</span>
}

/* ---------- PageHeader ---------- */
export function PageHeader({ eyebrow, title, subtitle, actions, meta }: { eyebrow: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <header className={s.pageHeader}>
      <div className={s.pageHeaderText}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className={s.pageTitle}>{title}</h1>
        {subtitle && <p className={s.pageSubtitle}>{subtitle}</p>}
        {meta}
      </div>
      {actions && <div className={s.pageActions}>{actions}</div>}
    </header>
  )
}

/* ---------- StatCard ---------- */
export type ValueTone = 'blue' | 'orange' | 'green' | 'ink' | 'red' | 'muted'
export function StatCard({ label, value, caption, tone = 'light', valueTone = 'blue', footer }: { label: string; value: ReactNode; caption?: ReactNode; tone?: 'light' | 'navy'; valueTone?: ValueTone; footer?: ReactNode }) {
  return (
    <div className={cx(s.stat, tone === 'navy' && s.navy)}>
      <Eyebrow onDark={tone === 'navy'}>{label}</Eyebrow>
      <span className={cx(s.statValue, s[valueTone])}>{value}</span>
      {caption && <span className={s.statCaption}>{caption}</span>}
      {footer}
    </div>
  )
}

/* ---------- Layout helpers ---------- */
export function Grid({ cols, children, className }: { cols: 2 | 3 | 4; children: ReactNode; className?: string }) {
  return <div className={cx(s.grid, s[`cols${cols}`], className)}>{children}</div>
}
/** Contenido principal + panel lateral; se apila por debajo de 1280 px. */
export function Split({ aside = 380, children }: { aside?: number; children: ReactNode }) {
  return <div className={s.split} style={{ '--aside': `${aside}px` } as CSSProperties}>{children}</div>
}
export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(s.stack, className)}>{children}</div>
}

/* ---------- SegmentedControl ---------- */
export interface SegmentOption<T extends string> { value: T; label: string }
export function SegmentedControl<T extends string>({ options, value, onChange, label }: { options: SegmentOption<T>[]; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div className={s.segmented} role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" className={s.segment} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

/* ---------- BarMeter ---------- */
export function BarMeter({ value, max, tone = 'blue', label }: { value: number; max: number; tone?: 'blue' | 'orange' | 'red'; label?: string }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (Math.abs(value) / max) * 100)) : 0
  return (
    <div className={s.meter} role="img" aria-label={label}>
      <div className={cx(s.meterFill, tone !== 'blue' && s[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

/* ---------- Callout ---------- */
export function Callout({ tone = 'info', icon: Icon, title, children }: { tone?: 'info' | 'err' | 'neutral' | 'ok'; icon?: LucideIcon; title?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx(s.callout, s[tone])} role={tone === 'err' ? 'alert' : undefined}>
      {Icon && <Icon size={16} aria-hidden />}
      <div>{title && <strong>{title} </strong>}{children}</div>
    </div>
  )
}

/** Clase de color para montos según signo (cifras sobre fondo claro). */
export function toneForSign(value: number): ValueTone {
  return value < 0 ? 'orange' : value > 0 ? 'blue' : 'muted'
}
export const textTone = { blue: s.blue, orange: s.orange, green: s.green, ink: s.ink, red: s.red, muted: s.muted } as const
