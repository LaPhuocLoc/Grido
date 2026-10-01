import { Dices, FlipHorizontal2, ImageMinus, Move, Redo2, RotateCcw, RotateCw, Shuffle, Undo2, ZoomIn } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { fileUrl, thumbUrl } from '../lib/desktop'
import { clamp, DEFAULT_ADJUST, isSideways, MAX_ZOOM, placeImage, type CellAdjust, type Rotation } from '../lib/geometry'
import { collageLayout } from '../lib/imaging/exportCollage'
import { MIN_SHARE, moveDivider } from '../lib/layout/compute'
import type { Divider, LayoutNode, Rect } from '../lib/layout/types'
import { fontFamily, fontWeight, LINE_HEIGHT, textShadow, type TextItem } from '../lib/text'
import { buildSpec } from '../lib/useCollage'
import { canvasSize, useStore } from '../store'
import { Button, cx, IconButton } from './ui'

const STAGE_PADDING = 16
const DIVIDER_HIT = 18
/** Khoảng (px màn hình) mà ảnh / đường chia / chữ tự hít vào vị trí thẳng hàng. */
const SNAP = 6
/** Thời gian hiệu ứng trượt của ô ảnh, khớp với .glide trong index.css. */
const GLIDE_MS = 320

/** Đường gióng nét đứt, toạ độ tính trên khung xuất. 'v' = đường dọc tại x = pos, 'h' = đường ngang tại y = pos. */
interface Guide {
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
function imageStyle(placed: ReturnType<typeof placeImage>, adjust: CellAdjust): CSSProperties {
  const w = isSideways(adjust) ? placed.dh : placed.dw
  const h = isSideways(adjust) ? placed.dw : placed.dh
  return {
    width: w,
    height: h,
    transform: `translate(${placed.left + (placed.dw - w) / 2}px, ${placed.top + (placed.dh - h) / 2}px) rotate(${adjust.rot}deg) scaleX(${adjust.flip ? -1 : 1})`,
  }
}

export function Stage() {
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
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const { setAdjust, setActiveCell, setActiveText, swapCells, setTree, shuffle, randomLayout, toggleSelect, undo, redo } =
    useStore.getState()
  const { selected, tree } = source
  const size = canvasSize(source)

  const wrap = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
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
  const k = Math.max(0.01, Math.min((box.w - STAGE_PADDING * 2) / size.width, box.h / size.height))
  const spec = useMemo(() => {
    const base = buildSpec(liveTree ? { ...source, tree: liveTree } : source)
    if (base && live) base.cells = base.cells.map((c) => (c.photo.id === live.id ? { ...c, adjust: live.adjust } : c))
    return base
  }, [source, live, liveTree])
  const layout = useMemo(() => (spec ? collageLayout(spec) : null), [spec])

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
  const ghostEl = useRef<HTMLImageElement>(null)
  const boundsEl = useRef<HTMLSpanElement>(null)
  const swapEl = useRef<HTMLImageElement>(null)
  const liveRef = useRef<{ id: string; adjust: CellAdjust } | null>(null)
  const latest = useRef({ spec, layout, k })
  latest.current = { spec, layout, k }

  const paintLive = (next: { id: string; adjust: CellAdjust }) => {
    const { spec, layout, k } = latest.current
    const i = spec ? spec.cells.findIndex((c) => c.photo.id === next.id) : -1
    const rect = layout?.cells[i]
    if (!spec || !rect) return
    const { photo } = spec.cells[i]
    const placed = placeImage(photo.width, photo.height, rect.w * k, rect.h * k, next.adjust)
    const style = imageStyle(placed, next.adjust)
    for (const el of [imgEls.current.get(next.id), ghostEl.current]) {
      if (!el) continue
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
    // Lần đầu: để React dựng lớp ảnh mờ ngay trong khung hình này, các lần sau chỉ ghi thẳng vào DOM.
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
    if (e.button !== 0 || !spec) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { cell, startX: e.clientX, startY: e.clientY, startAdjust: spec.cells[cell].adjust, moved: false }
  }

  const onCellMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || !spec || !layout) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    if (!d.moved) {
      d.moved = true
      settle()
      setDragging(d.cell)
    }

    const { photo } = spec.cells[d.cell]
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
    if (swapTarget !== null) swapCells(d.cell, swapTarget)
    else if (!d.moved) setActiveCell(activeCell === d.cell ? null : d.cell)
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
    const { photo, adjust } = spec.cells[cell]
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
    zoomDrag.current = null
  }

