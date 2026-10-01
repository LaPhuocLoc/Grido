import { Bold, Copy, Italic, Minus, Plus, RotateCw, Strikethrough, TextAlignCenter, TextAlignEnd, TextAlignStart, Trash2, Underline } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { clamp } from '../lib/geometry'
import {
  DECORATION,
  fontFamily,
  fontInfo,
  fontWeight,
  LINE_HEIGHT,
  MAX_TEXT_SIZE,
  MIN_TEXT_SIZE,
  snapAngle,
  TEXT_COLORS,
  textShadow,
  type TextAlign,
  type TextItem,
} from '../lib/text'
import { useStore } from '../store'
import type { Guide } from './Stage'
import { cx, IconButton } from './ui'

/** Khoảng (px màn hình) mà chữ tự hít vào giữa khung. */
const SNAP = 6
/** Nút xoay nằm cách mép dưới hộp chữ bấy nhiêu px. */
const ROTATE_GAP = 30

/** Những trường thay đổi trong lúc kéo; giữ cục bộ, thả tay mới ghi vào store thành một bước undo. */
type Live = Partial<Pick<TextItem, 'x' | 'y' | 'size' | 'width' | 'rotation'>>

const round = (v: number, digits: number) => Number(v.toFixed(digits))

/**
 * Một dòng chữ trên khung ghép. Bấm một lần để chọn (hiện khung + tay nắm + nút nhân bản / xoá),
 * bấm lần nữa hoặc bấm đúp để gõ thẳng trên ảnh.
 */
