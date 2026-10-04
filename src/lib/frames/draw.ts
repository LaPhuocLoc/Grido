import type { FrameGeometry } from './geometry'
import type { FrameInfo } from './info'
import { frameLines, type FrameBlock, type FrameLine, type FrameTemplate } from './templates'
import { wordmark } from './wordmark'

/** Khung thông số đã dàn xong cho một ảnh: đủ để vẽ, cả ở bản xem trước lẫn file xuất. */
export interface FrameSpec extends Pick<FrameGeometry, 'photo' | 'pad' | 'card' | 'text' | 'unit'> {
  template: FrameTemplate
  info: FrameInfo
  /** Màu chữ người dùng chọn; null = tự động theo mẫu và màu khung. */
  ink: string | null
}

const FAMILY = { sans: '"Be Vietnam Pro", sans-serif', serif: '"Lora", serif' }
const FONTS = ['500', '600', '700', '800', 'italic 800'].map((w) => `${w} 16px ${FAMILY.sans}`).concat(`700 16px ${FAMILY.serif}`)
/** Chiều cao một dòng, theo cỡ chữ. */
const LINE = 1.45
/** Khoảng hở giữa các cụm chữ trên một dải, theo đơn vị của mẫu. */
const GAP = 1.6
/** Nền ảnh mờ được phóng rộng hơn file xuất chừng này để mép mờ không lộ vào trong. */
export const BACKDROP_OVERSCAN = 1.3
/** Bóng của tấm nền, theo đơn vị của mẫu: lệch xuống, độ nhoè. */
export const CARD_SHADOW = { y: 1, blur: 4, color: 'rgba(0, 0, 0, 0.45)' }

/** Chữ đen trên khung sáng, trắng trên khung tối. */
function inkOn(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg)
  if (!m) return '#111111'
  const n = parseInt(m[1], 16)
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150 ? '#111111' : '#ffffff'
}

/** Font chữ của khung đóng kèm app nhưng chỉ tải khi được dùng; phải chờ xong, nếu không canvas vẽ bằng font dự phòng. */
export async function loadFrameFonts(info?: FrameInfo): Promise<void> {
  // Chữ có dấu (ghi chú người dùng gõ) nằm ở phần font riêng, nên phải nói rõ sẽ vẽ những chữ nào.
  const text = `Shot on ${info ? Object.values(info).join(' ') : ''}`
  await Promise.all(FONTS.map((font) => document.fonts.load(font, text))).catch(() => undefined)
}

/** Một đoạn chữ sẵn sàng để vẽ: font, giãn cách, màu riêng (null = màu chữ của khung), bề rộng. */
interface Run {
  text: string
  font: string
  spacing: number
  color: string | null
  /** Phần trên của chữ này mang màu khác. */
  accent?: string
  w: number
}

interface Laid {
  runs: Run[]
  px: number
  w: number
  muted: boolean
  icon?: 'pin'
}

function measure(ctx: CanvasRenderingContext2D, line: FrameLine & { runs: { text: string; brand?: boolean }[] }, u: number, branded: boolean): Laid {
  const px = line.size * u
  const plain = { font: `${line.weight} ${px}px ${FAMILY.sans}`, spacing: px * (line.spacing ?? 0), color: null }
  const runs: Omit<Run, 'w'>[] = []
  for (const part of line.runs) {
    const mark = part.brand ? wordmark(part.text) : null
    if (!mark) {
      runs.push({ ...plain, text: part.text })
      continue
    }
    const style = {
      font: `${mark.italic ? 'italic ' : ''}${mark.weight} ${px}px ${FAMILY[mark.family]}`,
      spacing: px * mark.spacing,
      color: branded ? (mark.color ?? null) : null,
    }
    const at = mark.accent?.at ?? -1
    if (at < 0 || at >= part.text.length) runs.push({ ...style, text: part.text })
    else {
      if (at > 0) runs.push({ ...style, text: part.text.slice(0, at) })
      runs.push({ ...style, text: part.text[at], accent: mark.accent!.color })
      if (at + 1 < part.text.length) runs.push({ ...style, text: part.text.slice(at + 1) })
    }
  }
  const measured = runs.map((run) => {
    ctx.font = run.font
    ctx.letterSpacing = `${run.spacing}px`
    return { ...run, w: ctx.measureText(run.text).width }
  })
  const icon = line.icon ? px * 1.1 : 0
  return { runs: measured, px, w: icon + measured.reduce((sum, r) => sum + r.w, 0), muted: !!line.muted, icon: line.icon }
}

