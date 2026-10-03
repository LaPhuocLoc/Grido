import { Check, ChevronDown, Heart, LayoutGrid, List, LoaderCircle, Monitor, Search, X } from 'lucide-react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { availableLangs, countByGroup, detectLang, sampleLine, searchFonts } from '../lib/fontSearch'
import { FONT_GROUPS, FONT_LANGS, FONTS, fontInfo, isSystemFont, systemFont, type FontGroup, type FontId, type FontInfo, type FontLang } from '../lib/text'
import { desktop } from '../lib/desktop'
import { useStore } from '../store'
import { cx } from './ui'

/** Bản web tải font qua mạng: font Nhật / Hàn nặng 0,5–2 MB mỗi file nên không tải sẵn khi con trỏ chỉ lướt qua (dừng hẳn trên font mới tải để xem thử). */
const heavy = (font: FontInfo) => desktop.platform === 'web' && !isSystemFont(font.id) && !font.langs.includes('vi')

// Tải sẵn file font khi rê chuột tới, để lúc bấm chọn chữ trên ảnh đổi ngay.
const warm = (font: FontInfo) => {
  if (!heavy(font)) void document.fonts.load(`500 16px ${font.family}`).catch(() => {})
}

declare global {
  interface Window {
    /** Local Font Access API của Chromium: liệt kê font đã cài trên hệ điều hành. */
    queryLocalFonts?: () => Promise<{ family: string }[]>
  }
}

// Danh sách font trên máy chỉ đọc một lần cho cả phiên; lỗi thì lần bấm sau thử lại.
let systemFonts: Promise<FontInfo[]> | null = null
function loadSystemFonts(): Promise<FontInfo[]> {
  systemFonts ??= (async () => {
    if (!window.queryLocalFonts) throw new Error('unsupported')
    const families = new Set((await window.queryLocalFonts()).map((f) => f.family))
    return [...families].sort((a, b) => a.localeCompare(b)).map(systemFont)
  })().catch((err) => {
    systemFonts = null
    throw err
  })
  return systemFonts
}

/** Kho font có sẵn / font đã thả tim / font cài trên máy. */
type Source = 'catalog' | 'fav' | 'system'

/** Các ngôn ngữ kho font đang có; chỉ một ngôn ngữ thì hàng lọc ngôn ngữ không hiện. */
const LANGS = availableLangs(FONTS)

/** Lưới font không thấp hơn mức này, kể cả khi bảng bên phải rất thấp (màn hình nhỏ). */
const MIN_LIST_HEIGHT = 280
/** Lề dưới của bảng công cụ (p-4), trừ đi phần đệm của chính lưới. */
const PANEL_PADDING = 4
/** Bảng ở bề rộng mặc định xếp 2 cột; kéo rộng dần thì lên 3, 4 rồi tối đa 5 cột. */
const GRID_COLUMNS = 'repeat(auto-fill, minmax(max(130px, calc((100% - 32px) / 5)), 1fr))'
/** Danh sách: 1 cột, bảng rộng thì thêm cột. */
const LIST_COLUMNS = 'repeat(auto-fill, minmax(250px, 1fr))'
/** Con trỏ phải dừng trên một font bấy lâu (ms) thì dòng chữ trên ảnh mới đổi tạm sang font đó. */
const CANVAS_PREVIEW_DELAY = 90
/** Font nặng (Nhật / Hàn ở bản web): dừng lâu hơn mới tải file về để xem thử, lướt ngang qua thì không tải gì. */
const HEAVY_PREVIEW_DELAY = 280

export const chip = (on: boolean) =>
  cx(
    'flex h-7 min-w-fit flex-1 items-center justify-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold transition-colors',
    on ? 'bg-ink text-paper' : 'bg-sand text-soft hover:text-ink',
  )

/** Ảnh minh hoạ của font; 4 font cơ bản không có ảnh nên hiện chữ mẫu bằng chính font đó. */
function Sample({ font }: { font: FontInfo }) {
  return font.thumb ? (
    <img
      src={font.thumb}
      alt=""
      width={320}
      height={180}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="block aspect-video w-full bg-sand object-cover"
    />
  ) : (
    <span
      className="grid aspect-video w-full place-items-center whitespace-nowrap bg-sand text-[22px] text-ink"
      style={{ fontFamily: font.family, fontWeight: 700 }}
    >
      Xin chào
    </span>
  )
}

