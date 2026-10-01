import { Check, Heart, LoaderCircle, Monitor, Search } from 'lucide-react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { FONT_GROUPS, FONTS, fontInfo, isSystemFont, systemFont, type FontGroup, type FontId, type FontInfo } from '../lib/text'
import { useStore } from '../store'
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

/** Lưới font không thấp hơn mức này, kể cả khi bảng bên phải rất thấp (màn hình nhỏ). */
const MIN_LIST_HEIGHT = 280
/** Lề dưới của bảng công cụ (p-4), trừ đi phần đệm của chính lưới. */
const PANEL_PADDING = 12

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
      className="grid aspect-video w-full place-items-center whitespace-nowrap bg-sand text-[17px] text-ink"
      style={{ fontFamily: font.family, fontWeight: 700 }}
    >
      Xin chào
    </span>
  )
}

const FontCard = memo(function FontCard({
  font,
  selected,
  fav,
  onSelect,
  onToggleFav,
}: {
  font: FontInfo
  selected: boolean
  fav: boolean
  onSelect: (id: FontId) => void
  onToggleFav: (id: FontId) => void
}) {
  return (
    <div className="group relative" data-font={font.id} data-current={selected || undefined}>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={font.label}
        onClick={() => onSelect(font.id)}
        onPointerEnter={() => warm(font)}
        onFocus={() => warm(font)}
        className={cx(
          'relative block w-full overflow-hidden rounded-xl border bg-card text-left transition-[border-color,box-shadow] duration-150',
          selected ? 'border-coral ring-2 ring-coral/30' : 'border-line hover:border-edge hover:shadow-soft',
        )}
      >
        <Sample font={font} />
        {selected && (
          <span className="absolute left-1 top-1 grid size-4 animate-pop place-items-center rounded-full bg-coral text-white shadow">
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
      </button>
      <button
        type="button"
        aria-pressed={fav}
        aria-label={fav ? `Bỏ thích font ${font.label}` : `Thích font ${font.label}`}
        data-tip={fav ? 'Bỏ khỏi Yêu thích' : 'Thêm vào Yêu thích'}
        onClick={() => onToggleFav(font.id)}
        className={cx(
          'absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-card shadow-sm transition-all hover:scale-110 active:scale-90 focus-visible:opacity-100',
          fav ? 'text-coral' : 'text-soft opacity-0 hover:text-coral group-hover:opacity-100 [@media(hover:none)]:opacity-60',
        )}
      >
        <Heart key={String(fav)} className={cx('size-3.5', fav && 'animate-pop fill-current')} />
      </button>
    </div>
  )
})

/** Kích thước thẻ xem lớn hiện ra khi rê chuột vào một ô font (ảnh minh hoạ ở đúng cỡ gốc 320×180 + dòng tên). */
/** Ô phóng to rộng gấp chừng này lần ô font (trong khoảng dưới đây): đủ để đọc kiểu chữ mà chỉ lấn sang các ô sát bên. */
const ZOOM_SCALE = 2.1
const ZOOM_MIN_W = 184
const ZOOM_MAX_W = 280
/** Dòng tên font dưới ảnh trong ô phóng to. */
const ZOOM_INFO_H = 34
// Ô phóng to khi rê chuột tương đương `transition: all .2s ease .2s`: dừng chuột 0,2 giây rồi nở ra trong 0,2 giây.
// Lướt ngang qua (dưới 0,2 giây mỗi ô) thì không có gì bật lên.
const ZOOM_DELAY = 200
const ZOOM_IN_MS = 200
const ZOOM_EASE = 'ease'
/** Rời chuột thì thu về nhanh, để không cản ô kế tiếp. */
const ZOOM_OUT_MS = 170
const ZOOM_OUT_EASE = 'cubic-bezier(0.5, 0, 0.1, 1)'
/** Con trỏ phải dừng trên một font bấy lâu (ms) thì dòng chữ trên ảnh mới đổi tạm sang font đó. */
const CANVAS_PREVIEW_DELAY = 90

interface Zoom {
  /** Mỗi lần phóng to là một thẻ mới, để hiệu ứng nở ra chạy lại từ đầu. */
  key: number
  font: FontInfo
  left: number
  top: number
  width: number
  /** Tâm của ô font gốc tính theo thẻ, và tỉ lệ ô / thẻ: thẻ nở ra từ đúng chỗ ô đó và thu về đúng chỗ đó. */
  originX: number
  originY: number
  from: number
  /** Đang thu lại về ô gốc; xong thì gỡ khỏi màn hình. */
  closing?: boolean
}

/**
 * Ô font phóng to tại chỗ khi dừng chuột. Cả lưới chỉ có một thẻ, chỉ đổi transform + opacity (chạy ở tầng compositor)
 * và không bắt sự kiện chuột: con trỏ vẫn "nhìn xuyên" xuống lưới, nên nhích sang ô bên cạnh là chuyển font ngay,
 * không phải đưa chuột ra khỏi vùng thẻ che.
 */
function FontZoom({ zoom, selected, fav, onClosed }: { zoom: Zoom; selected: boolean; fav: boolean; onClosed: (key: number) => void }) {
  const { font } = zoom
  const box = useRef<HTMLDivElement>(null)
  const info = useRef<HTMLDivElement>(null)

  // Nở ra từ đúng kích thước và vị trí của ô gốc; dòng tên hiện dần sau khi ảnh đã gần tới cỡ.
  useLayoutEffect(() => {
    box.current?.animate(
      [
        { transform: `scale(${zoom.from})`, opacity: 0.6 },
        { opacity: 1, offset: 0.35 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: ZOOM_IN_MS, easing: ZOOM_EASE },
    )
    info.current?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }], { duration: ZOOM_IN_MS, easing: 'ease-out' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Thu về ô gốc rồi mới gỡ, thay vì biến mất đột ngột.
  const { closing, key } = zoom
  useEffect(() => {
    if (!closing) return
    const el = box.current
    if (!el) return onClosed(key)
    // Bắt đầu từ đúng trạng thái đang hiển thị (kể cả khi đang nở dở).
    const now = getComputedStyle(el)
    const out = el.animate(
      [
        { transform: now.transform, opacity: now.opacity },
        { transform: `scale(${zoom.from})`, opacity: 0 },
      ],
      { duration: ZOOM_OUT_MS, easing: ZOOM_OUT_EASE, fill: 'forwards' },
    )
    out.onfinish = () => onClosed(key)
    return () => out.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing])

  return createPortal(
    <div
      ref={box}
      role="tooltip"
      className={cx(
        'pointer-events-none fixed z-[75] overflow-hidden rounded-xl border bg-card shadow-lift will-change-transform',
        selected ? 'border-coral' : 'border-line',
      )}
      style={{ left: zoom.left, top: zoom.top, width: zoom.width, transformOrigin: `${zoom.originX}px ${zoom.originY}px` }}
    >
      {font.thumb ? (
        <img src={font.thumb} alt="" decoding="async" draggable={false} className="block aspect-video w-full bg-sand object-cover" />
      ) : (
        <div className="grid aspect-video w-full place-items-center bg-sand px-3 text-center text-ink" style={{ fontFamily: font.family }}>
          <span>
            <span className="block text-[22px] font-bold leading-tight">Xin chào Việt Nam</span>
            <span className="mt-0.5 block text-sm opacity-70">AaBbCc 0123456789</span>
          </span>
        </div>
      )}
      <div ref={info} className="flex items-center gap-1.5 px-2.5" style={{ height: ZOOM_INFO_H }}>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{font.label}</span>
        {fav && <Heart className="size-3.5 shrink-0 fill-current text-coral" />}
        {selected && <Check className="size-3.5 shrink-0 text-coral-dark" strokeWidth={3} />}
      </div>
    </div>,
    document.body,
  )
}

/** Một dòng trong danh sách font của máy: tên font và mẫu chữ đều viết bằng chính font đó. */
const FontRow = memo(function FontRow({
  font,
  selected,
  fav,
  onSelect,
  onToggleFav,
}: {
  font: FontInfo
  selected: boolean
  fav: boolean
  onSelect: (id: FontId) => void
  onToggleFav: (id: FontId) => void
}) {
  return (
    // content-visibility: vài trăm dòng, mỗi dòng một font khác nhau; dòng ngoài vùng nhìn thì trình duyệt khỏi dàn chữ.
    <div className="group relative [contain-intrinsic-size:auto_36px] [content-visibility:auto]" data-font={font.id} data-current={selected || undefined}>
      <button
        type="button"
        aria-pressed={selected}
        // Font ký hiệu viết tên mình bằng ký hiệu nên không đọc được; rê chuột để xem tên thật.
        data-tip={font.label}
        onClick={() => onSelect(font.id)}
        className={cx(
          'flex h-9 w-full items-baseline gap-2 overflow-hidden whitespace-nowrap rounded-lg pl-2.5 pr-9 text-left leading-9 transition-colors',
          selected ? 'bg-blush text-coral-dark' : 'text-ink hover:bg-sand',
        )}
        style={{ fontFamily: font.family }}
      >
        <span className="min-w-0 shrink truncate text-[15px]">{font.label}</span>
        <span className={cx('shrink-0 text-[13px]', selected ? 'opacity-70' : 'text-muted')}>AaBbCc</span>
      </button>
      {selected && !fav && <Check className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-coral-dark group-hover:hidden" strokeWidth={3} />}
      <button
        type="button"
        aria-pressed={fav}
        aria-label={fav ? `Bỏ thích font ${font.label}` : `Thích font ${font.label}`}
        data-tip={fav ? 'Bỏ khỏi Yêu thích' : 'Thêm vào Yêu thích'}
        onClick={() => onToggleFav(font.id)}
        className={cx(
          'absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full transition-all hover:scale-110 active:scale-90 focus-visible:opacity-100',
          fav ? 'text-coral' : 'text-soft opacity-0 hover:text-coral group-hover:opacity-100 [@media(hover:none)]:opacity-60',
        )}
      >
        <Heart key={String(fav)} className={cx('size-3.5', fav && 'animate-pop fill-current')} />
      </button>
    </div>
  )
})

export function FontPicker({
  value,
  onChange,
  onPreview,
}: {
  value: FontId
  onChange: (id: FontId) => void
  /** Font đang được rê chuột tới (null = thôi xem thử). */
  onPreview?: (id: FontId | null) => void
}) {
  const [query, setQuery] = useState('')
  // Đang dùng font của máy thì mở sẵn mục đó để thấy font đang chọn.
  const [group, setGroup] = useState<FontGroup | 'all' | 'fav' | 'system'>(() => (isSystemFont(value) ? 'system' : 'all'))
  /** Font cài trên máy: null = chưa đọc / đang đọc, 'error' = không đọc được. */
  const [system, setSystem] = useState<FontInfo[] | 'error' | null>(null)
  useEffect(() => {
    if (group !== 'system' || system) return
    let alive = true
    loadSystemFonts().then(
      (list) => alive && setSystem(list),
      () => alive && setSystem('error'),
    )
    return () => {
      alive = false
    }
  }, [group, system])
  const favorites = useStore((s) => s.favoriteFonts)
  const { toggleFavoriteFont } = useStore.getState()
  const favSet = useMemo(() => new Set(favorites), [favorites])
  const recentIds = useStore((s) => s.recentFonts)
  const { noteRecentFont } = useStore.getState()

  // Lướt chuột ngang qua cả lưới không được làm chữ trên ảnh nhấp nháy: xem thử trên ảnh có trễ một nhịp.
  const previewTimer = useRef<number | undefined>(undefined)
  const previewing = useRef<FontId | null>(null)
  const [zoom, setZoom] = useState<Zoom | null>(null)
  const zoomTimer = useRef<number | undefined>(undefined)
  const zoomSeq = useRef(0)
  const preview = (id: FontId | null, el?: HTMLElement) => {
    if (id === previewing.current) return
    previewing.current = id
    clearTimeout(previewTimer.current)
    clearTimeout(zoomTimer.current)
    // Ô đang mở thu về chỗ cũ (có hiệu ứng) ngay khi con trỏ rời font đó.
    setZoom((z) => (z && !z.closing ? { ...z, closing: true } : z))
    if (id === null) return onPreview?.(null)
    // Đổi font của dòng chữ trên ảnh: chờ con trỏ dừng lại một nhịp để lướt qua lưới không làm chữ nhấp nháy.
    previewTimer.current = window.setTimeout(() => onPreview?.(id), CANVAS_PREVIEW_DELAY)
    // Danh sách font trên máy đã viết sẵn tên bằng chính font đó nên không cần phóng to.
    if (!el || group === 'system') return
    zoomTimer.current = window.setTimeout(
      () => {
        const grid = list.current?.getBoundingClientRect()
        if (!grid || !el.isConnected) return
        const r = el.getBoundingClientRect()
        const width = Math.round(Math.min(Math.max(r.width * ZOOM_SCALE, ZOOM_MIN_W), ZOOM_MAX_W))
        const imageH = (width * 9) / 16
        // Cột ngoài cùng nở vào phía trong lưới (mép ngoài đứng yên), các cột giữa nở đều hai bên — như hàng phim của Netflix.
        const first = r.left - grid.left < r.width / 2
        const last = grid.right - r.right < r.width / 2 + 16
        const wanted = first ? r.left : last ? r.right - width : r.left + r.width / 2 - width / 2
        const left = Math.min(Math.max(wanted, 8), window.innerWidth - width - 8)
        // Ảnh nở quanh tâm ô gốc, dòng tên thò xuống dưới; không tràn khỏi cửa sổ.
        const top = Math.min(Math.max(r.top + r.height / 2 - imageH / 2, 56), window.innerHeight - imageH - ZOOM_INFO_H - 8)
        setZoom({
          key: ++zoomSeq.current,
          font: fontInfo(id),
          left,
          top,
          width,
          originX: r.left + r.width / 2 - left,
          originY: r.top + r.height / 2 - top,
          from: r.width / width,
        })
      },
      ZOOM_DELAY,
    )
  }
  useEffect(
    () => () => {
      clearTimeout(previewTimer.current)
      clearTimeout(zoomTimer.current)
      onPreview?.(null)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const hover = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-font]')
    preview(card?.dataset.font ?? null, card ?? undefined)
  }
  const select = (id: FontId) => {
    preview(null)
    // Con trỏ vẫn nằm trên ô vừa chọn: coi như đã xem xong font này, để ô không tự phóng to lại cho tới khi rê sang ô khác.
    previewing.current = id
    noteRecentFont(id)
    onChange(id)
  }
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
    // Cửa sổ đổi cỡ, hoặc hàng nút lọc phía trên xuống dòng, đều làm vị trí lưới thay đổi.
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    if (el.parentElement) observer.observe(el.parentElement)
    return () => observer.disconnect()
  }, [])

  const fonts = useMemo(() => {
    const q = plain(query.trim())
    const matches = (f: FontInfo) => !q || plain(f.label).includes(q)
    if (group === 'system') return Array.isArray(system) ? system.filter(matches) : []
    // Yêu thích gồm cả font của máy đã thả tim (dựng lại từ id, không cần đọc lại danh sách font trên máy).
    if (group === 'fav') return [...FONTS.filter((f) => favSet.has(f.id)), ...favorites.filter(isSystemFont).map(fontInfo)].filter(matches)
    return FONTS.filter((f) => (group === 'all' || f.group === group) && matches(f))
  }, [query, group, favSet, favorites, system])

  // Font dùng gần đây chỉ hiện ở mục "Tất cả" khi không tìm kiếm, để lưới lọc / tìm không bị lẫn.
  const recent = useMemo(() => (group === 'all' && !query.trim() ? recentIds.map(fontInfo) : []), [group, query, recentIds])

  // Mở bảng chọn (hoặc danh sách font trên máy vừa đọc xong) thì cuộn tới font đang dùng.
  useEffect(() => {
    list.current?.querySelector('[data-current]')?.scrollIntoView({ block: 'nearest' })
  }, [system])

  return (
    <div className="space-y-2.5">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={group === 'system' && Array.isArray(system) ? `Tìm trong ${system.length} font trên máy` : `Tìm trong ${FONTS.length} font`}
          aria-label="Tìm font"
          className="h-9 w-full rounded-full border border-line bg-surface pl-9 pr-3 text-[13px] focus:border-coral focus:outline-none focus:ring-4 focus:ring-coral/15"
        />
      </label>

      <div className="flex flex-wrap gap-1.5">
        {[{ id: 'all' as const, label: 'Tất cả' }, { id: 'fav' as const, label: 'Yêu thích' }, ...FONT_GROUPS].map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={group === g.id}
            onClick={() => setGroup(g.id)}
            className={cx(
              'flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors',
              group === g.id ? 'bg-ink text-paper' : 'bg-sand text-soft hover:text-ink',
            )}
          >
            {g.id === 'fav' && <Heart className="size-3" />}
            {g.label}
            {g.id === 'fav' && <span className="font-normal opacity-60">{favorites.length}</span>}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={group === 'system'}
          data-tip="Font bạn đã cài trên máy tính này"
          onClick={() => setGroup('system')}
          className={cx(
            'flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors',
            group === 'system' ? 'bg-ink text-paper' : 'bg-sand text-soft hover:text-ink',
          )}
        >
          <Monitor className="size-3" />
          Trên máy
        </button>
      </div>

      <div
        ref={list}
        className={cx(
          'scroll-soft -mx-1 grid content-start overflow-y-auto overscroll-contain p-1',
          // Font của máy không có ảnh minh hoạ nên xếp thành danh sách gọn; font có sẵn xếp lưới như thư viện ảnh.
          // Số cột tự tăng khi bảng được kéo rộng ra (mặc định: lưới 3 cột, danh sách 1 cột).
          group === 'system' ? 'grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-2 gap-y-0.5' : 'grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-2',
        )}
        style={{ maxHeight: listHeight }}
        // Dừng chuột trên một font: dòng chữ đang chọn trên ảnh đổi tạm sang font đó (chưa ghi vào thiết kế), lâu hơn chút thì ô phóng to.
        onPointerOver={hover}
        onPointerLeave={() => preview(null)}
        // Cuộn làm ô dưới con trỏ đổi chỗ: thu ô phóng to lại, rê tiếp sẽ tính lại cho ô mới.
        onScroll={() => preview(null)}
      >
        {recent.length > 0 && (
          <>
            <p className="col-span-full px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Dùng gần đây</p>
            {recent.map((f) => (
              <FontCard key={`recent-${f.id}`} font={f} selected={f.id === value} fav={favSet.has(f.id)} onSelect={select} onToggleFav={toggleFavoriteFont} />
            ))}
            <p className="col-span-full px-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Tất cả font</p>
          </>
        )}
        {fonts.map((f) =>
          group === 'system' ? (
            <FontRow key={f.id} font={f} selected={f.id === value} fav={favSet.has(f.id)} onSelect={select} onToggleFav={toggleFavoriteFont} />
          ) : (
            <FontCard key={f.id} font={f} selected={f.id === value} fav={favSet.has(f.id)} onSelect={select} onToggleFav={toggleFavoriteFont} />
          ),
        )}
        {!fonts.length && (
          <p className="col-span-full px-3 py-6 text-center text-[13px] leading-relaxed text-muted">
            {group === 'fav' && !favorites.length ? (
              <>
                Chưa có font yêu thích nào. Bấm biểu tượng <Heart className="inline size-3.5 align-[-2px]" /> ở góc một font để thêm vào đây.
              </>
            ) : group === 'system' && system === null ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="size-4 animate-spin" />
                Đang đọc font trên máy…
              </span>
            ) : group === 'system' && system === 'error' ? (
              <>
                Không đọc được danh sách font trên máy.{' '}
                <button type="button" className="font-semibold text-coral-dark hover:underline" onClick={() => setSystem(null)}>
                  Thử lại
                </button>
              </>
            ) : (
              'Không có font nào khớp.'
            )}
          </p>
        )}
      </div>
      {zoom && (
        <FontZoom
          key={zoom.key}
          zoom={zoom}
          selected={zoom.font.id === value}
          fav={favSet.has(zoom.font.id)}
          onClosed={(key) => setZoom((z) => (z?.key === key && z.closing ? null : z))}
        />
      )}
    </div>
  )
}