/** Ghim địa điểm: giọt nước úp ngược có lỗ tròn ở giữa, cao chừng một chữ hoa. */
function pin(ctx: CanvasRenderingContext2D, x: number, y: number, px: number) {
  const r = px * 0.27
  const cy = y - px * 0.1
  ctx.beginPath()
  ctx.arc(x + r, cy, r, Math.PI * 0.85, Math.PI * 0.15)
  ctx.lineTo(x + r, cy + r * 2.1)
  ctx.closePath()
  ctx.moveTo(x + r + r * 0.38, cy)
  ctx.arc(x + r, cy, r * 0.38, 0, Math.PI * 2, true)
  ctx.fill('evenodd')
}

function write(ctx: CanvasRenderingContext2D, line: Laid, x: number, y: number, align: 'left' | 'center' | 'right', ink: string) {
  let at = align === 'left' ? x : align === 'center' ? x - line.w / 2 : x - line.w
  const alpha = ctx.globalAlpha
  if (line.muted) ctx.globalAlpha = alpha * 0.58
  ctx.textAlign = 'left'
  ctx.fillStyle = ink
  if (line.icon) {
    pin(ctx, at, y, line.px)
    at += line.px * 1.1
  }
  for (const run of line.runs) {
    ctx.font = run.font
    ctx.letterSpacing = `${run.spacing}px`
    ctx.fillStyle = run.color ?? ink
    ctx.fillText(run.text, at, y)
    if (run.accent) {
      // Tô lại nửa trên của chữ bằng màu nhấn, cắt theo một đường chéo như chữ I của FUJIFILM.
      const m = ctx.measureText(run.text)
      const top = y - m.actualBoundingBoxAscent
      const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
      const w = run.w - run.spacing
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(at - 1, top - 1)
      ctx.lineTo(at + w + 1, top - 1)
      ctx.lineTo(at + w + 1, top + h * 0.3)
      ctx.lineTo(at - 1, top + h * 0.5)
      ctx.closePath()
      ctx.clip()
      ctx.fillStyle = run.accent
      ctx.fillText(run.text, at, y)
      ctx.restore()
    }
    at += run.w
  }
  ctx.globalAlpha = alpha
}

/** Một cụm chữ đã đo: các dòng, chữ lớn đứng trước (nếu có), bề rộng và chiều cao cả cụm. */
function lay(ctx: CanvasRenderingContext2D, block: FrameBlock, info: FrameInfo, u: number, branded: boolean) {
  const lines = frameLines(block.lines, info).map((l) => measure(ctx, l, u, branded))
  const mark = block.mark ? (frameLines([block.mark], info).map((l) => measure(ctx, l, u, branded))[0] ?? null) : null
  const column = Math.max(0, ...lines.map((l) => l.w))
  const stack = lines.reduce((sum, l) => sum + l.px * LINE, 0)
  return {
    at: block.at,
    lines,
    mark,
    column,
    stack,
    w: mark ? mark.w + (lines.length ? 2 * GAP * u + column : 0) : column,
    h: Math.max(stack, mark ? mark.px * LINE : 0),
  }
}

/** Vẽ các dòng chồng lên nhau, cả chồng nằm giữa quanh `mid`. */
function stackLines(ctx: CanvasRenderingContext2D, lines: Laid[], x: number, mid: number, align: 'left' | 'center' | 'right', ink: string) {
  let y = mid - lines.reduce((sum, l) => sum + l.px * LINE, 0) / 2
  for (const line of lines) {
    write(ctx, line, x, y + (line.px * LINE) / 2, align, ink)
    y += line.px * LINE
  }
}