export function TextLayer({
  item: stored,
  width,
  height,
  k,
  active,
  editing,
  overlay,
  onGuides,
}: {
  item: TextItem
  /** Kích thước khung xuất (px ảnh). */
  width: number
  height: number
  k: number
  active: boolean
  editing: boolean
  /** Lớp phủ không bị cắt theo khung, để vẽ khung chọn và tay nắm. */
  overlay: HTMLElement | null
  onGuides: (guides: Guide[]) => void
}) {
  const { updateText, removeText, duplicateText, setActiveText, setEditingText } = useStore.getState()
  const el = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<Live | null>(null)
  const liveRef = useRef<Live | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const item = live ? { ...stored, ...live } : stored
  const px = (Math.min(width, height) * item.size * k) / 100
  const shadow = textShadow(px)

  const push = (next: Live, guides: Guide[] = []) => {
    liveRef.current = next
    flushSync(() => {
      onGuides(guides)
      setLive(next)
    })
  }
  const commit = () => {
    const l = liveRef.current
    liveRef.current = null
    if (l) updateText(stored.id, l)
    setLive(null)
    onGuides([])
  }

  // Khung chọn bám theo kích thước thật của khối chữ (đổi khi gõ, đổi font, font tải xong…).
  useLayoutEffect(() => {
    const node = el.current
    if (!active || !node) return
    const read = () => setBox({ w: node.offsetWidth, h: node.offsetHeight })
    read()
    const observer = new ResizeObserver(read)
    observer.observe(node)
    return () => observer.disconnect()
  }, [active])

  // Vào chế độ gõ: bôi sẵn toàn bộ chữ. Thoát (bấm ra ngoài, Esc, chọn thứ khác): ghi nội dung vào store.
  const id = stored.id
  useLayoutEffect(() => {
    const node = el.current
    if (!editing || !node) return
    node.focus()
    getSelection()?.selectAllChildren(node)
    return () => {
      const text = (node.textContent ?? '').replace(/\n+$/, '')
      getSelection()?.removeAllRanges()
      const current = useStore.getState().texts.find((t) => t.id === id)
      if (!current) return
      // Trình duyệt có thể đã tách / gộp node trong lúc gõ → đưa DOM về đúng một node chữ như React vẫn nghĩ.
      node.textContent = text || ' '
      if (!text.trim()) removeText(id)
      else if (text !== current.text) updateText(id, { text })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, id])

  const drag = useRef<{ x: number; y: number; itemX: number; itemY: number; wasActive: boolean; moved: boolean } | null>(null)
  const endDrag = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) commit()
    // Bấm vào dòng chữ đang chọn (kể cả cú thứ hai của bấm đúp) → gõ trực tiếp.
    else if (d.wasActive) setEditingText(stored.id)
  }

  /** Tâm khối chữ theo toạ độ cửa sổ. */
  const center = () => {
    const r = overlay!.getBoundingClientRect()
    return { x: r.left + stored.x * width * k, y: r.top + stored.y * height * k }
  }
  const move = useRef<((e: ReactPointerEvent) => Live) | null>(null)
  /** Gắn thao tác kéo cho một tay nắm: `begin` nhận sự kiện bắt đầu và trả về hàm tính giá trị mới theo vị trí con trỏ. */
  const grip = (begin: (e: ReactPointerEvent) => (e: ReactPointerEvent) => Live) => ({
    // Không để tay nắm cướp focus, nếu không đang gõ dở sẽ bị thoát chế độ gõ.
    onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      move.current = begin(e)
    },
    onPointerMove: (e: ReactPointerEvent) => move.current && push(move.current(e)),
    onPointerUp: () => {
      move.current = null
      commit()
    },
    onPointerCancel: () => {
      move.current = null
      commit()
    },
  })

  const scale = grip((e) => {
    const c = center()
    const d0 = Math.max(8, Math.hypot(e.clientX - c.x, e.clientY - c.y))
    return (e) => {
      const size = clamp((stored.size * Math.hypot(e.clientX - c.x, e.clientY - c.y)) / d0, MIN_TEXT_SIZE, MAX_TEXT_SIZE)
      return { size: round(size, 2), width: stored.width === null ? null : round((stored.width * size) / stored.size, 4) }
    }
  })
  /** Kéo cạnh trái / phải: đổi bề rộng hộp, cạnh đối diện đứng yên. side = 1 là cạnh phải. */
  const resize = (side: 1 | -1) =>
    grip((e) => {
      const p0 = { x: e.clientX, y: e.clientY }
      const w0 = el.current!.offsetWidth
      const rad = (stored.rotation * Math.PI) / 180
      const u = { x: Math.cos(rad), y: Math.sin(rad) }
      return (e) => {
        const along = ((e.clientX - p0.x) * u.x + (e.clientY - p0.y) * u.y) * side
        const w = Math.max(px, w0 + along)
        const shift = ((w - w0) / 2) * side
        return {
          width: round(w / (width * k), 4),
          x: round(stored.x + (shift * u.x) / (width * k), 4),
          y: round(stored.y + (shift * u.y) / (height * k), 4),
        }
      }
    })
  const rotate = grip(() => {
    const c = center()
    // Nút xoay nằm phía dưới hộp, tức ở hướng 90° khi chữ chưa xoay.
    return (e) => ({ rotation: snapAngle((Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180) / Math.PI - 90) })
  })

  const cxPx = item.x * width * k
  const cyPx = item.y * height * k
  const rad = (item.rotation * Math.PI) / 180
  // Nửa chiều cao của hình chữ nhật bao quanh hộp chữ đã xoay — để đặt nút nhân bản / xoá ngay phía trên.
  const halfH = (Math.abs(box.w * Math.sin(rad)) + Math.abs(box.h * Math.cos(rad))) / 2
  const barAbove = cyPx - halfH - 60 > -52
  const dot =
    'pointer-events-auto absolute size-3.5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.4)] ring-2 ring-coral transition-transform hover:scale-125'
  const pill =
    'pointer-events-auto absolute h-6 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.4)] ring-2 ring-coral'

  return (
    <>
      <div
        ref={el}
        contentEditable={editing ? 'plaintext-only' : undefined}
        suppressContentEditableWarning
        spellCheck={false}
        role={editing ? 'textbox' : undefined}
        aria-label={editing ? 'Nội dung chữ' : undefined}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (editing || e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, itemX: stored.x, itemY: stored.y, wasActive: active, moved: false }
          if (!active) setActiveText(stored.id)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return
          d.moved = true
          let nx = clamp(d.itemX + (e.clientX - d.x) / (width * k), 0, 1)
          let ny = clamp(d.itemY + (e.clientY - d.y) / (height * k), 0, 1)
          const guides: Guide[] = []
          if (Math.abs(nx - 0.5) * width * k < SNAP) {
            nx = 0.5
            guides.push({ dir: 'v', pos: width / 2, from: 0, to: height })
          }
          if (Math.abs(ny - 0.5) * height * k < SNAP) {
            ny = 0.5
            guides.push({ dir: 'h', pos: height / 2, from: 0, to: width })
          }
          push({ x: nx, y: ny }, guides)
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onBlur={() => useStore.getState().editingText === stored.id && setEditingText(null)}
        onKeyDown={(e) => {
          if (!editing) return
          // Phím gõ không được lọt ra phím tắt toàn cục (Delete xoá dòng chữ, Esc bỏ chọn…).
          e.stopPropagation()
          const key = e.key.toLowerCase()
          if (e.key === 'Escape') setEditingText(null)
          else if ((e.ctrlKey || e.metaKey) && (key === 'b' || key === 'i' || key === 'u')) {
            e.preventDefault()
            toggleStyle(stored.id, key)
          }
        }}
        className={cx('absolute z-20 outline-none', editing ? 'cursor-text select-text' : 'cursor-default')}
        style={{
          left: cxPx,
          top: cyPx,
          transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
          width: item.width === null ? undefined : item.width * width * k,
          minWidth: '0.5em',
          minHeight: `${LINE_HEIGHT}em`,
          whiteSpace: item.width === null ? 'pre' : 'pre-wrap',
          overflowWrap: 'break-word',
          textAlign: item.align,
          fontFamily: fontFamily(item.font),
          fontWeight: fontWeight(item.bold),
          fontStyle: item.italic ? 'italic' : undefined,
          fontSize: px,
          lineHeight: LINE_HEIGHT,
          color: item.color,
          caretColor: item.color,
          textDecorationLine: [item.underline && 'underline', item.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
          textDecorationThickness: `${DECORATION.thickness}em`,
          textUnderlineOffset: `${DECORATION.underline}em`,
          textDecorationSkipInk: 'none',
          textShadow: item.shadow ? `0 ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}` : undefined,
        }}
      >
        {stored.text || ' '}
      </div>

      {active &&
        overlay &&
        box.w > 0 &&
        createPortal(
          <>
            <div
              className="pointer-events-none absolute"
              style={{ left: cxPx, top: cyPx, width: box.w + 8, height: box.h + 8, transform: `translate(-50%, -50%) rotate(${item.rotation}deg)` }}
            >
              <span className="absolute inset-0 rounded-[3px] shadow-[0_0_0_2px_var(--color-coral)]" />
              {(
                [
                  ['0%', '0%'],
                  ['100%', '0%'],
                  ['0%', '100%'],
                  ['100%', '100%'],
                ] as const
              ).map(([left, top]) => (
                <span
                  key={left + top}
                  title="Kéo để phóng to / thu nhỏ chữ"
                  className={cx(dot, (left === top) === (Math.abs(item.rotation) % 180 < 45 || Math.abs(item.rotation) % 180 > 135) ? 'cursor-nwse-resize' : 'cursor-nesw-resize')}
                  style={{ left, top }}
                  {...scale}
                />
              ))}
              <span
                title="Kéo để đổi bề rộng hộp chữ · bấm đúp để hộp ôm vừa chữ"
                className={pill}
                style={{ left: 0, top: '50%' }}
                onDoubleClick={() => updateText(stored.id, { width: null })}
                {...resize(-1)}
              />
              <span
                title="Kéo để đổi bề rộng hộp chữ · bấm đúp để hộp ôm vừa chữ"
                className={pill}
                style={{ left: '100%', top: '50%' }}
                onDoubleClick={() => updateText(stored.id, { width: null })}
                {...resize(1)}
              />
              <span
                title="Kéo để xoay chữ"
                className="pointer-events-auto absolute left-1/2 grid size-7 -translate-x-1/2 cursor-grab touch-none place-items-center rounded-full bg-white text-[#2b2622] shadow-[0_1px_6px_rgb(0_0_0/0.35)] ring-1 ring-black/10 active:cursor-grabbing"
                style={{ top: `calc(100% + ${ROTATE_GAP - 14}px)` }}
                {...rotate}
              >
                <RotateCw className="size-3.5" />
              </span>
              {live?.rotation !== undefined && (
                <span
                  className="absolute left-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white"
                  style={{ top: `calc(100% + ${ROTATE_GAP + 22}px)`, transform: `translateX(-50%) rotate(${-item.rotation}deg)` }}
                >
                  {item.rotation}°
                </span>
              )}
            </div>

            {/* Chỉ hiện khi đang chọn mà chưa gõ; đang gõ hoặc đang kéo thì ẩn cho đỡ vướng. */}
            {!editing && !live && (
              <div
                className="pointer-events-auto absolute flex animate-pop rounded-full bg-card p-0.5 shadow-lift ring-1 ring-black/5"
                style={{
                  left: cxPx,
                  top: barAbove ? cyPx - halfH - 18 : cyPx + halfH + ROTATE_GAP + 34,
                  transform: `translate(-50%, ${barAbove ? '-100%' : '0'})`,
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <IconButton label="Nhân bản (Ctrl+D)" onClick={() => duplicateText(stored.id)}>
                  <Copy className="size-4" />
                </IconButton>
                <IconButton label="Xoá (Delete)" onClick={() => removeText(stored.id)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            )}
          </>,
          overlay,
        )}
    </>
  )
}

/** Bật / tắt đậm, nghiêng, gạch chân — dùng chung cho phím tắt Ctrl+B / I / U. */
export function toggleStyle(id: string, key: string) {
  const { texts, updateText } = useStore.getState()
  const item = texts.find((t) => t.id === id)
  if (!item) return
  if (key === 'b') updateText(id, { bold: !item.bold })
  else if (key === 'i') updateText(id, { italic: !item.italic })
  else if (key === 'u') updateText(id, { underline: !item.underline })
}

const ALIGN: { value: TextAlign; label: string; icon: ReactNode }[] = [
  { value: 'left', label: 'Căn trái', icon: <TextAlignStart className="size-4.5" /> },
  { value: 'center', label: 'Căn giữa', icon: <TextAlignCenter className="size-4.5" /> },
  { value: 'right', label: 'Căn phải', icon: <TextAlignEnd className="size-4.5" /> },
]

function Toggle({ label, on, onClick, children }: { label: string; on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <IconButton label={label} aria-pressed={on} onClick={onClick} className={cx('shrink-0', on && 'bg-blush !text-coral-dark')}>
      {children}
    </IconButton>
  )
}

/** Thanh công cụ ở đáy khung ghép cho dòng chữ đang chọn. `unit`: số px ảnh xuất ứng với 1% cỡ chữ. */
export function TextToolbar({ item, unit }: { item: TextItem; unit: number }) {
  const { updateText } = useStore.getState()
  const set = (patch: Partial<TextItem>) => updateText(item.id, patch)
  const [colors, setColors] = useState(false)
  const palette = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!colors) return
    const close = (e: PointerEvent) => !palette.current?.contains(e.target as Node) && setColors(false)
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [colors])

  const resize = (delta: number) => set({ size: clamp(round(item.size + delta, 2), MIN_TEXT_SIZE, MAX_TEXT_SIZE) })
  const align = ALIGN.find((a) => a.value === item.align) ?? ALIGN[1]
  const divider = <span className="mx-1 h-5 w-px shrink-0 bg-line" />

  return (
    <div
      className="absolute inset-x-0 bottom-2.5 z-30 flex justify-center px-2.5"
      // Bấm nút trên thanh này không được lấy focus khỏi dòng chữ đang gõ dở.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div role="toolbar" aria-label="Định dạng chữ" className="flex max-w-full animate-pop items-center gap-0.5 rounded-full bg-card p-1.5 shadow-lift">
        <button
          type="button"
          title="Đổi font ở bảng bên phải"
          onClick={() => useStore.setState({ tab: 'text' })}
          className="h-9 max-w-32 shrink truncate rounded-full px-3 text-[13px] font-semibold text-ink hover:bg-sand"
        >
          {fontInfo(item.font).label}
        </button>
        {divider}
        <IconButton label="Giảm cỡ chữ" className="shrink-0" disabled={item.size <= MIN_TEXT_SIZE} onClick={() => resize(-0.5)}>
          <Minus className="size-4" />
        </IconButton>
        <span className="w-9 shrink-0 text-center text-[13px] font-semibold tabular-nums text-ink" title="Cỡ chữ (px trên ảnh xuất)">
          {Math.round(item.size * unit)}
        </span>
        <IconButton label="Tăng cỡ chữ" className="shrink-0" disabled={item.size >= MAX_TEXT_SIZE} onClick={() => resize(0.5)}>
          <Plus className="size-4" />
        </IconButton>
        {divider}
        <div ref={palette} className="relative shrink-0">
          <IconButton label="Màu chữ" aria-expanded={colors} onClick={() => setColors(!colors)}>
            <span className="grid justify-items-center gap-0.5">
              <span className="text-[15px] font-bold leading-none text-ink">A</span>
              <span className="h-1 w-4 rounded-full ring-1 ring-black/15" style={{ background: item.color }} />
            </span>
          </IconButton>
          {colors && (
            <div className="absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2 animate-pop items-center gap-2 rounded-full bg-card p-2 shadow-lift ring-1 ring-black/5">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Màu chữ ${color}`}
                  aria-pressed={item.color === color}
                  onClick={() => set({ color })}
                  className={cx(
                    'size-7 shrink-0 rounded-full border border-black/10 transition-transform hover:scale-110',
                    item.color === color && 'ring-2 ring-coral ring-offset-2 ring-offset-card',
                  )}
                  style={{ background: color }}
                />
              ))}
              <label
                className="relative grid size-7 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/10"
                style={{ background: 'conic-gradient(#f2603c, #ffb23e, #8fe0a8, #6aa8ff, #c58bff, #f2603c)' }}
                title="Chọn màu khác"
              >
                <input
                  type="color"
                  aria-label="Chọn màu chữ khác"
                  value={item.color}
                  onChange={(e) => set({ color: e.target.value })}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </label>
            </div>
          )}
        </div>
        <Toggle label="Chữ đậm (Ctrl+B)" on={item.bold} onClick={() => set({ bold: !item.bold })}>
          <Bold className="size-4.5" />
        </Toggle>
        <Toggle label="Chữ nghiêng (Ctrl+I)" on={item.italic} onClick={() => set({ italic: !item.italic })}>
          <Italic className="size-4.5" />
        </Toggle>
        <Toggle label="Gạch chân (Ctrl+U)" on={item.underline} onClick={() => set({ underline: !item.underline })}>
          <Underline className="size-4.5" />
        </Toggle>
        <Toggle label="Gạch ngang" on={item.strike} onClick={() => set({ strike: !item.strike })}>
          <Strikethrough className="size-4.5" />
        </Toggle>
        {divider}
        <IconButton
          label={`${align.label} · bấm để đổi`}
          className="shrink-0"
          onClick={() => set({ align: ALIGN[(ALIGN.indexOf(align) + 1) % ALIGN.length].value })}
        >
          {align.icon}
        </IconButton>
        <Toggle label="Đổ bóng" on={item.shadow} onClick={() => set({ shadow: !item.shadow })}>
          <span className="text-[15px] font-bold leading-none [text-shadow:2px_2px_0_rgb(0_0_0/0.3)]">A</span>
        </Toggle>
      </div>
    </div>
  )
}
