import {
  ArrowLeftRight,
  ChevronRight,
  Dices,
  Download,
  FlipHorizontal2,
  ImageMinus,
  ImagePlus,
  Images,
  LayoutGrid,
  LoaderCircle,
  Maximize,
  MousePointerClick,
  Move,
  Redo2,
  RotateCcw,
  RotateCw,
  Shuffle,
  Sparkles,
  Trash2,
  SquareCheck,
  SquareDashedMousePointer,
  Type,
  Undo2,
  UnfoldHorizontal,
  X,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { fileUrl, thumbUrl, useUrlVersion } from '../lib/desktop'
import { clamp, DEFAULT_ADJUST, isSideways, MAX_ZOOM, placeImage, type CellAdjust, type Rotation } from '../lib/geometry'
import { collageLayout, type CollageSpec } from '../lib/imaging/exportCollage'
import { MIN_SHARE, moveDivider } from '../lib/layout/compute'
import type { Divider, LayoutNode, Rect } from '../lib/layout/types'
import { nextHint, type Hint } from '../lib/onboarding'
import { buildSpec } from '../lib/useCollage'
import { clampPan, clampViewZoom, MAX_VIEW_ZOOM, MIN_VIEW_ZOOM, zoomByWheel } from '../lib/view'
import { canvasSize, currentDesign, useStore } from '../store'
import { contrast, TextLayer, TextToolbar } from './TextLayer'
import { Button, cx, IconButton } from './ui'

const STAGE_PADDING = 16
const DIVIDER_HIT = 18
/** Khoảng (px màn hình) mà ảnh / đường chia / chữ tự hít vào vị trí thẳng hàng. */
const SNAP = 6
/** Thời gian hiệu ứng trượt của ô ảnh, khớp với .glide trong index.css. */
const GLIDE_MS = 320

/** Đường gióng nét đứt, toạ độ tính trên khung xuất. 'v' = đường dọc tại x = pos, 'h' = đường ngang tại y = pos. */
export interface Guide {
  dir: 'v' | 'h'
  pos: number
  from: number
  to: number
}

interface CellDrag {
  cell: number
  startX: number
  startY: number
  startAdjust: CellAdjust
  moved: boolean
}

interface ZoomDrag {
  id: string
  start: CellAdjust
  cx: number
  cy: number
  d0: number
}

const hitCell = (cells: Rect[], x: number, y: number) =>
  cells.findIndex((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h)

/** Kích thước + transform của thẻ img (trước khi xoay) sao cho vùng ảnh đã xoay nằm đúng `placed`. */
export function imageStyle(placed: ReturnType<typeof placeImage>, adjust: CellAdjust): CSSProperties {
  const w = isSideways(adjust) ? placed.dh : placed.dw
  const h = isSideways(adjust) ? placed.dw : placed.dh
  return {
    width: w,
    height: h,
    transform: `translate(${placed.left + (placed.dw - w) / 2}px, ${placed.top + (placed.dh - h) / 2}px) rotate(${adjust.rot}deg) scaleX(${adjust.flip ? -1 : 1})`,
  }
}

export function Stage() {
  useUrlVersion()
  // Chỉ nghe đúng những trường ảnh hưởng tới khung ghép, để thông báo / tiến độ tải lên… không làm vẽ lại cả khung.
  const source = useStore(
    useShallow((s) => ({
      photos: s.photos,
      selected: s.selected,
      adjust: s.adjust,
      tree: s.tree,
      texts: s.texts,
      margin: s.margin,
      gap: s.gap,
      radius: s.radius,
      bg: s.bg,
      presetId: s.presetId,
      customW: s.customW,
      customH: s.customH,
    })),
  )
  const layoutId = useStore((s) => s.layoutId)
  const activeCell = useStore((s) => s.activeCell)
  const activeText = useStore((s) => s.activeText)
  const editingText = useStore((s) => s.editingText)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  // Thiết kế đang mở nhưng đã bỏ hết ảnh: vẫn vẽ khung với nền và chữ của nó, để người dùng thấy thiết kế còn nguyên.
  const openEmpty = useStore((s) => !s.tree && currentDesign(s) !== null)
  // Ảnh đang kéo từ thư viện lơ lửng trên ô nào (xem lib/stageDrop).
  const dropTarget = useStore((s) => s.dropTarget)
  const hintsSeen = useStore((s) => s.hintsSeen)
  const { setAdjust, setActiveCell, setActiveText, swapCells, setTree, shuffle, randomLayout, toggleSelect, removeActiveCell, undo, redo, markHint } =
    useStore.getState()
  const { selected, tree } = source
  const size = canvasSize(source)

  const root = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  // Lớp phủ để các dòng chữ gắn khung chọn + tay nắm vào (qua portal), vì lớp chứa chữ bị cắt theo khung.
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [viewZoom, setViewZoom] = useState(1)
  const [rawPan, setPan] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height }),
    )
    observer.observe(wrap.current!)
    return () => observer.disconnect()
  }, [])

  // Trong lúc kéo, thay đổi chỉ nằm ở state cục bộ của khung (không ghi store, không lưu nháp, không vẽ lại panel)
  // nên thao tác bám sát con trỏ; thả tay mới ghi vào store thành đúng một bước undo.
  const [live, setLive] = useState<{ id: string; adjust: CellAdjust } | null>(null)
  const [liveTree, setLiveTree] = useState<LayoutNode | null>(null)
  const [guides, setGuidesState] = useState<Guide[]>([])
  // Đường gióng chỉ đổi khi bắt đầu / thôi thẳng hàng → không vẽ lại nếu vẫn y như cũ.
  const guideKey = useRef('')
  const setGuides = (next: Guide[]) => {
    const key = next.map((g) => `${g.dir}${g.pos}:${g.from}-${g.to}`).join('|')
    if (key === guideKey.current) return
    guideKey.current = key
    setGuidesState(next)
  }

  // k: px màn hình trên mỗi px ảnh xuất. Mọi toạ độ tính trên khung xuất rồi nhân k → preview khớp export.
  // viewZoom = 1 là vừa khít vùng nhìn; lớn hơn thì khung tràn ra ngoài và dời được bằng lăn chuột.
  const fitK = Math.max(0.01, Math.min((box.w - STAGE_PADDING * 2) / size.width, box.h / size.height))
  const k = fitK * viewZoom
  const pan = { x: clampPan(rawPan.x, size.width * k, box.w), y: clampPan(rawPan.y, size.height * k, box.h) }
  const overflowing = size.width * k > box.w || size.height * k > box.h
  const spec = useMemo((): CollageSpec | null => {
    const base = buildSpec(liveTree ? { ...source, tree: liveTree } : source)
    if (base && live) base.cells = base.cells.map((c) => (c?.photo.id === live.id ? { ...c, adjust: live.adjust } : c))
    if (base || !openEmpty) return base
    const { width, height } = canvasSize(source)
    return { width, height, bg: source.bg, margin: 0, gap: 0, radius: 0, tree: { kind: 'cell' }, cells: [], texts: source.texts }
  }, [source, live, liveTree, openEmpty])
  const layout = useMemo(() => (!spec ? null : spec.cells.length ? collageLayout(spec) : { cells: [], dividers: [] }), [spec])

  // Hiệu ứng trượt chỉ bật cho thay đổi rời rạc (đổi bố cục, trộn, đổi chỗ, đổi khung, xoay, lật, undo).
  // Kéo thả và slider phải bám tay tức thì nên không được có transition.
  const animKey = `${layoutId}|${selected.join(',')}|${size.width}x${size.height}`
  const anim = useRef({ key: animKey, until: 0 })
  if (anim.current.key !== animKey) anim.current = { key: animKey, until: performance.now() + GLIDE_MS + 80 }
  const glide = performance.now() < anim.current.until && !live && !liveTree
  const bump = () => (anim.current.until = performance.now() + GLIDE_MS + 80)
  const settle = () => (anim.current.until = 0)

  /**
   * Kéo ảnh / kéo tay nắm zoom chạy theo đường tắt: mỗi lần chuột nhúc nhích chỉ ghi thẳng transform vào đúng
   * thẻ img đang kéo (trình duyệt xử lý ở tầng compositor), KHÔNG qua React. React chỉ vẽ lại khi có thay đổi
   * rời rạc (bắt đầu kéo, đường gióng hiện/ẩn, thả tay). Nhờ vậy thao tác chạy đúng tần số quét của màn hình.
   */
  const imgEls = useRef(new Map<string, HTMLImageElement>())
  const boundsEl = useRef<HTMLSpanElement>(null)
  const swapEl = useRef<HTMLImageElement>(null)
  const liveRef = useRef<{ id: string; adjust: CellAdjust } | null>(null)
  const latest = useRef({ spec, layout, k })
  latest.current = { spec, layout, k }

  const paintLive = (next: { id: string; adjust: CellAdjust }) => {
    const { spec, layout, k } = latest.current
    const i = spec ? spec.cells.findIndex((c) => c?.photo.id === next.id) : -1
    const rect = layout?.cells[i]
    const cell = spec?.cells[i]
    if (!cell || !rect) return
    const { photo } = cell
    const placed = placeImage(photo.width, photo.height, rect.w * k, rect.h * k, next.adjust)
    const style = imageStyle(placed, next.adjust)
    const el = imgEls.current.get(next.id)
    if (el) {
      el.style.width = `${style.width}px`
      el.style.height = `${style.height}px`
      el.style.transform = style.transform as string
    }
    const b = boundsEl.current
    if (b) {
      b.style.left = `${rect.x * k + placed.left}px`
      b.style.top = `${rect.y * k + placed.top}px`
      b.style.width = `${placed.dw}px`
      b.style.height = `${placed.dh}px`
    }
  }
  const pushLive = (next: { id: string; adjust: CellAdjust }) => {
    const first = !liveRef.current
    liveRef.current = next
    // Lần đầu: để React dựng khung ảnh ngay trong khung hình này, các lần sau chỉ ghi thẳng vào DOM.
    if (first) flushSync(() => setLive(next))
    else paintLive(next)
  }
  const endLive = (commit: boolean) => {
    const l = liveRef.current
    liveRef.current = null
    if (l && commit) setAdjust(l.id, l.adjust)
    setLive(null)
  }

  const drag = useRef<CellDrag | null>(null)
  const zoomDrag = useRef<ZoomDrag | null>(null)
  const [swapTarget, setSwapTarget] = useState<number | null>(null)
  const swapPos = useRef({ x: 0, y: 0 })
  const [dragging, setDragging] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }
  }

  const onCellDown = (e: ReactPointerEvent, cell: number) => {
    const target = spec?.cells[cell]
    if (e.button !== 0 || !target) return
    // Giữ Shift rồi kéo trên ảnh: khoanh vùng chọn chữ thay vì dời ảnh.
    if (e.shiftKey) return startMarquee(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { cell, startX: e.clientX, startY: e.clientY, startAdjust: target.adjust, moved: false }
  }

  const onCellMove = (e: ReactPointerEvent) => {
    const d = drag.current
    const moving = d && spec?.cells[d.cell]
    if (!d || !moving || !spec || !layout) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    if (!d.moved) {
      d.moved = true
      settle()
      setDragging(d.cell)
    }

    const { photo } = moving
    const p = toCanvas(e)
    const over = hitCell(layout.cells, p.x, p.y)
    if (over >= 0 && over !== d.cell) {
      // Kéo sang ô khác → chế độ đổi chỗ: ảnh trong ô gốc về lại vị trí cũ, một bản thu nhỏ bay theo con trỏ.
      swapPos.current = { x: e.clientX, y: e.clientY }
      if (swapEl.current) {
        swapEl.current.style.left = `${e.clientX}px`
        swapEl.current.style.top = `${e.clientY}px`
      }
      if (liveRef.current) {
        // Trả ảnh về đúng vị trí ban đầu trước khi React nhận lại quyền vẽ.
        paintLive({ id: photo.id, adjust: d.startAdjust })
        endLive(false)
      }
      if (swapTarget !== over) setSwapTarget(over)
      setGuides([])
      return
    }
    if (swapTarget !== null) setSwapTarget(null)
    const rect = layout.cells[d.cell]
    const placed = placeImage(photo.width, photo.height, rect.w * k, rect.h * k, d.startAdjust)
    const overflowX = placed.dw - rect.w * k
    const overflowY = placed.dh - rect.h * k
    let cx = overflowX > 0.5 ? clamp(d.startAdjust.cx - dx / overflowX, 0, 1) : d.startAdjust.cx
    let cy = overflowY > 0.5 ? clamp(d.startAdjust.cy - dy / overflowY, 0, 1) : d.startAdjust.cy
    // Hít vào chính giữa ô và hiện đường gióng, giống các app thiết kế.
    const next: Guide[] = []
    if (overflowX > SNAP * 3 && Math.abs(cx - 0.5) * overflowX < SNAP) {
      cx = 0.5
      next.push({ dir: 'v', pos: rect.x + rect.w / 2, from: rect.y, to: rect.y + rect.h })
    }
    if (overflowY > SNAP * 3 && Math.abs(cy - 0.5) * overflowY < SNAP) {
      cy = 0.5
      next.push({ dir: 'h', pos: rect.y + rect.h / 2, from: rect.x, to: rect.x + rect.w })
    }
    pushLive({ id: photo.id, adjust: { ...d.startAdjust, cx, cy } })
    setGuides(next)
  }

  const onCellUp = () => {
    const d = drag.current
    drag.current = null
    setDragging(null)
    if (!d) return
    if (swapTarget !== null) {
      swapCells(d.cell, swapTarget)
      markHint('swap')
    } else if (!d.moved) setActiveCell(activeCell === d.cell ? null : d.cell)
    else markHint('pan')
    endLive(d.moved && swapTarget === null)
    setGuides([])
    setSwapTarget(null)
  }

  // Kéo tay nắm ở góc ô đang chọn = phóng to / thu nhỏ ảnh trong ô (kéo ra xa tâm là phóng to).
  const onZoomDown = (e: ReactPointerEvent, cell: number) => {
    if (!spec || !layout) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    settle()
    const r = stage.current!.getBoundingClientRect()
    const rect = layout.cells[cell]
    const cx = r.left + (rect.x + rect.w / 2) * k
    const cy = r.top + (rect.y + rect.h / 2) * k
    const target = spec.cells[cell]
    if (!target) return
    const { photo, adjust } = target
    zoomDrag.current = { id: photo.id, start: adjust, cx, cy, d0: Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy)) }
  }
  const onZoomMove = (e: ReactPointerEvent) => {
    const z = zoomDrag.current
    if (!z) return
    const ratio = Math.hypot(e.clientX - z.cx, e.clientY - z.cy) / z.d0
    pushLive({ id: z.id, adjust: { ...z.start, zoom: clamp(z.start.zoom * ratio, 1, MAX_ZOOM) } })
  }
  const onZoomUp = () => {
    endLive(zoomDrag.current !== null)
    if (zoomDrag.current) markHint('zoom')
    zoomDrag.current = null
  }

  // Ctrl + cuộn: zoom cả khung làm việc. Cuộn thường: zoom ảnh trong ô; khi khung đang tràn vùng nhìn thì cuộn để dời khung.
  // Phải gắn listener native vì cần preventDefault (React gắn wheel dạng passive).
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {})
  wheelRef.current = (e) => {
    if (!spec || !layout || !stage.current) return
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      settle()
      setViewZoom((z) => zoomByWheel(z, e.deltaY))
      return
    }
    if (overflowing) {
      e.preventDefault()
      setPan({ x: pan.x - (e.shiftKey ? e.deltaY : e.deltaX), y: pan.y - (e.shiftKey ? 0 : e.deltaY) })
      return
    }
    const p = toCanvas(e)
    const cell = hitCell(layout.cells, p.x, p.y)
    const target = spec.cells[cell]
    if (!target) return
    e.preventDefault()
    settle()
    const { photo, adjust: a } = target
    setAdjust(photo.id, { zoom: clamp(a.zoom * Math.exp(-e.deltaY * 0.0015), 1, MAX_ZOOM) })
    markHint('zoom')
  }
  useEffect(() => {
    const el = root.current!
    const handler = (e: WheelEvent) => wheelRef.current(e)
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const active = (spec && activeCell !== null && spec.cells[activeCell]) || undefined
  // Đang chọn một ô trống: chờ người dùng bấm ảnh trong thư viện để đưa vào ô đó.
  const activeEmpty = !!spec && activeCell !== null && activeCell < spec.cells.length && !spec.cells[activeCell]
  /** Bấm một ô trống: chọn ô đó rồi mở thư viện để lấy ảnh. */
  const pickSlot = (cell: number) => {
    if (activeCell === cell) return setActiveCell(null)
    setActiveCell(cell)
    useStore.setState({ tab: 'library', leftCollapsed: false })
  }
  const activeItem = spec?.texts.find((t) => t.id === activeText)
  const deselect = () => {
    setActiveCell(null)
    setActiveText(null)
  }

  /**
   * Khoanh vùng: giữ chuột trái ở chỗ trống (ngoài khung, nền khung, hoặc Shift + kéo trên ảnh) rồi kéo thành hình chữ
   * nhật; thả tay thì mọi dòng chữ chạm vào vùng đó được chọn chung, sẵn sàng để gộp nhóm.
   */
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const marqueeStart = useRef<{ x: number; y: number } | null>(null)
  const [marqueeHits, setMarqueeHits] = useState<DOMRect[]>([])
  const touching = (m: { x0: number; y0: number; x1: number; y1: number }) => {
    const left = Math.min(m.x0, m.x1)
    const right = Math.max(m.x0, m.x1)
    const top = Math.min(m.y0, m.y1)
    const bottom = Math.max(m.y0, m.y1)
    return [...document.querySelectorAll<HTMLElement>('[data-text]')]
      .map((node) => ({ id: node.dataset.text!, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top)
  }
  const startMarquee = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    deselect()
    if (!spec?.texts.length || !wrap.current) return
    wrap.current.setPointerCapture(e.pointerId)
    marqueeStart.current = { x: e.clientX, y: e.clientY }
  }
  const moveMarquee = (e: ReactPointerEvent) => {
    const from = marqueeStart.current
    if (!from || (!marquee && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 4)) return
    const next = { x0: from.x, y0: from.y, x1: e.clientX, y1: e.clientY }
    setMarquee(next)
    setMarqueeHits(touching(next).map((hit) => hit.rect))
  }
  const endMarquee = () => {
    marqueeStart.current = null
    if (!marquee) return
    useStore.getState().pickTexts(touching(marquee).map((hit) => hit.id))
    markHint('marquee')
    setMarquee(null)
    setMarqueeHits([])
  }

  // Thứ tự DOM cố định theo id ảnh: khi trộn / đổi chỗ, React chỉ đổi style chứ không dời node,
  // nhờ vậy transition chạy được và ảnh trượt sang ô mới thay vì nhảy cóc.
  const order = useMemo(
    () =>
      spec
        ? spec.cells
            .map((_, i) => i)
            .filter((i) => spec.cells[i])
            .sort((a, b) => (spec.cells[a]!.photo.id < spec.cells[b]!.photo.id ? -1 : 1))
        : [],
    [spec],
  )

  /** Khung ô và khung toàn bộ ảnh (kể cả phần bị ô che) theo px màn hình. Chỉ gọi cho ô đang có ảnh. */
  const frames = (i: number) => {
    const rect = layout!.cells[i]
    const cell = spec!.cells[i]!
    const placed = placeImage(cell.photo.width, cell.photo.height, rect.w * k, rect.h * k, cell.adjust)
    return {
      rect,
      cell,
      placed,
      box: { left: rect.x * k, top: rect.y * k, width: rect.w * k, height: rect.h * k },
      image: { left: rect.x * k + placed.left, top: rect.y * k + placed.top, width: placed.dw, height: placed.dh },
      overflows: placed.dw - rect.w * k > 2 || placed.dh - rect.h * k > 2,
      radius: Math.min(spec!.radius, rect.w / 2, rect.h / 2) * k,
    }
  }

  const liveCell = spec && live ? spec.cells.findIndex((c) => c?.photo.id === live.id) : -1
  const busy = dragging !== null || liveTree !== null || live !== null
  const hoverCell = !busy && hover !== null && hover !== activeCell && spec?.cells[hover] && layout?.cells[hover] ? hover : null
  const activeIndex = active && layout?.cells[activeCell!] ? activeCell! : null
  // Ô đang hiện khung kích thước thật của ảnh: ô đang kéo, không thì ô đang chọn.
  const frameCell = liveCell >= 0 && layout?.cells[liveCell] ? liveCell : dragging === null ? activeIndex : null

  // Gợi ý thao tác cho người mới: mỗi lần một cái, làm được rồi thì thôi.
  const hint =
    spec && layout
      ? nextHint({
          cells: spec.cells.length,
          photos: spec.cells.filter(Boolean).length,
          // Các dòng trong cùng một nhóm vốn đã đi chung, không cần khoanh vùng.
          texts: new Set(spec.texts.map((t) => t.group ?? t.id)).size,
          canPan: spec.cells.some((c, i) => !!c && !!layout.cells[i] && frames(i).overflows),
          seen: hintsSeen,
        })
      : null

  const zoomControl = (
    <span className="flex items-center rounded-full bg-card pl-3 shadow-sm">
      <input
        type="range"
        aria-label="Thu phóng khung làm việc"
        data-tip="Thu phóng khung làm việc (Ctrl + lăn chuột)"
        className="hidden w-20 lg:block"
        min={MIN_VIEW_ZOOM}
        max={MAX_VIEW_ZOOM}
        step={0.05}
        value={viewZoom}
        style={{ '--fill': `${((viewZoom - MIN_VIEW_ZOOM) / (MAX_VIEW_ZOOM - MIN_VIEW_ZOOM)) * 100}%` } as CSSProperties}
        onChange={(e) => {
          settle()
          setViewZoom(clampViewZoom(Number(e.target.value)))
        }}
      />
      <span className="w-11 text-center text-xs font-semibold tabular-nums text-soft lg:ml-1.5" data-tip="Tỉ lệ so với kích thước ảnh xuất">
        {Math.round(k * 100)}%
      </span>
      <IconButton
        label="Vừa khung"
        disabled={viewZoom === 1 && pan.x === 0 && pan.y === 0}
        onClick={() => {
          bump()
          setViewZoom(1)
          setPan({ x: 0, y: 0 })
        }}
      >
        <Maximize className="size-4" />
      </IconButton>
    </span>
  )

  return (
    // isolate: các lớp z-index của khung ghép chỉ so với nhau, không trèo lên menu của thanh tiêu đề.
    <div ref={root} data-stage className="relative isolate flex h-full min-h-0 flex-col overflow-hidden stage-bg">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 p-2.5 lg:p-3">
        <div className="pointer-events-auto flex items-center gap-1.5">
          <span className="rounded-full bg-card px-3 py-1.5 text-xs font-semibold tabular-nums text-soft shadow-sm">
            {size.width} × {size.height}
          </span>
          <span className="flex rounded-full bg-card shadow-sm">
            <IconButton
              label="Hoàn tác (Ctrl+Z)"
              onClick={() => {
                bump()
                undo()
              }}
              disabled={!canUndo}
            >
              <Undo2 className="size-4" />
            </IconButton>
            <IconButton
              label="Làm lại (Ctrl+Shift+Z)"
              onClick={() => {
                bump()
                redo()
              }}
              disabled={!canRedo}
            >
              <Redo2 className="size-4" />
            </IconButton>
          </span>
          {/* Màn hình hẹp: thanh thu phóng nằm ở đây; màn hình rộng thì ở góc dưới bên phải khung làm việc. */}
          {spec && <span className="lg:hidden">{zoomControl}</span>}
        </div>
        {spec && tree && (
          <div className="pointer-events-auto flex gap-1.5 lg:gap-2">
            <Button
              onClick={shuffle}
              disabled={selected.length < 2}
              aria-label="Trộn ảnh"
              data-tip="Trộn vị trí ảnh"
              className="h-9 px-3 text-[13px]"
            >
              <Shuffle className="size-4" />
              <span className="hidden xl:inline">Trộn ảnh</span>
            </Button>
            <Button
              onClick={randomLayout}
              aria-label="Bố cục ngẫu nhiên"
              data-tip="Đổi bố cục ngẫu nhiên"
              className="h-9 px-3 text-[13px]"
            >
              <Dices className="size-4" />
              <span className="hidden xl:inline">Bố cục ngẫu nhiên</span>
            </Button>
          </div>
        )}
      </div>

      <div
        ref={wrap}
        className={cx(
          'relative grid min-h-0 flex-1 place-items-center',
          // Thanh công cụ chữ nằm ngay dưới hàng nút trên cùng: chỉ chừa chỗ cho nó khi đang chọn chữ.
          activeItem ? 'mt-[108px]' : 'mt-14',
          // Chỉ chừa chỗ cho thanh công cụ ảnh khi nó đang hiện, để khung ghép được to nhất có thể trên mobile.
          active || activeEmpty ? 'mb-16' : 'mb-3 lg:mb-12',
        )}
        onPointerDown={(e) => e.target === e.currentTarget && startMarquee(e)}
        onPointerMove={moveMarquee}
        onPointerUp={endMarquee}
        onPointerCancel={endMarquee}
      >
        {marquee && (
          <>
            {marqueeHits.map((r, i) => (
              <span key={i} className="pointer-events-none fixed z-40 rounded-[3px] shadow-[0_0_0_1.5px_var(--color-coral)]" style={{ left: r.left - 3, top: r.top - 3, width: r.width + 6, height: r.height + 6 }} />
            ))}
            <span
              className="pointer-events-none fixed z-40 rounded-[2px] border border-coral bg-coral/15"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
              }}
            />
          </>
        )}
        {/* Kéo ảnh từ thư viện vào khung còn trống: thả là mở ảnh đó. */}
        {dropTarget === 'stage' && (
          <span className="pointer-events-none absolute inset-3 z-20 animate-fade rounded-3xl border-2 border-dashed border-coral bg-coral/10" />
        )}
        {!spec || !layout ? (
          <EmptyStage />
        ) : (
          <div
            ref={stage}
            data-frame
            // absolute: kích thước khung không được ảnh hưởng ngược lại vùng chứa (tránh vòng lặp đo ↔ vẽ).
            className={cx('absolute left-1/2 top-1/2 touch-none select-none', glide && 'glide')}
            style={{ width: size.width * k, height: size.height * k, translate: `calc(-50% + ${pan.x}px) calc(-50% + ${pan.y}px)` }}
          >
            <div
              className="absolute inset-0 overflow-hidden shadow-lift"
              style={{ background: spec.bg }}
              onPointerDown={(e) => e.target === e.currentTarget && startMarquee(e)}
            >
              {openEmpty && (
                // Chỗ của ảnh: nằm dưới chữ, không bắt chuột để vẫn bấm / kéo được chữ trên khung.
                <div className="pointer-events-none absolute inset-[4%] grid place-items-center rounded-2xl border-2 border-dashed border-white/45 text-center mix-blend-difference">
                  <div className="px-4 text-white/80">
                    <ImagePlus className="mx-auto size-8" />
                    <p className="mt-2 text-sm font-semibold">Chưa có ảnh</p>
                    <p className="mt-0.5 text-xs">Chọn ảnh trong thư viện để ghép tiếp</p>
                  </div>
                </div>
              )}
              {order.map((i) => {
                const rect = layout.cells[i]
                const cell = spec.cells[i]
                if (!rect || !cell) return null
                const placed = placeImage(cell.photo.width, cell.photo.height, rect.w * k, rect.h * k, cell.adjust)
                return (
                  <div
                    key={cell.photo.id}
                    data-cell={i}
                    onPointerDown={(e) => onCellDown(e, i)}
                    onPointerMove={onCellMove}
                    onPointerUp={onCellUp}
                    onPointerCancel={onCellUp}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(i)}
                    onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                    className={cx(
                      // animate-cell: ảnh vừa được chọn hiện lên mềm mại thay vì bật ra.
                      'absolute animate-cell overflow-hidden [contain:layout_paint]',
                      glide && 'glide',
                      dragging === i ? 'cursor-grabbing' : 'cursor-grab',
                      dragging === i && swapTarget !== null && 'opacity-40',
                    )}
                    style={{
                      left: rect.x * k,
                      top: rect.y * k,
                      width: rect.w * k,
                      height: rect.h * k,
                      borderRadius: Math.min(spec.radius, rect.w / 2, rect.h / 2) * k,
                    }}
                  >
                    <img
                      ref={(el) => {
                        if (el) imgEls.current.set(cell.photo.id, el)
                        else imgEls.current.delete(cell.photo.id)
                      }}
                      // Bản web: địa chỉ ảnh được tạo dần; chưa có thì để trống, thumbnail làm nền hiện trước.
                      src={fileUrl(cell.photo.id) || undefined}
                      alt={cell.photo.name}
                      draggable={false}
                      decoding="async"
                      // will-change: ảnh nằm trên lớp GPU riêng nên dịch chuyển không phải vẽ lại.
                      className={cx('pointer-events-none absolute left-0 top-0 max-w-none bg-cover will-change-transform', glide && 'glide')}
                      style={{
                        ...imageStyle(placed, cell.adjust),
                        // Thumbnail làm nền để thấy ảnh ngay trong lúc bản đầy đủ đang tải.
                        backgroundImage: `url(${thumbUrl(cell.photo.id)})`,
                      }}
                    />
                    {(swapTarget === i || dropTarget === i) && (
                      <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-coral/25 shadow-[inset_0_0_0_4px_var(--color-coral)]" />
                    )}
                  </div>
                )
              })}
              {/* Ô trống: chỗ chờ ảnh. Bấm để chọn ô rồi lấy ảnh trong thư viện; kéo ảnh từ thư viện hay từ ô khác thả vào cũng được. */}
              {spec.cells.map((cell, i) => {
                const rect = layout.cells[i]
                if (cell || !rect) return null
                const chosen = activeCell === i || swapTarget === i || dropTarget === i
                return (
                  <button
                    key={`slot-${i}`}
                    type="button"
                    data-cell={i}
                    aria-pressed={activeCell === i}
                    aria-label={`Ô trống ${i + 1}: bấm để chọn ảnh cho ô này`}
                    onClick={() => pickSlot(i)}
                    className={cx('group absolute grid animate-cell place-items-center', glide && 'glide')}
                    style={{
                      left: rect.x * k,
                      top: rect.y * k,
                      width: rect.w * k,
                      height: rect.h * k,
                      borderRadius: Math.min(spec.radius, rect.w / 2, rect.h / 2) * k,
                      // Đen trên nền sáng, trắng trên nền tối: ô trống nhìn rõ trên mọi màu nền của khung.
                      color: contrast(spec.bg),
                    }}
                  >
                    <span className="absolute inset-0 rounded-[inherit] border-2 border-dashed border-current bg-current opacity-[0.07] transition-opacity group-hover:opacity-[0.14]" />
                    <span className="absolute inset-0 rounded-[inherit] border-2 border-dashed border-current opacity-35 transition-opacity group-hover:opacity-70" />
                    {chosen && <span className="absolute inset-0 rounded-[inherit] bg-coral/20 shadow-[inset_0_0_0_3px_var(--color-coral)]" />}
                    {Math.min(rect.w, rect.h) * k > 36 && (
                      <ImagePlus className={cx('relative size-6 transition-opacity', chosen ? 'text-coral' : 'opacity-45 group-hover:opacity-80')} />
                    )}
                  </button>
                )
              })}
              {tree &&
                !live &&
                layout.dividers.map((divider) => (
                  <DividerHandle
                    key={`${divider.path.join('.')}/${divider.index}`}
                    divider={divider}
                    all={layout.dividers}
                    k={k}
                    tree={tree}
                    width={size.width}
                    height={size.height}
                    onStart={settle}
                    onLive={(next, lines) =>
                      // flushSync: vẽ ngay trong chính khung hình của sự kiện chuột, không chờ React xếp lịch.
                      flushSync(() => {
                        setLiveTree(next)
                        setGuides(lines)
                      })
                    }
                    onCommit={(next) => {
                      setTree(next)
                      markHint('resize')
                    }}
                  />
                ))}
              {spec.texts.map((item) => (
                <TextLayer
                  key={item.id}
                  item={item}
                  width={size.width}
                  height={size.height}
                  k={k}
                  active={activeText === item.id}
                  editing={editingText === item.id}
                  overlay={overlay}
                  onGuides={setGuides}
                />
              ))}
            </div>

            {/* Lớp phủ: không bị cắt theo khung, nên vẽ được phần ảnh tràn ra ngoài ô và các tay nắm. */}
            <div ref={setOverlay} className="pointer-events-none absolute inset-0 z-20">
              {/* Đang kéo ảnh của một ô: viền ô đó, để thấy mình đang cắt tới đâu. */}
              {liveCell >= 0 &&
                layout.cells[liveCell] &&
                (() => {
                  const f = frames(liveCell)
                  return <span className="absolute shadow-[0_0_0_2px_var(--color-coral)]" style={{ ...f.box, borderRadius: f.radius }} />
                })()}

              {hoverCell !== null &&
                (() => {
                  const f = frames(hoverCell)
                  return <span className="absolute shadow-[0_0_0_2px_var(--color-coral)]" style={{ ...f.box, borderRadius: f.radius }} />
                })()}

              {activeIndex !== null &&
                dragging === null &&
                (() => {
                  const f = frames(activeIndex)
                  const sides = adjacentDividers(f.rect, layout.dividers)
                  const pill = 'absolute rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.4)] ring-2 ring-coral -translate-x-1/2 -translate-y-1/2'
                  return (
                    <div className={cx('absolute', glide && 'glide')} style={f.box}>
                      <span
                        className="absolute inset-0 shadow-[0_0_0_2.5px_var(--color-coral)]"
                        style={{ borderRadius: f.radius }}
                      />
                      {/* Cạnh nào kéo được để đổi kích thước ô thì có tay nắm dẹt (thao tác kéo do đường chia bên dưới xử lý). */}
                      {sides.left && <span className={cx(pill, 'h-6 w-1.5')} style={{ left: 0, top: '50%' }} />}
                      {sides.right && <span className={cx(pill, 'h-6 w-1.5')} style={{ left: '100%', top: '50%' }} />}
                      {sides.top && <span className={cx(pill, 'h-1.5 w-6')} style={{ left: '50%', top: 0 }} />}
                      {sides.bottom && <span className={cx(pill, 'h-1.5 w-6')} style={{ left: '50%', top: '100%' }} />}
                      {!live && Math.min(f.box.width, f.box.height) > 90 && (
                        <span
                          className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 animate-pop place-items-center rounded-full bg-black/55 text-white"
                          data-tip="Kéo để di chuyển ảnh trong ô"
                        >
                          <Move className="size-4" />
                        </span>
                      )}
                    </div>
                  )
                })()}

              {/*
                Khung nét liền = kích thước thật của ảnh, kể cả phần bị ô cắt mất. Bốn nút tròn nằm ở góc ảnh (thường là ngoài ô),
                kéo để phóng to / thu nhỏ. Trong lúc kéo, paintLive ghi thẳng vị trí vào khung này nên các nút đi theo.
              */}
              {frameCell !== null &&
                (() => {
                  const f = frames(frameCell)
                  return (
                    <span ref={boundsEl} className={cx('absolute shadow-[0_0_0_1.5px_var(--color-coral)]', glide && 'glide')} style={f.image}>
                      {(
                        [
                          ['0%', '0%', 'cursor-nwse-resize'],
                          ['100%', '0%', 'cursor-nesw-resize'],
                          ['0%', '100%', 'cursor-nesw-resize'],
                          ['100%', '100%', 'cursor-nwse-resize'],
                        ] as const
                      ).map(([left, top, cursor]) => (
                        <span
                          key={left + top}
                          role="slider"
                          aria-label="Kéo để phóng to / thu nhỏ ảnh"
                          aria-valuemin={1}
                          aria-valuemax={MAX_ZOOM}
                          aria-valuenow={f.cell.adjust.zoom}
                          data-tip="Kéo để phóng to / thu nhỏ ảnh"
                          className={cx('group pointer-events-auto absolute grid size-7 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center', cursor)}
                          style={{ left, top }}
                          onPointerDown={(e) => onZoomDown(e, frameCell)}
                          onPointerMove={onZoomMove}
                          onPointerUp={onZoomUp}
                          onPointerCancel={onZoomUp}
                        >
                          <span className="size-3 rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.4)] ring-2 ring-coral transition-transform group-hover:scale-125" />
                        </span>
                      ))}
                    </span>
                  )
                })()}

              {guides.map((g, i) => (
                <span
                  key={i}
                  className="absolute"
                  style={
                    g.dir === 'v'
                      ? { left: g.pos * k - 0.75, top: g.from * k, height: (g.to - g.from) * k, borderLeft: '1.5px dashed #f0389f' }
                      : { top: g.pos * k - 0.75, left: g.from * k, width: (g.to - g.from) * k, borderTop: '1.5px dashed #f0389f' }
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Đang kéo ảnh sang ô khác: bản thu nhỏ bay theo con trỏ. */}
      {swapTarget !== null && dragging !== null && spec?.cells[dragging] && (
        <img
          ref={swapEl}
          src={thumbUrl(spec.cells[dragging].photo.id) || undefined}
          alt=""
          className="pointer-events-none fixed z-50 size-20 -translate-x-1/2 -translate-y-1/2 animate-pop rounded-2xl object-cover shadow-lift ring-2 ring-white"
          style={{ left: swapPos.current.x, top: swapPos.current.y }}
        />
      )}

      {active ? (
        <div className="absolute inset-x-0 bottom-2.5 z-30 flex justify-center px-2.5">
          {/* Phóng to / thu nhỏ ảnh: kéo nút tròn ở góc ảnh hoặc lăn chuột, nên thanh này chỉ còn các thao tác bấm. */}
          <div className="flex animate-pop items-center gap-0.5 rounded-full bg-card p-1.5 shadow-lift">
            <IconButton
              label="Xoay 90°"
              onClick={() => {
                const rot = ((active.adjust.rot + 90) % 360) as Rotation
                // 270° → 0° mà có transition thì ảnh quay ngược cả vòng, nên bước đó đổi tức thì.
                if (rot === 0) settle()
                else bump()
                setAdjust(active.photo.id, { rot })
              }}
            >
              <RotateCw className="size-4.5" />
            </IconButton>
            <IconButton
              label="Lật ngang"
              onClick={() => {
                bump()
                setAdjust(active.photo.id, { flip: !active.adjust.flip })
              }}
            >
              <FlipHorizontal2 className="size-4.5" />
            </IconButton>
            <IconButton
              label="Đặt lại ảnh"
              onClick={() => {
                if (active.adjust.rot === 0) bump()
                else settle()
                setAdjust(active.photo.id, DEFAULT_ADJUST)
              }}
            >
              <RotateCcw className="size-4.5" />
            </IconButton>
            <IconButton label="Bỏ ảnh khỏi bố cục" onClick={() => toggleSelect(active.photo.id)}>
              <ImageMinus className="size-4.5" />
            </IconButton>
          </div>
        </div>
      ) : activeEmpty ? (
        <div className="absolute inset-x-0 bottom-2.5 z-30 flex justify-center px-2.5">
          <div className="flex animate-pop items-center gap-2 rounded-full bg-card py-1.5 pl-4 pr-1.5 text-[13px] font-semibold text-soft shadow-lift">
            <Images className="size-4 shrink-0 text-coral-dark" />
            Bấm ảnh trong thư viện để vào ô này
            <IconButton label="Bỏ ô trống này (Delete)" onClick={removeActiveCell}>
              <Trash2 className="size-4.5" />
            </IconButton>
          </div>
        </div>
      ) : activeItem ? (
        <TextToolbar item={activeItem} unit={Math.min(size.width, size.height) / 100} />
      ) : (
        hint && <HintChip hint={hint} onClose={() => markHint(hint)} />
      )}
      {spec && <div className="absolute bottom-2.5 right-2.5 z-30 hidden lg:block">{zoomControl}</div>}
    </div>
  )
}

/** Ô này có đường chia (kéo được) nằm sát cạnh nào? */
function adjacentDividers(rect: Rect, dividers: Divider[]) {
  const near = (a: number, b: number) => Math.abs(a - b) < 1
  const spansY = (d: Divider) => d.rect.y <= rect.y + 0.5 && d.rect.y + d.rect.h >= rect.y + rect.h - 0.5
  const spansX = (d: Divider) => d.rect.x <= rect.x + 0.5 && d.rect.x + d.rect.w >= rect.x + rect.w - 0.5
  return {
    left: dividers.some((d) => d.dir === 'h' && near(d.rect.x + d.rect.w, rect.x) && spansY(d)),
    right: dividers.some((d) => d.dir === 'h' && near(d.rect.x, rect.x + rect.w) && spansY(d)),
    top: dividers.some((d) => d.dir === 'v' && near(d.rect.y + d.rect.h, rect.y) && spansX(d)),
    bottom: dividers.some((d) => d.dir === 'v' && near(d.rect.y, rect.y + rect.h) && spansX(d)),
  }
}

const dividerCenter = (d: Divider) => (d.dir === 'h' ? d.rect.x + d.rect.w / 2 : d.rect.y + d.rect.h / 2)
const startsWith = (path: number[], prefix: number[]) => prefix.every((v, i) => path[i] === v)

interface DividerDrag {
  pos: number
  tree: LayoutNode
  center: number
  /** Các vị trí (px khung xuất) mà đường chia sẽ hít vào: giữa khung, chia đều, thẳng hàng với đường chia khác. */
  targets: number[]
  min: number
  max: number
  last: LayoutNode | null
}

function DividerHandle({
  divider,
  all,
  k,
  tree,
  width,
  height,
  onStart,
  onLive,
  onCommit,
}: {
  divider: Divider
  all: Divider[]
  k: number
  tree: LayoutNode
  width: number
  height: number
  onStart: () => void
  onLive: (tree: LayoutNode | null, guides: Guide[]) => void
  onCommit: (tree: LayoutNode) => void
}) {
  const start = useRef<DividerDrag | null>(null)
  const horizontal = divider.dir === 'h'
  const { rect } = divider
  const thickness = Math.max(DIVIDER_HIT, (horizontal ? rect.w : rect.h) * k)
  const style: CSSProperties = horizontal
    ? { left: (rect.x + rect.w / 2) * k - thickness / 2, top: rect.y * k, width: thickness, height: rect.h * k }
    : { left: rect.x * k, top: (rect.y + rect.h / 2) * k - thickness / 2, width: rect.w * k, height: thickness }

  const end = () => {
    const s = start.current
    start.current = null
    if (s?.last) onCommit(s.last)
    onLive(null, [])
  }

  return (
    <div
      role="separator"
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-label="Kéo để đổi kích thước ô"
      className={cx('group absolute z-10 grid place-items-center', horizontal ? 'cursor-col-resize' : 'cursor-row-resize')}
      style={style}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        onStart()
        let node = tree
        for (const i of divider.path) if (node.kind === 'split') node = node.children[i]
        if (node.kind !== 'split' || divider.span <= 0) return
        const a = node.weights[divider.index]
        const b = node.weights[divider.index + 1]
        const perWeight = divider.span / divider.weightSum
        const center = dividerCenter(divider)
        // Đường chia nằm trong hai phần đang bị co giãn sẽ tự dịch theo nên không dùng làm mốc.
        const moving = [
          [...divider.path, divider.index],
          [...divider.path, divider.index + 1],
        ]
        start.current = {
          pos: horizontal ? e.clientX : e.clientY,
          tree,
          center,
          targets: [
            (horizontal ? width : height) / 2,
            center + ((b - a) / 2) * perWeight,
            ...all
              .filter((o) => o.dir === divider.dir && o !== divider && !moving.some((m) => startsWith(o.path, m)))
              .map(dividerCenter),
          ],
          min: center - (a - (a + b) * MIN_SHARE) * perWeight,
          max: center + (b - (a + b) * MIN_SHARE) * perWeight,
          last: null,
        }
      }}
      onPointerMove={(e) => {
        const s = start.current
        if (!s) return
        let target = s.center + ((horizontal ? e.clientX : e.clientY) - s.pos) / k
        const guides: Guide[] = []
        const snap = s.targets
          .filter((t) => t >= s.min && t <= s.max && Math.abs(t - target) * k < SNAP)
          .sort((p, q) => Math.abs(p - target) - Math.abs(q - target))[0]
        if (snap !== undefined) {
          target = snap
          guides.push(horizontal ? { dir: 'v', pos: snap, from: 0, to: height } : { dir: 'h', pos: snap, from: 0, to: width })
        }
        s.last = moveDivider(s.tree, divider.path, divider.index, ((target - s.center) / divider.span) * divider.weightSum)
        onLive(s.last, guides)
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span
        className={cx(
          // Màn cảm ứng không có hover nên tay nắm luôn hiện mờ để người dùng biết kéo được.
          'rounded-full bg-white opacity-0 shadow-[0_1px_6px_rgb(0_0_0/0.35)] ring-1 ring-black/10 transition-opacity group-hover:opacity-100 group-active:bg-coral group-active:opacity-100 [@media(hover:none)]:opacity-70',
          horizontal ? 'h-9 w-1.5' : 'h-1.5 w-9',
        )}
      />
    </div>
  )
}

const HINT_UI: Record<Hint, { icon: LucideIcon; label: string }> = {
  fill: { icon: ImagePlus, label: 'Bấm hoặc kéo ảnh từ thư viện vào ô trống' },
  pan: { icon: Move, label: 'Kéo ảnh để căn trong ô' },
  zoom: { icon: ZoomIn, label: 'Lăn chuột trên ảnh để phóng to' },
  swap: { icon: ArrowLeftRight, label: 'Kéo ảnh sang ô khác để đổi chỗ' },
  resize: { icon: UnfoldHorizontal, label: 'Kéo đường viền giữa hai ô để đổi cỡ' },
  marquee: { icon: SquareDashedMousePointer, label: 'Kéo từ chỗ trống để chọn nhiều dòng chữ' },
}

/** Một gợi ý thao tác nhỏ ở đáy khung làm việc; tự mất khi người dùng làm được thao tác đó, hoặc bấm × để bỏ qua. */
function HintChip({ hint, onClose }: { hint: Hint; onClose: () => void }) {
  const { icon: Icon, label } = HINT_UI[hint]
  return (
    <div
      key={hint}
      className="absolute bottom-3 left-1/2 z-30 hidden -translate-x-1/2 animate-fade items-center gap-2 whitespace-nowrap rounded-full border border-line bg-card py-1 pl-3 pr-1 text-xs font-semibold text-soft shadow-sm lg:flex"
    >
      <Icon className="size-3.5 text-coral-dark" />
      {label}
      <button
        type="button"
        aria-label="Bỏ qua gợi ý"
        data-tip="Bỏ qua gợi ý này"
        onClick={onClose}
        className="grid size-5 place-items-center rounded-full text-muted hover:bg-sand hover:text-ink"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

/** Bốn bước làm một ảnh ghép, bằng icon; chi tiết từng bước nằm trong chú thích khi rê chuột. */
const FLOW: { icon: LucideIcon; label: string; tip: string }[] = [
  { icon: Images, label: 'Thêm ảnh', tip: 'Chọn ảnh hoặc kéo thả cả thư mục. Ảnh dùng ngay tại chỗ, không tải đi đâu cả' },
  { icon: LayoutGrid, label: 'Ghép', tip: 'Tích nhiều ảnh rồi bấm Ghép. Bố cục tự gợi ý theo ảnh, khung đúng cỡ Facebook, Instagram, TikTok' },
  { icon: Type, label: 'Chữ', tip: 'Hơn 400 mẫu chữ và 500 phông tiếng Việt, gõ thẳng trên ảnh' },
  { icon: Download, label: 'Xuất', tip: 'Xuất nét như Lightroom, lấy thẳng từ ảnh gốc. Xuất được nhiều thiết kế một lượt' },
]

/** Lối đi thứ hai cho người quen chọn bố cục trước rồi mới đưa ảnh vào. */
function LayoutFirst({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => useStore.setState({ tab: 'layout', leftCollapsed: false })}
      className={cx('mx-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-soft transition-colors hover:bg-sand hover:text-ink', className)}
    >
      <LayoutGrid className="size-4" />
      Hoặc chọn bố cục trước
    </button>
  )
}

function EmptyStage() {
  // Chưa có ảnh nào (kể cả đang nhập dở): người mới, cần lời mời và đường đi. Có ảnh rồi thì chỉ cần nhắc cách chọn.
  const fresh = useStore((s) => s.photos.length === 0 && s.imports.length === 0)
  const [loading, setLoading] = useState(false)
  const flow = (
    <ol className="mt-6 hidden items-start justify-center gap-2 lg:flex">
      {FLOW.map(({ icon: Icon, label, tip }, i) => (
        <li key={label} className="flex items-start gap-2">
          {i > 0 && <ChevronRight className="mt-3 size-4 text-muted" />}
          <span data-tip={tip} className="flex w-16 cursor-help flex-col items-center gap-1.5 text-xs font-semibold text-soft">
            <span className="grid size-10 place-items-center rounded-2xl bg-card text-ink shadow-sm">
              <Icon className="size-5" />
            </span>
            {label}
          </span>
        </li>
      ))}
    </ol>
  )

  if (fresh)
    return (
      <div className="mx-6 w-full max-w-md animate-rise text-center">
        <div className="rounded-3xl border-2 border-dashed border-edge px-5 py-5 lg:py-9">
          <span className="mx-auto hidden size-12 place-items-center rounded-full bg-blush text-coral-dark lg:grid">
            <ImagePlus className="size-6" />
          </span>
          <h2 className="font-display text-lg font-bold lg:mt-4 lg:text-2xl">Thả ảnh vào đây</h2>
          <div className="mt-3 flex flex-wrap justify-center gap-2 lg:mt-5">
            <Button variant="primary" onClick={() => void useStore.getState().pickPhotos()}>
              <ImagePlus className="size-4" />
              Thêm ảnh
            </Button>
            <Button
              disabled={loading}
              data-tip="Nạp vài ảnh mẫu và mở sẵn một ảnh ghép có chữ để bạn vọc thử"
              onClick={() => {
                setLoading(true)
                void useStore
                  .getState()
                  .trySamples()
                  .finally(() => setLoading(false))
              }}
            >
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Thử với ảnh mẫu
            </Button>
          </div>
          <LayoutFirst className="mt-3 lg:mt-4" />
        </div>
        {flow}
      </div>
    )

  return (
    <div className="mx-6 max-w-md animate-rise text-center">
      <div className="mx-auto grid w-20 -rotate-3 grid-cols-3 grid-rows-3 gap-1.5 rounded-2xl bg-white p-1.5 shadow-lift aspect-[4/5] dark:bg-surface lg:w-36">
        <div className="col-span-2 row-span-2 rounded-xl bg-coral" />
        <div className="rounded-xl bg-[#3f6bff]" />
        <div className="rounded-xl bg-[#f4a8c6]" />
        <div className="rounded-xl bg-line" />
        <div className="col-span-2 rounded-xl bg-[#b9a6ff]" />
      </div>
      <h2 className="mt-5 font-display text-lg font-bold lg:mt-7 lg:text-2xl">Chọn ảnh để bắt đầu</h2>
      <ul className="mt-3 flex flex-wrap justify-center gap-2 text-[13px] font-semibold text-soft">
        <li className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 shadow-sm">
          <MousePointerClick className="size-4 text-coral-dark" />
          Bấm một ảnh để mở
        </li>
        <li className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 shadow-sm">
          <SquareCheck className="size-4 text-coral-dark" />
          Tích nhiều ảnh rồi bấm Ghép
        </li>
      </ul>
      <LayoutFirst className="mt-3" />
    </div>
  )
}