function FavButton({ font, fav, onToggle, className }: { font: FontInfo; fav: boolean; onToggle: (id: FontId) => void; className: string }) {
  return (
    <button
      type="button"
      aria-pressed={fav}
      aria-label={fav ? `Bỏ thích phông ${font.label}` : `Thích phông ${font.label}`}
      data-tip={fav ? 'Bỏ khỏi Yêu thích' : 'Thêm vào Yêu thích'}
      onClick={() => onToggle(font.id)}
      className={cx(
        'absolute grid size-6 place-items-center rounded-full transition-all hover:scale-110 active:scale-90 focus-visible:opacity-100',
        fav ? 'text-coral' : 'text-soft opacity-0 hover:text-coral group-hover:opacity-100 [@media(hover:none)]:opacity-60',
        className,
      )}
    >
      <Heart key={String(fav)} className={cx('size-3.5', fav && 'animate-pop fill-current')} />
    </button>
  )
}

interface ItemProps {
  font: FontInfo
  selected: boolean
  fav: boolean
  onSelect: (id: FontId) => void
  onToggleFav: (id: FontId) => void
}

/** Ô font trong lưới: chỉ có ảnh mẫu. Rê chuột thì ô nhích to lên một chút, hiện tên font và nút Yêu thích. */
const FontCard = memo(function FontCard({ font, selected, fav, onSelect, onToggleFav }: ItemProps) {
  return (
    <div
      className="group relative transition-transform duration-100 ease-[ease] hover:z-10 hover:scale-110 focus-within:z-10"
      data-font={font.id}
      data-current={selected || undefined}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={font.label}
        onClick={() => onSelect(font.id)}
        onPointerEnter={() => warm(font)}
        onFocus={() => warm(font)}
        className={cx(
          'relative block w-full overflow-hidden rounded-xl border bg-card text-left transition-[border-color,box-shadow] duration-100',
          selected ? 'border-coral ring-2 ring-coral/30' : 'border-line group-hover:border-edge group-hover:shadow-soft',
        )}
      >
        <Sample font={font} />
        {selected && (
          <span className="absolute left-1.5 top-1.5 grid size-4 animate-pop place-items-center rounded-full bg-coral text-white shadow">
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 truncate bg-card/60 backdrop-blur-[2px] px-2 py-1 text-[11px] font-semibold leading-4 text-ink opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100">
          {font.label}
        </span>
      </button>
      <FavButton font={font} fav={fav} onToggle={onToggleFav} className="right-1.5 top-1.5 bg-card shadow-sm" />
    </div>
  )
})

/** Một dòng của danh sách phông chữ: câu chữ đang chọn viết bằng phông đó, tên phông ghi nhỏ bên dưới. */
const FontRow = memo(function FontRow({ font, selected, fav, onSelect, onToggleFav, sample }: ItemProps & { sample: string }) {
  return (
    // content-visibility: dòng ngoài vùng nhìn không được dàn chữ, nên file phông của nó cũng chưa bị tải về.
    <div className="group relative [contain-intrinsic-size:auto_58px] [content-visibility:auto]" data-font={font.id} data-current={selected || undefined}>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={font.label}
        onClick={() => onSelect(font.id)}
        className={cx(
          'flex h-[58px] w-full flex-col justify-center overflow-hidden rounded-xl pl-3 pr-9 text-left transition-colors',
          selected ? 'bg-blush text-coral-dark' : 'text-ink hover:bg-sand',
        )}
      >
        <span className="w-full truncate text-[20px] leading-[30px]" style={{ fontFamily: font.family }}>
          {sample}
        </span>
        <span className={cx('w-full truncate text-[11px] leading-4', selected ? 'opacity-70' : 'text-muted')}>{font.label}</span>
      </button>
      {selected && !fav && <Check className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-coral-dark group-hover:hidden" strokeWidth={3} />}
      <FavButton font={font} fav={fav} onToggle={onToggleFav} className="right-2 top-1/2 -translate-y-1/2" />
    </div>
  )
})

/**
 * Nút chọn ngôn ngữ gọn (một chữ + mũi tên) kèm bảng chọn tự vẽ, dùng chung cho bảng phông chữ và bảng mẫu chữ.
 * Không dùng <select> của trình duyệt: danh sách thả xuống của nó không theo giao diện sáng / tối của app.
 */
export function LangSelect({ value, langs, onChange, tip }: { value: FontLang; langs: FontLang[]; onChange: (lang: FontLang) => void; tip: string }) {
  const options = FONT_LANGS.filter((l) => langs.includes(l.id))
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', outside, true)
    return () => window.removeEventListener('pointerdown', outside, true)
  }, [open])
  // Mở bảng thì đưa focus vào mục đang chọn, để dùng được phím mũi tên ngay.
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
  }, [open])
  const step = (e: ReactKeyboardEvent, delta: number) => {
    e.preventDefault()
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
    items[(items.indexOf(document.activeElement as HTMLElement) + delta + items.length) % items.length]?.focus()
  }
  return (
    <div
      ref={root}
      className="relative shrink-0"
      onKeyDown={(e) => {
        if (!open) return
        if (e.key === 'Escape') {
          // Chỉ đóng bảng chọn, không để Esc lọt ra thành "bỏ chọn dòng chữ".
          e.stopPropagation()
          setOpen(false)
          root.current?.querySelector('button')?.focus()
        } else if (e.key === 'ArrowDown') step(e, 1)
        else if (e.key === 'ArrowUp') step(e, -1)
      }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Ngôn ngữ: ${options.find((l) => l.id === value)?.label ?? ''}`}
        data-tip={open ? undefined : tip}
        onClick={() => setOpen(!open)}
        className={cx('flex h-9 items-center gap-1 rounded-full pl-3 pr-2 text-xs font-semibold text-ink transition-colors', open ? 'bg-line' : 'bg-sand hover:bg-line')}
      >
        {(options.find((l) => l.id === value)?.label ?? '').replace('Tiếng ', '')}
        <ChevronDown className={cx('size-3.5 text-soft transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="listbox" aria-label="Ngôn ngữ" className="absolute right-0 top-full z-30 mt-1.5 min-w-36 origin-top-right animate-pop rounded-2xl bg-card p-1 shadow-lift ring-1 ring-black/5">
          {options.map((l) => (
            <button
              key={l.id}
              type="button"
              role="option"
              aria-selected={l.id === value}
              onClick={() => {
                onChange(l.id)
                setOpen(false)
              }}
              className={cx(
                'flex h-8 w-full items-center justify-between gap-3 whitespace-nowrap rounded-xl pl-3 pr-2 text-left text-[13px] font-semibold transition-colors focus-visible:outline-none',
                l.id === value ? 'bg-blush text-coral-dark' : 'text-ink hover:bg-sand focus-visible:bg-sand',
              )}
            >
              {l.label}
              {l.id === value && <Check className="size-3.5" strokeWidth={3} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function FontPicker({
  value,
  text,
  onChange,
  onPreview,
}: {
  value: FontId
  /** Nội dung dòng chữ đang chọn: dùng làm câu mẫu và để đoán ngôn ngữ. */
  text?: string
  onChange: (id: FontId) => void
  /** Font đang được rê chuột tới (null = thôi xem thử). */
  onPreview?: (id: FontId | null) => void
}) {
  const [query, setQuery] = useState('')
  // Đang dùng font của máy thì mở sẵn mục đó để thấy font đang chọn.
  const [source, setSource] = useState<Source>(() => (isSystemFont(value) ? 'system' : 'catalog'))
  const [style, setStyle] = useState<FontGroup | 'all'>('all')
  // Dòng chữ đổi sang thứ tiếng khác thì mở sẵn nhóm font của thứ tiếng đó; người dùng vẫn tự đổi lại được.
  const detected = detectLang(text ?? '')
  const [lang, setLang] = useState<FontLang>(detected)
  useEffect(() => setLang(detected), [detected])
  const byLang = LANGS.length > 1
  const sample = sampleLine(text)

  /** Font cài trên máy: null = chưa đọc / đang đọc, 'error' = không đọc được. */
  const [system, setSystem] = useState<FontInfo[] | 'error' | null>(null)
  useEffect(() => {
    if (source !== 'system' || system) return
    let alive = true
    loadSystemFonts().then(
      (list) => alive && setSystem(list),
      () => alive && setSystem('error'),
    )
    return () => {
      alive = false
    }
  }, [source, system])
  const favorites = useStore((s) => s.favoriteFonts)
  const { toggleFavoriteFont, noteRecentFont } = useStore.getState()
  const favSet = useMemo(() => new Set(favorites), [favorites])
  const recentIds = useStore((s) => s.recentFonts)
  const view = useStore((s) => s.fontView)
  // Phông của máy không có ảnh mẫu nên luôn xếp thành danh sách.
  const asList = source === 'system' || view === 'list'

  // Lướt chuột ngang qua cả lưới không được làm chữ trên ảnh nhấp nháy: xem thử trên ảnh có trễ một nhịp.
  const previewTimer = useRef<number | undefined>(undefined)
  const previewing = useRef<FontId | null>(null)
  const preview = (id: FontId | null) => {
    if (id === previewing.current) return
    previewing.current = id
    clearTimeout(previewTimer.current)
    if (id === null) return onPreview?.(null)
    const font = fontInfo(id)
    if (!heavy(font)) {
      previewTimer.current = window.setTimeout(() => onPreview?.(id), CANVAS_PREVIEW_DELAY)
      return
    }
    // Font nặng: tải xong file rồi mới đổi chữ trên ảnh (đổi trước thì chữ hiện bằng font dự phòng trong lúc chờ). Con
    // trỏ đã sang font khác trong lúc tải thì thôi. File tải rồi được giữ lại nên lần sau hiện ngay.
    previewTimer.current = window.setTimeout(
      () =>
        void document.fonts
          .load(`500 16px ${font.family}`)
          .then(() => previewing.current === id && onPreview?.(id))
          .catch(() => {}),
      HEAVY_PREVIEW_DELAY,
    )
  }
  useEffect(
    () => () => {
      clearTimeout(previewTimer.current)
      onPreview?.(null)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const hover = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return
    preview((e.target as HTMLElement).closest<HTMLElement>('[data-font]')?.dataset.font ?? null)
  }
  const select = (id: FontId) => {
    preview(null)
    // Con trỏ vẫn nằm trên ô vừa chọn: coi như đã xem xong font này.
    previewing.current = id
    noteRecentFont(id)
    onChange(id)
  }
  const search = (next: string) => {
    // Bắt đầu gõ thì tìm trên mọi kiểu chữ, không kẹt trong nhóm đang mở; muốn thu hẹp thì bấm lại nhóm.
    if (!query.trim() && next.trim()) setStyle('all')
    setQuery(next)
  }

  // Hàng kiểu chữ: phía nào còn mục bị khuất thì mép phía đó mờ dần.
  const styles = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState({ left: false, right: false })
  const measureStyles = () => {
    const el = styles.current
    if (!el) return
    const next = { left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 }
    setHidden((now) => (now.left === next.left && now.right === next.right ? now : next))
  }
  useLayoutEffect(() => {
    const el = styles.current
    if (!el) return
    measureStyles()
    const observer = new ResizeObserver(measureStyles)
    observer.observe(el)
    // Lăn chuột dọc trên hàng này thì cuộn ngang (phải chặn mặc định để bảng công cụ không cuộn theo).
    const wheel = (e: WheelEvent) => {
      if (e.deltaX || el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      observer.disconnect()
      el.removeEventListener('wheel', wheel)
    }
    // Hàng này ẩn khi xem font trên máy, nên gắn lại mỗi lần đổi nguồn.
  }, [source])
  const fade = `linear-gradient(to right, ${hidden.left ? 'transparent' : '#000'}, #000 24px, #000 calc(100% - 24px), ${hidden.right ? 'transparent' : '#000'})`

  const list = useRef<HTMLDivElement>(null)
  const [listHeight, setListHeight] = useState(MIN_LIST_HEIGHT)

  // Lưới font cao vừa đủ để lấp hết phần còn trống của bảng công cụ, không để dư khoảng trắng phía dưới.
  useLayoutEffect(() => {
    const el = list.current
    const panel = el?.parentElement?.closest<HTMLElement>('.overflow-y-auto')
    if (!el || !panel) return
    const measure = () => {
      const top = el.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop
      setListHeight(Math.max(MIN_LIST_HEIGHT, Math.floor(panel.clientHeight - top - PANEL_PADDING)))
    }
    measure()
    // Cửa sổ đổi cỡ, hoặc các hàng lọc phía trên hiện / ẩn, đều làm vị trí lưới thay đổi.
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    if (el.parentElement) observer.observe(el.parentElement)
    return () => observer.disconnect()
  }, [])

  /** Kho font của ngôn ngữ đang chọn. */
  const catalog = useMemo(() => (byLang ? FONTS.filter((f) => f.langs.includes(lang)) : FONTS), [byLang, lang])
  /** Font của nguồn đang mở, đã lọc theo từ khoá nhưng chưa lọc theo kiểu chữ (để đếm số font từng kiểu). */
  const matched = useMemo(() => {
    if (source === 'system') return searchFonts(Array.isArray(system) ? system : [], query)
    // Yêu thích gồm cả font của máy đã thả tim (dựng lại từ id, không cần đọc lại danh sách font trên máy).
    if (source === 'fav') return searchFonts([...catalog.filter((f) => favSet.has(f.id)), ...favorites.filter(isSystemFont).map(fontInfo)], query)
    return searchFonts(catalog, query)
  }, [source, system, catalog, favSet, favorites, query])
  const counts = useMemo(() => countByGroup(matched), [matched])
  const fonts = useMemo(() => (style === 'all' || source === 'system' ? matched : matched.filter((f) => f.group === style)), [matched, style, source])

  // Font dùng gần đây chỉ hiện ở kho font khi không lọc / tìm kiếm, để kết quả không bị lẫn.
  const recent = useMemo(
    () => (source === 'catalog' && style === 'all' && !query.trim() ? recentIds.map(fontInfo).filter((f) => !byLang || isSystemFont(f.id) || f.langs.includes(lang)) : []),
    [source, style, query, recentIds, byLang, lang],
  )

  // Mở bảng chọn (hoặc danh sách font trên máy vừa đọc xong) thì cuộn tới font đang dùng.
  useEffect(() => {
    list.current?.querySelector('[data-current]')?.scrollIntoView({ block: 'nearest' })
  }, [system, asList])

  const item = (f: FontInfo, key: string) => {
    const props = { font: f, selected: f.id === value, fav: favSet.has(f.id), onSelect: select, onToggleFav: toggleFavoriteFont }
    return asList ? <FontRow key={key} {...props} sample={sample} /> : <FontCard key={key} {...props} />
  }

  const sources: { id: Source; label: string; count?: number; tip?: string }[] = [
    { id: 'catalog', label: 'Kho phông', count: catalog.length },
    { id: 'fav', label: 'Yêu thích', count: favorites.length },
    { id: 'system', label: 'Trên máy', tip: 'Phông chữ bạn đã cài trên máy tính này' },
  ]

  const total = source === 'system' && !Array.isArray(system) ? null : fonts.length

  return (
    <div className="space-y-2">
      {/* Hàng 1: ô tìm chiếm hết chỗ; ngôn ngữ và cách xem là hai nút gọn ở bên phải. */}
      <div className="flex items-center gap-1.5">
        <label className="relative block min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => search(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape' || !query) return
              e.stopPropagation()
              setQuery('')
            }}
            placeholder={total === null ? 'Tìm phông chữ' : `Tìm trong ${total} phông chữ`}
            aria-label="Tìm phông chữ"
            className="h-9 w-full rounded-full border border-line bg-surface pl-9 pr-8 text-[13px] focus:border-coral focus:outline-none focus:ring-4 focus:ring-coral/15"
          />
          {query && (
            <button
              type="button"
              aria-label="Xoá từ khoá"
              data-tip="Xoá từ khoá (Esc)"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:bg-sand hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
        {source !== 'system' && byLang && <LangSelect value={lang} langs={LANGS} onChange={setLang} tip="Phông chữ cho thứ tiếng nào" />}
        {source !== 'system' && (
          <button
            type="button"
            aria-label={view === 'list' ? 'Đang xem dạng danh sách · bấm để xem ảnh mẫu' : 'Đang xem ảnh mẫu · bấm để xem dạng danh sách'}
            data-tip={view === 'list' ? 'Xem ảnh mẫu' : 'Xem dạng danh sách'}
            data-view={view}
            onClick={() => useStore.getState().set({ fontView: view === 'list' ? 'grid' : 'list' })}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-sand text-ink transition-colors hover:bg-line"
          >
            {view === 'list' ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
          </button>
        )}
      </div>

      {/* Hàng 2: nguồn phông, ba lựa chọn loại trừ nhau. */}
      <div className="flex gap-1 rounded-full bg-sand p-1" role="group" aria-label="Nguồn phông chữ">
        {sources.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={source === s.id}
            data-tip={s.tip}
            onClick={() => setSource(s.id)}
            className={cx(
              'flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
              source === s.id ? 'bg-surface text-ink shadow-sm' : 'text-soft hover:text-ink',
            )}
          >
            {s.id === 'fav' && <Heart className="size-3 shrink-0" />}
            {s.id === 'system' && <Monitor className="size-3 shrink-0" />}
            <span className="truncate">{s.label}</span>
            {s.count !== undefined && <span className="font-normal opacity-60">{s.count}</span>}
          </button>
        ))}
      </div>

      {source !== 'system' && (
        // Hàng 3: kiểu chữ. Bốn nút chia đều bề rộng nên luôn thấy đủ; bấm lại nút đang bật để về "mọi kiểu".
        // Bảng hẹp quá mới phải cuộn ngang: thanh cuộn ẩn, lăn chuột là cuộn, mép mờ dần báo còn mục ở phía đó.
        <div
          ref={styles}
          className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]"
          style={{ maskImage: fade, WebkitMaskImage: fade }}
          onScroll={measureStyles}
          role="group"
          aria-label="Kiểu chữ"
        >
          {FONT_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={style === g.id}
              data-tip={style === g.id ? 'Bấm lần nữa để xem mọi kiểu chữ' : `${counts[g.id]} phông chữ`}
              onClick={(e) => {
                setStyle(style === g.id ? 'all' : g.id)
                e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
              }}
              className={cx(chip(style === g.id), !counts[g.id] && style !== g.id && 'opacity-50')}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      <div
        ref={list}
        // Lề 12px quanh lưới để ô font ở mép nhích to lên khi rê chuột mà không bị cắt.
        className={cx('scroll-soft -mx-3 grid content-start overflow-y-auto overscroll-contain px-3 pb-3 pt-1', asList ? 'gap-x-2 gap-y-px' : 'gap-2')}
        style={{ maxHeight: listHeight, gridTemplateColumns: asList ? LIST_COLUMNS : GRID_COLUMNS }}
        // Dừng chuột trên một font: dòng chữ đang chọn trên ảnh đổi tạm sang font đó (chưa ghi vào thiết kế).
        onPointerOver={hover}
        onPointerLeave={() => preview(null)}
        onScroll={() => preview(null)}
      >
        {query.trim() && fonts.length > 0 && (
          <p className="col-span-full px-0.5 text-xs text-muted" aria-live="polite">
            {fonts.length} phông chữ khớp “{query.trim()}”
          </p>
        )}
        {recent.length > 0 && (
          <>
            <p className="col-span-full px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Dùng gần đây</p>
            {recent.map((f) => item(f, `recent-${f.id}`))}
            <p className="col-span-full px-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Tất cả phông chữ</p>
          </>
        )}
        {fonts.map((f) => item(f, f.id))}
        {!fonts.length && (
          <p className="col-span-full px-3 py-6 text-center text-[13px] leading-relaxed text-muted">
            {source === 'system' && system === null ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="size-4 animate-spin" />
                Đang đọc phông chữ trên máy…
              </span>
            ) : source === 'system' && system === 'error' ? (
              <>
                Không đọc được danh sách phông chữ trên máy.{' '}
                <button type="button" className="font-semibold text-coral-dark hover:underline" onClick={() => setSystem(null)}>
                  Thử lại
                </button>
              </>
            ) : source === 'fav' && !favorites.length ? (
              <>
                Chưa có phông chữ yêu thích nào. Bấm biểu tượng <Heart className="inline size-3.5 align-[-2px]" /> ở góc một phông chữ để thêm vào đây.
              </>
            ) : query.trim() ? (
              <>
                Không có phông chữ nào khớp.{' '}
                <button type="button" className="font-semibold text-coral-dark hover:underline" onClick={() => setQuery('')}>
                  Xoá từ khoá
                </button>
              </>
            ) : (
              'Chưa có phông chữ nào trong nhóm này.'
            )}
          </p>
        )}
      </div>
    </div>
  )
}
