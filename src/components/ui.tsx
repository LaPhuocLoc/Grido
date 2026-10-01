import { CircleAlert, CircleCheck, Info, Moon, Sun } from 'lucide-react'
import type { ButtonHTMLAttributes, CSSProperties, MouseEvent, ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { isDark } from '../lib/theme'
import { useStore } from '../store'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
        <defs>
          <linearGradient id="logo-g" gradientUnits="userSpaceOnUse" x1="48" y1="48" x2="464" y2="464">
            <stop offset="0" stopColor="#e5306c" />
            <stop offset="0.52" stopColor="#9a4cf2" />
            <stop offset="1" stopColor="#3f6bff" />
          </linearGradient>
        </defs>
        <rect x="48" y="48" width="244" height="244" rx="56" fill="url(#logo-g)" />
        <rect x="324" y="48" width="140" height="416" rx="56" fill="url(#logo-g)" />
        <rect x="48" y="324" width="244" height="140" rx="56" fill="url(#logo-g)" />
      </svg>
      <span className="font-display text-[1.35em] font-bold tracking-tight text-ink">Grido</span>
    </span>
  )
}

type ButtonVariant = 'primary' | 'soft' | 'ghost'

export function Button({
  variant = 'soft',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full px-4 h-10 text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 whitespace-nowrap',
        variant === 'primary' && 'gradient-brand glow-brand hover:brightness-105',
        variant === 'soft' && 'bg-card text-ink border border-line hover:border-edge hover:bg-surface shadow-sm',
        variant === 'ghost' && 'text-soft hover:bg-sand hover:text-ink',
        className,
      )}
    />
  )
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cx(
        'inline-grid place-items-center size-9 rounded-full text-soft hover:bg-sand hover:text-ink transition-colors disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useStore((s) => s.theme)
  const dark = isDark(theme)
  const toggle = (e: MouseEvent) => {
    const apply = () => flushSync(() => useStore.getState().set({ theme: dark ? 'light' : 'dark' }))
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply()
    // Giao diện mới loang ra thành hình tròn từ chính nút vừa bấm.
    const { clientX: x, clientY: y } = e
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    void document.startViewTransition(apply).ready.then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 480, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      ),
    )
  }
  return (
    <IconButton label={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} className={className} onClick={toggle}>
      <span key={String(dark)} className="animate-spin-in">
        {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
      </span>
    </IconButton>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="tabular-nums text-muted text-xs">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; disabled?: boolean }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex rounded-full bg-sand p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 h-8 rounded-full text-sm font-semibold transition-all duration-200 active:scale-95 disabled:opacity-35',
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-soft hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[15px] font-bold text-ink">{title}</h3>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="fixed z-50 bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none w-[min(92vw,420px)]">
      {toasts.map((t) => (
        <div
          key={t.key}
          role="status"
          className={cx(
            'flex items-start gap-2.5 rounded-2xl bg-[#1b1b2b] px-4 py-3 text-sm text-white shadow-lift dark:bg-[#2b2e40] dark:ring-1 dark:ring-white/10',
            t.leaving ? 'animate-toast-out' : 'animate-toast-in',
          )}
        >
          {t.kind === 'error' ? (
            <CircleAlert className="size-4.5 mt-0.5 shrink-0 text-[#ff9b82]" />
          ) : t.kind === 'success' ? (
            <CircleCheck className="size-4.5 mt-0.5 shrink-0 text-[#8fe0a8]" />
          ) : (
            <Info className="size-4.5 mt-0.5 shrink-0 text-amber" />
          )}
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={t.action.run}
              className="pointer-events-auto -my-1 -mr-1.5 shrink-0 rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold hover:bg-white/25"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