/** Số ngẫu nhiên có hạt giống: hạt phim phải rơi đúng những chỗ đó ở bản xem trước lẫn file xuất. */
function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Mép phim: vệt loá sáng ở góc trên trái và hạt li ti, chỉ vẽ trên phần lề (không đụng vào ảnh). */
function filmTexture(ctx: CanvasRenderingContext2D, frame: FrameSpec, w: number, h: number, k: number) {
  const { photo } = frame
  const u = frame.unit * k
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.rect(photo.x * k, photo.y * k, photo.w * k, photo.h * k)
  ctx.clip('evenodd')
  const leak = ctx.createLinearGradient(0, 0, w * 0.3, 0)
  leak.addColorStop(0, 'rgba(255, 246, 224, 0.95)')
  leak.addColorStop(0.2, 'rgba(255, 170, 90, 0.75)')
  leak.addColorStop(0.55, 'rgba(206, 60, 120, 0.5)')
  leak.addColorStop(1, 'rgba(206, 60, 120, 0)')
  ctx.fillStyle = leak
  ctx.fillRect(0, 0, w * 0.3, photo.y * k)
  const side = ctx.createLinearGradient(0, 0, 0, h * 0.3)
  side.addColorStop(0, 'rgba(255, 246, 224, 0.9)')
  side.addColorStop(1, 'rgba(160, 190, 255, 0)')
  ctx.fillStyle = side
  ctx.fillRect(0, 0, photo.x * k, h * 0.3)
  const random = seeded(7)
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 2600; i++) {
    const x = random() * w
    const y = random() * h
    const size = (0.05 + random() * 0.1) * u
    ctx.globalAlpha = 0.03 + random() * 0.08
    ctx.fillRect(x, y, size, size)
  }
  ctx.restore()
}

/** Mẫu có lớp nằm dưới ảnh (nền ảnh mờ, tấm nền) hay không. */
export const hasBackdrop = (frame: FrameSpec) => !!frame.template.backdrop || !!frame.card

/**
 * Lớp nằm dưới ảnh của file xuất: nền là chính ảnh đó làm mờ, rồi tấm nền ôm quanh ảnh. `photo`: ảnh đúng như trong ô
 * (đã cắt, xoay). Bản xem trước dựng lớp này bằng CSS (`FrameBackdrop`) với cùng các số đo.
 */
export function drawBackdrop(ctx: CanvasRenderingContext2D, frame: FrameSpec, canvas: { width: number; height: number; bg: string }, photo: CanvasImageSource | null) {
  const { backdrop } = frame.template
  const { width, height } = canvas
  if (backdrop && photo) {
    // Làm mờ trên một bản thu nhỏ rồi kéo giãn ra: nhanh hơn làm mờ cả file hàng chục megapixel nhiều lần, mà hình mờ thì như nhau.
    const f = Math.min(1, 720 / Math.max(width, height))
    const small = document.createElement('canvas')
    small.width = Math.max(1, Math.round(width * f))
    small.height = Math.max(1, Math.round(height * f))
    const sctx = small.getContext('2d')!
    const s = Math.max(width / frame.photo.w, height / frame.photo.h) * BACKDROP_OVERSCAN * f
    const w = frame.photo.w * s
    const h = frame.photo.h * s
    sctx.filter = `blur(${backdrop.blur * frame.unit * f}px)`
    sctx.drawImage(photo, (small.width - w) / 2, (small.height - h) / 2, w, h)
    ctx.save()
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(small, 0, 0, width, height)
    ctx.fillStyle = backdrop.tint
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
    small.width = small.height = 0
  }
  if (frame.card) {
    ctx.save()
    if (frame.template.card?.shadow) {
      ctx.shadowColor = CARD_SHADOW.color
      ctx.shadowBlur = CARD_SHADOW.blur * frame.unit
      ctx.shadowOffsetY = CARD_SHADOW.y * frame.unit
    }
    ctx.fillStyle = canvas.bg
    ctx.fillRect(frame.card.x, frame.card.y, frame.card.w, frame.card.h)
    ctx.restore()
  }
}

