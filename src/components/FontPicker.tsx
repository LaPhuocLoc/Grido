import { Check, ChevronDown, Search } from 'lucide-react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FONT_GROUPS, FONTS, fontInfo, type FontGroup, type FontId, type FontInfo } from '../lib/text'
import { cx } from './ui'

/** Bỏ dấu để gõ "viet tay" vẫn ra "Viết tay". */
const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()

// Tải sẵn file font khi rê chuột tới, để lúc bấm chọn chữ trên ảnh đổi ngay.
const warm = (font: FontInfo) => void document.fonts.load(`500 16px ${font.family}`).catch(() => {})

/** Lưới font không thấp hơn mức này, kể cả khi bảng bên phải rất thấp (màn hình nhỏ). */
const MIN_LIST_HEIGHT = 280
/** Lề dưới của bảng bên phải (p-4), trừ đi phần đệm của chính lưới. */
const PANEL_PADDING = 12

/** Ảnh minh hoạ của font; 4 font cơ bản không có ảnh nên hiện chữ mẫu bằng chính font đó. */
function Sample({ font, size = 'md' }: { font: FontInfo; size?: 'sm' | 'md' }) {
  return font.thumb ? (
    <img
      src={font.thumb}
      alt=""
      width={320}
      height={180}
      loading={size === 'md' ? 'lazy' : undefined}
      decoding="async"
      draggable={false}
      className="block aspect-video w-full bg-sand object-cover"
    />
  ) : (
    <span
      className={cx(
        'grid aspect-video w-full place-items-center whitespace-nowrap bg-sand text-ink',
        size === 'sm' ? 'text-base' : 'text-2xl',
      )}
      style={{ fontFamily: font.family, fontWeight: 700 }}
    >
      Xin chào
    </span>
  )
}

const FontCard = memo(function FontCard({
  font,
  selected,
  onSelect,
}: {
  font: FontInfo
  selected: boolean
  onSelect: (id: FontId) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={font.label}
      onClick={() => onSelect(font.id)}
      onPointerEnter={() => warm(font)}
      onFocus={() => warm(font)}
      className={cx(
        'group relative overflow-hidden rounded-xl border bg-card text-left transition-[border-color,box-shadow] duration-150',
        selected ? 'border-coral ring-2 ring-coral/30' : 'border-line hover:border-edge hover:shadow-soft',
      )}
    >
      <Sample font={font} />
      {selected && (
        <span className="absolute right-1.5 top-1.5 grid size-5 animate-pop place-items-center rounded-full bg-coral text-white shadow">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      )}
      <span className={cx('block truncate px-2 py-1.5 text-xs font-semibold', selected ? 'text-coral-dark' : 'text-soft group-hover:text-ink')}>
        {font.label}
      </span>
    </button>
  )
})

export function FontPicker({ value, onChange }: { value: FontId; onChange: (id: FontId) => void }) {
  const [open, setOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<FontGroup | 'all'>('all')
  const list = useRef<HTMLDivElement>(null)
  const [listHeight, setListHeight] = useState(MIN_LIST_HEIGHT)
  const current = fontInfo(value)

  // Lưới font cao vừa đủ để lấp hết phần còn trống của bảng bên phải, không để dư khoảng trắng phía dưới.
  useLayoutEffect(() => {
    const el = list.current
    const panel = el?.parentElement?.closest<HTMLElement>('.overflow-y-auto')
    if (!el || !panel) return
    const measure = () => {
      const top = el.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop
      setListHeight(Math.max(MIN_LIST_HEIGHT, Math.floor(panel.clientHeight - top - PANEL_PADDING)))
    }
    measure()
    // Cửa sổ đổi cỡ, hoặc hàng nút lọc phía trên xuống dòng, đều làm vị trí lưới thay đổi.
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    if (el.parentElement) observer.observe(el.parentElement)
    return () => observer.disconnect()
  }, [open])

  const fonts = useMemo(() => {
    const q = plain(query.trim())
    return FONTS.filter((f) => (group === 'all' || f.group === group) && (!q || plain(f.label).includes(q)))
  }, [query, group])

  // Mở bảng chọn (hoặc chuyển sang dòng chữ khác) thì cuộn tới font đang dùng.
  useEffect(() => {
    if (open) list.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-1.5 pr-3 text-left transition-colors hover:border-edge hover:bg-surface"
      >
        <span className="w-24 shrink-0 overflow-hidden rounded-xl">
          <Sample font={current} size="sm" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{current.label}</span>
          <span className="block text-xs text-muted">{FONT_GROUPS.find((g) => g.id === current.group)?.label}</span>
        </span>
        <ChevronDown className={cx('size-4 shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="animate-fade space-y-2.5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Tìm trong ${FONTS.length} font`}
              aria-label="Tìm font"
              className="h-9 w-full rounded-full border border-line bg-surface pl-9 pr-3 text-[13px] focus:border-coral focus:outline-none focus:ring-4 focus:ring-coral/15"
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
            {[{ id: 'all' as const, label: 'Tất cả' }, ...FONT_GROUPS].map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={group === g.id}
                onClick={() => setGroup(g.id)}
                className={cx(
                  'h-7 rounded-full px-2.5 text-xs font-semibold transition-colors',
                  group === g.id ? 'bg-ink text-paper' : 'bg-sand text-soft hover:text-ink',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div
            ref={list}
            className="scroll-soft -mx-1 grid grid-cols-2 content-start gap-2 overflow-y-auto overscroll-contain p-1"
            style={{ maxHeight: listHeight }}
          >
            {fonts.map((f) => (
              <FontCard key={f.id} font={f} selected={f.id === value} onSelect={onChange} />
            ))}
            {!fonts.length && <p className="col-span-2 py-6 text-center text-[13px] text-muted">Không có font nào khớp.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