  // Cuộn chuột để zoom ảnh trong ô. Phải gắn listener native vì cần preventDefault (React gắn wheel dạng passive).
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {})
  wheelRef.current = (e) => {
    if (!spec || !layout || !stage.current) return
    const p = toCanvas(e)
    const cell = hitCell(layout.cells, p.x, p.y)
    if (cell < 0) return
    e.preventDefault()
    settle()
    const { photo, adjust: a } = spec.cells[cell]
    setAdjust(photo.id, { zoom: clamp(a.zoom * Math.exp(-e.deltaY * 0.0015), 1, MAX_ZOOM) })
  }
  useEffect(() => {
    const el = wrap.current!
    const handler = (e: WheelEvent) => wheelRef.current(e)
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const active = spec && activeCell !== null ? spec.cells[activeCell] : undefined
  const deselect = () => {
    setActiveCell(null)
    setActiveText(null)
  }

  // Thứ tự DOM cố định theo id ảnh: khi trộn / đổi chỗ, React chỉ đổi style chứ không dời node,
  // nhờ vậy transition chạy được và ảnh trượt sang ô mới thay vì nhảy cóc.
  const order = useMemo(
    () => (spec ? spec.cells.map((_, i) => i).sort((a, b) => (spec.cells[a].photo.id < spec.cells[b].photo.id ? -1 : 1)) : []),
    [spec],
  )

  /** Khung ô và khung toàn bộ ảnh (kể cả phần bị ô che) theo px màn hình. */
  const frames = (i: number) => {
    const rect = layout!.cells[i]
    const cell = spec!.cells[i]
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

  const liveCell = spec && live ? spec.cells.findIndex((c) => c.photo.id === live.id) : -1
  const busy = dragging !== null || liveTree !== null || live !== null
  const hoverCell = !busy && hover !== null && hover !== activeCell && spec?.cells[hover] && layout?.cells[hover] ? hover : null
  const activeIndex = active && layout?.cells[activeCell!] ? activeCell! : null

  return (
    // isolate: các lớp z-index của khung ghép chỉ so với nhau, không trèo lên menu của thanh tiêu đề.
    <div className="relative isolate flex h-full min-h-0 flex-col overflow-hidden stage-bg">
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
        </div>
        {spec && (
          <div className="pointer-events-auto flex gap-1.5 lg:gap-2">
            <Button
              onClick={shuffle}
              disabled={selected.length < 2}
              aria-label="Trộn ảnh"
              title="Trộn vị trí ảnh"
              className="h-9 px-3 text-[13px]"
            >
              <Shuffle className="size-4" />
              <span className="hidden xl:inline">Trộn ảnh</span>
            </Button>
            <Button
              onClick={randomLayout}
              aria-label="Bố cục ngẫu nhiên"
              title="Đổi bố cục ngẫu nhiên"
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
          'relative mt-14 grid min-h-0 flex-1 place-items-center',
          // Chỉ chừa chỗ cho thanh công cụ ảnh khi nó đang hiện, để khung ghép được to nhất có thể trên mobile.
          active ? 'mb-16' : 'mb-3 lg:mb-12',
        )}
        onPointerDown={(e) => e.target === e.currentTarget && deselect()}
      >
        {!spec || !layout ? (
          <EmptyStage />
        ) : (
          <div
            ref={stage}
            // absolute: kích thước khung không được ảnh hưởng ngược lại vùng chứa (tránh vòng lặp đo ↔ vẽ).
            className={cx('absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 touch-none select-none', glide && 'glide')}
            style={{ width: size.width * k, height: size.height * k }}
          >
            <div
              className="absolute inset-0 overflow-hidden shadow-lift"
              style={{ background: spec.bg }}
              onPointerDown={(e) => e.target === e.currentTarget && deselect()}
            >
              {order.map((i) => {
                const rect = layout.cells[i]
                const cell = spec.cells[i]
                if (!rect) return null
                const placed = placeImage(cell.photo.width, cell.photo.height, rect.w * k, rect.h * k, cell.adjust)
                return (
                  <div
                    key={cell.photo.id}
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
                      src={fileUrl(cell.photo.id)}
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
                    {swapTarget === i && (
                      <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-coral/25 shadow-[inset_0_0_0_4px_var(--color-coral)]" />
                    )}
                  </div>
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
                    onCommit={setTree}
                  />
                ))}
              {spec.texts.map((item) => (
                <TextLayer
                  key={item.id}
                  item={item}
                  px={(Math.min(size.width, size.height) * item.size * k) / 100}
                  width={size.width}
                  height={size.height}
                  k={k}
                  active={activeText === item.id}
                  onGuides={setGuides}
                />
              ))}
            </div>

            {/* Lớp phủ: không bị cắt theo khung, nên vẽ được phần ảnh tràn ra ngoài ô và các tay nắm. */}
            <div className="pointer-events-none absolute inset-0 z-20">
              {liveCell >= 0 &&
                layout.cells[liveCell] &&
                (() => {
                  const f = frames(liveCell)
                  return (
                    <>
                      {/* Phần ảnh nằm ngoài ô hiện mờ để thấy mình đang cắt tới đâu. */}
                      <div className="absolute overflow-visible" style={{ left: f.box.left, top: f.box.top }}>
                        <img
                          ref={ghostEl}
                          src={fileUrl(f.cell.photo.id)}
                          alt=""
                          draggable={false}
                          className="absolute left-0 top-0 max-w-none opacity-35 will-change-transform"
                          style={imageStyle(f.placed, f.cell.adjust)}
                        />
                      </div>
                      <span ref={boundsEl} className="absolute outline-[1.5px] outline-dashed outline-coral" style={f.image} />
                      <span
                        className="absolute shadow-[0_0_0_2px_var(--color-coral)]"
                        style={{ ...f.box, borderRadius: f.radius }}
                      />
                    </>
                  )
                })()}

              {hoverCell !== null &&
                (() => {
                  const f = frames(hoverCell)
                  return (
                    <>
                      {f.overflows && <span className="absolute outline-[1.5px] outline-dashed outline-coral/80" style={f.image} />}
                      <span
                        className="absolute shadow-[0_0_0_2px_var(--color-coral)]"
                        style={{ ...f.box, borderRadius: f.radius }}
                      />
                    </>
                  )
                })()}

              {/* Giữ nguyên trong lúc kéo tay nắm góc (tay nắm đang giữ con trỏ); chỉ ẩn khi kéo ảnh. */}
              {activeIndex !== null &&
                dragging === null &&
                (() => {
                  const f = frames(activeIndex)
                  const sides = adjacentDividers(f.rect, layout.dividers)
                  const corner = 'pointer-events-auto absolute grid size-7 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center'
                  const dot = 'size-3 rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.4)] ring-2 ring-coral transition-transform group-hover:scale-125'
                  const pill = 'absolute rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.4)] ring-2 ring-coral -translate-x-1/2 -translate-y-1/2'
                  return (
                    <div className={cx('absolute', glide && 'glide')} style={f.box}>
                      {!live && f.overflows && (
                        <span
                          className="absolute outline-[1.5px] outline-dashed outline-coral/80"
                          style={{ left: f.placed.left, top: f.placed.top, width: f.placed.dw, height: f.placed.dh }}
                        />
                      )}
                      <span
                        className="absolute inset-0 shadow-[0_0_0_2.5px_var(--color-coral)]"
                        style={{ borderRadius: f.radius }}
                      />
                      {/* Cạnh nào kéo được để đổi kích thước ô thì có tay nắm dẹt (thao tác kéo do đường chia bên dưới xử lý). */}
                      {sides.left && <span className={cx(pill, 'h-6 w-1.5')} style={{ left: 0, top: '50%' }} />}
                      {sides.right && <span className={cx(pill, 'h-6 w-1.5')} style={{ left: '100%', top: '50%' }} />}
                      {sides.top && <span className={cx(pill, 'h-1.5 w-6')} style={{ left: '50%', top: 0 }} />}
                      {sides.bottom && <span className={cx(pill, 'h-1.5 w-6')} style={{ left: '50%', top: '100%' }} />}
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
                          title="Kéo để phóng to / thu nhỏ ảnh"
                          className={cx(corner, cursor, 'group')}
                          style={{ left, top }}
                          onPointerDown={(e) => onZoomDown(e, activeIndex)}
                          onPointerMove={onZoomMove}
                          onPointerUp={onZoomUp}
                          onPointerCancel={onZoomUp}
                        >
                          <span className={dot} />
                        </span>
                      ))}
                      {!live && Math.min(f.box.width, f.box.height) > 90 && (
                        <span
                          className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 animate-pop place-items-center rounded-full bg-black/55 text-white"
                          title="Kéo để di chuyển ảnh trong ô"
                        >
                          <Move className="size-4" />
                        </span>
                      )}
                    </div>
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
          src={thumbUrl(spec.cells[dragging].photo.id)}
          alt=""
          className="pointer-events-none fixed z-50 size-20 -translate-x-1/2 -translate-y-1/2 animate-pop rounded-2xl object-cover shadow-lift ring-2 ring-white"
          style={{ left: swapPos.current.x, top: swapPos.current.y }}
        />
      )}

      {active ? (
        <div className="absolute inset-x-0 bottom-2.5 z-30 flex justify-center px-2.5">
          <div className="flex w-full max-w-md animate-pop items-center gap-0.5 rounded-full bg-card py-1.5 pl-4 pr-1.5 shadow-lift">
            <ZoomIn className="mr-1.5 size-4 shrink-0 text-muted" />
            <input
              type="range"
              aria-label="Phóng to ảnh"
              className="mr-1.5 min-w-0"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={active.adjust.zoom}
              style={{ '--fill': `${((active.adjust.zoom - 1) / (MAX_ZOOM - 1)) * 100}%` } as CSSProperties}
              onChange={(e) => {
                settle()
                setAdjust(active.photo.id, { zoom: Number(e.target.value) })
              }}
            />
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
      ) : (
        spec && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 hidden text-center text-xs text-muted lg:block">
            Kéo ảnh để căn khung · thả sang ô khác để đổi chỗ · cuộn để zoom · kéo đường viền để đổi kích thước ô
          </p>
        )
      )}
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

function TextLayer({
  item,
  px,
  width,
  height,
  k,
  active,
  onGuides,
}: {
  item: TextItem
  px: number
  /** Kích thước khung xuất (px ảnh). */
  width: number
  height: number
  k: number
  active: boolean
  onGuides: (guides: Guide[]) => void
}) {
  const start = useRef<{ x: number; y: number; itemX: number; itemY: number } | null>(null)
  // Vị trí trong lúc kéo giữ cục bộ, thả tay mới ghi vào store.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const { updateText, setActiveText } = useStore.getState()
  const shadow = textShadow(px)
  const x = pos?.x ?? item.x
  const y = pos?.y ?? item.y
  const end = () => {
    if (start.current && pos) updateText(item.id, pos)
    start.current = null
    setPos(null)
    onGuides([])
  }
  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { x: e.clientX, y: e.clientY, itemX: item.x, itemY: item.y }
        setActiveText(item.id)
      }}
      onPointerMove={(e) => {
        const s = start.current
        if (!s) return
        let nx = clamp(s.itemX + (e.clientX - s.x) / (width * k), 0, 1)
        let ny = clamp(s.itemY + (e.clientY - s.y) / (height * k), 0, 1)
        const guides: Guide[] = []
        if (Math.abs(nx - 0.5) * width * k < SNAP) {
          nx = 0.5
          guides.push({ dir: 'v', pos: width / 2, from: 0, to: height })
        }
        if (Math.abs(ny - 0.5) * height * k < SNAP) {
          ny = 0.5
          guides.push({ dir: 'h', pos: height / 2, from: 0, to: width })
        }
        flushSync(() => {
          onGuides(guides)
          setPos({ x: nx, y: ny })
        })
      }}
      onPointerUp={end}
      onPointerCancel={end}
      className={cx(
        'absolute z-20 cursor-move whitespace-pre text-center',
        active && 'outline-2 outline-dashed outline-offset-4 outline-coral',
      )}
      style={{
        left: x * width * k,
        top: y * height * k,
        transform: 'translate(-50%, -50%)',
        fontFamily: fontFamily(item.font),
        fontWeight: fontWeight(item.bold),
        fontSize: px,
        lineHeight: LINE_HEIGHT,
        color: item.color,
        textShadow: item.shadow ? `0 ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}` : undefined,
      }}
    >
      {item.text || ' '}
    </div>
  )
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

function EmptyStage() {
  return (
    <div className="mx-6 max-w-sm animate-rise text-center">
      <div className="mx-auto grid w-20 -rotate-3 grid-cols-3 grid-rows-3 gap-1.5 rounded-2xl bg-white p-1.5 shadow-lift aspect-[4/5] dark:bg-surface lg:w-40">
        <div className="col-span-2 row-span-2 rounded-xl gradient-brand" />
        <div className="rounded-xl bg-[#3f6bff]" />
        <div className="rounded-xl bg-[#f4a8c6]" />
        <div className="rounded-xl bg-line" />
        <div className="col-span-2 rounded-xl bg-[#b9a6ff]" />
      </div>
      <h2 className="mt-5 font-display text-lg font-bold lg:mt-8 lg:text-2xl">Chọn ảnh để bắt đầu ghép</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-soft lg:text-sm">
        Bấm vào các ảnh trong thư viện, Grido sẽ tự xếp bố cục.
      </p>
    </div>
  )
}