/**
 * Vẽ lớp nằm trên ảnh của khung thông số: hoạ tiết ở phần lề và chữ. `canvas`: cỡ và màu nền của file xuất; `k`: số px
 * canvas trên mỗi px file xuất (1 khi xuất, nhỏ hơn ở bản xem trước) nên hai nơi luôn ra cùng một hình.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, frame: FrameSpec, canvas: { width: number; height: number; bg: string }, k = 1) {
  const { template, info, photo, text } = frame
  if (template.texture === 'film') filmTexture(ctx, frame, canvas.width * k, canvas.height * k, k)
  const inset = (template.inset ?? 0) * frame.unit * k
  const left = text.left * k + inset
  const right = text.right * k - inset
  // Người dùng đã tự chọn màu chữ thì tên hãng cũng theo màu đó; màu riêng của hãng chỉ dùng khi để tự động.
  const branded = frame.ink === null && !template.ink
  ctx.save()
  ctx.textBaseline = 'middle'

  for (const band of ['top', 'bottom'] as const) {
    const blocks = template.blocks.filter((b) => b.at !== 'over' && (b.band ?? 'bottom') === band)
    if (!blocks.length) continue
    const mid = ((text[band][0] + text[band][1]) / 2) * k
    // Chữ dài quá (tên ống kính trên ảnh dọc) thì thu cả dải lại cho vừa, không để các cụm đè nhau.
    const fitted = (u: number) => blocks.map((b) => lay(ctx, b, info, u, branded)).filter((b) => b.w > 0)
    let u = frame.unit * k
    let laid = fitted(u)
    const width = (at: FrameBlock['at']) => laid.find((b) => b.at === at)?.w ?? 0
    const [l, c, r] = [width('left'), width('center'), width('right')]
    const needed = c ? c + (l || r ? 2 * (Math.max(l, r) + GAP * u) : 0) : l + r + (l && r ? 2 * GAP * u : 0)
    if (needed > right - left && needed > 0) {
      u *= (right - left) / needed
      laid = fitted(u)
    }
    const ink = frame.ink ?? template.ink ?? inkOn(canvas.bg)
    for (const b of laid) {
      if (b.at === 'left') stackLines(ctx, b.lines, left, mid, 'left', ink)
      else if (b.at === 'center') stackLines(ctx, b.lines, (left + right) / 2, mid, 'center', ink)
      else if (!b.mark) stackLines(ctx, b.lines, right, mid, 'right', ink)
      else if (!b.lines.length) write(ctx, b.mark, right, mid, 'right', ink)
      else {
        // Tên hãng | các dòng thông số, cả cụm sát mép phải.
        const x = right - b.column
        stackLines(ctx, b.lines, x, mid, 'left', ink)
        const rule = Math.max(1, 0.1 * u)
        ctx.fillStyle = ink
        ctx.globalAlpha = 0.22
        ctx.fillRect(x - GAP * u - rule / 2, mid - (b.h * 0.8) / 2, rule, b.h * 0.8)
        ctx.globalAlpha = 1
        write(ctx, b.mark, x - 2 * GAP * u, mid, 'right', ink)
      }
    }
  }

  // Chữ in đè lên đáy ảnh: trắng có bóng tối (hoặc đen có quầng sáng nếu người dùng chọn chữ đen) để đọc được trên mọi ảnh.
  for (const block of template.blocks.filter((b) => b.at === 'over')) {
    let v = frame.unit * k
    let over = lay(ctx, block, info, v, false)
    const room = photo.w * k - 4 * v
    if (over.w > room && over.w > 0) {
      v *= room / over.w
      over = lay(ctx, block, info, v, false)
    }
    const ink = frame.ink ?? '#ffffff'
    ctx.shadowColor = ink === '#ffffff' ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.6)'
    ctx.shadowBlur = 0.6 * v
    ctx.shadowOffsetY = ink === '#ffffff' ? 0.12 * v : 0
    stackLines(ctx, over.lines, (photo.x + photo.w / 2) * k, (photo.y + photo.h) * k - 3 * v - over.stack / 2, 'center', ink)
  }
  ctx.restore()
}
