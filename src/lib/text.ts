import { VN_FONTS, type VnFontGroup } from './fonts.generated'

/** Chữ chèn lên ảnh ghép. Vị trí và cỡ chữ lưu theo tỉ lệ khung nên không phụ thuộc độ phân giải xuất. */
export interface TextItem {
  id: string
  text: string
  /** Tâm khối chữ, 0..1 theo chiều rộng / cao khung. */
  x: number
  y: number
  /** Cỡ chữ theo % cạnh ngắn của khung. */
  size: number
  color: string
  font: FontId
  bold: boolean
  shadow: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  align: TextAlign
  /** Góc xoay quanh tâm, tính bằng độ, chiều kim đồng hồ. */
  rotation: number
  /**
   * Bề rộng hộp chữ theo tỉ lệ chiều rộng khung (chữ tự xuống dòng); null = hộp ôm vừa nội dung.
   * Văn bản dọc: đây là chiều cao hộp (chữ tự sang cột mới), vẫn tính theo chiều rộng khung.
   */
  width: number | null
  /** Giãn cách chữ, tính bằng phần nghìn cỡ chữ (0 = mặc định của font). */
  spacing: number
  /** Khoảng cách dòng, theo bội số cỡ chữ. */
  lineHeight: number
  /**
   * Mép nào của hộp chữ đứng yên khi hộp cao lên / thấp đi (gõ thêm dòng, đổi khoảng cách dòng, đổi cỡ…).
   * Văn bản dọc: hộp nở theo chiều ngang, cột xếp từ phải sang trái → 'top' là mép phải, 'bottom' là mép trái.
   */
  anchor: TextAnchor
  /** Độ đậm nhạt của chữ, 0..100 (100 = không trong suốt). */
  opacity: number
  /** Văn bản dọc: chữ đứng thẳng, xếp từ trên xuống; các cột nối nhau từ phải sang trái. */
  vertical: boolean
  /** Hiệu ứng chữ; null = tắt. Mọi số đo tính theo % cỡ chữ nên không phụ thuộc độ phân giải xuất. */
  outline: TextOutline | null
  block: TextBlock | null
  glow: TextGlow | null
  gradient: TextGradient | null
  plate: TextPlate | null
  /** Các dòng chữ cùng `group` dính thành một nhóm: kéo, phóng, xoay cùng nhau. */
  group: string | null
}

/** Viền ngoài chữ. */
export interface TextOutline {
  color: string
  width: number
}
/** Khối nổi: bóng cứng kéo liền từ chữ tới độ lệch (x, y). */
export interface TextBlock {
  color: string
  x: number
  y: number
}
/** Phát sáng quanh chữ; `size` là độ toả. */
export interface TextGlow {
  color: string
  size: number
}
/** Chuyển màu từ `color` của chữ sang màu này. Góc theo quy ước CSS: 180 = trên xuống dưới, 90 = trái sang phải. */
export interface TextGradient {
  color: string
  angle: number
}
/** Nền bo góc sau hộp chữ; `pad` là lề quanh chữ. */
export interface TextPlate {
  color: string
  pad: number
  radius: number
}

export const OUTLINE_RANGE = { min: 1, max: 25, step: 0.5 }
export const BLOCK_RANGE = { min: 1, max: 30, step: 0.5 }
export const GLOW_RANGE = { min: 4, max: 60, step: 1 }
export const PLATE_PAD_RANGE = { min: 0, max: 80, step: 1 }
export const PLATE_RADIUS_RANGE = { min: 0, max: 100, step: 1 }

/** Dòng chữ có hiệu ứng mà CSS không vẽ khớp canvas được: preview của nó được vẽ bằng chính `drawText`. */
export const hasEffects = (item: TextItem) => !!(item.outline || item.block || item.glow || item.gradient || item.plate)

/** Hiệu ứng vươn ra ngoài hộp chữ tối đa bao nhiêu px (để canvas xem trước chừa đủ lề). */
export function effectBleed(item: TextItem, px: number): number {
  const outline = item.outline?.width ?? 0
  const reach = Math.max(
    outline,
    item.block ? Math.hypot(item.block.x, item.block.y) + outline : 0,
    item.glow ? item.glow.size * 2.5 + outline : 0,
    item.plate?.pad ?? 0,
    item.shadow ? 60 : 0,
  )
  // Nét chữ viết tay hay vươn ra ngoài ô chữ của nó, nên luôn chừa thêm.
  return Math.ceil(px * (0.75 + reach / 100)) + 2
}

export type TextAlign = 'left' | 'center' | 'right'
export type TextAnchor = 'top' | 'middle' | 'bottom'

export const MIN_TEXT_SIZE = 1
export const MAX_TEXT_SIZE = 60
export const SPACING_RANGE = { min: -100, max: 500, step: 5 }
export const LINE_HEIGHT_RANGE = { min: 0.6, max: 2.5, step: 0.05 }
/** Khoảng cách dòng mặc định. */
export const LINE_HEIGHT = 1.25

const TEXT_DEFAULTS: Omit<TextItem, 'id'> = {
  text: '',
  x: 0.5,
  y: 0.5,
  size: 8,
  color: '#ffffff',
  font: 'round',
  bold: true,
  shadow: true,
  italic: false,
  underline: false,
  strike: false,
  align: 'center',
  rotation: 0,
  width: null,
  spacing: 0,
  lineHeight: LINE_HEIGHT,
  anchor: 'middle',
  opacity: 100,
  vertical: false,
  outline: null,
  block: null,
  glow: null,
  gradient: null,
  plate: null,
  group: null,
}

/** Bản nháp lưu từ phiên bản cũ thiếu các trường kiểu chữ mới → bù giá trị mặc định. */
export const normalizeText = (raw: Partial<TextItem> & { id: string }): TextItem => ({ ...TEXT_DEFAULTS, ...raw })

/**
 * Chia chữ thành các dòng như CSS `white-space: pre-wrap; overflow-wrap: break-word`:
 * xuống dòng tại khoảng trắng, từ nào dài hơn cả hộp thì cắt giữa từ. `maxWidth` null = chỉ ngắt ở chỗ người dùng Enter.
 */
export function wrapLines(text: string, maxWidth: number | null, measure: (s: string) => number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    if (maxWidth === null || measure(paragraph) <= maxWidth) {
      out.push(paragraph)
      continue
    }
    let line = ''
    // Mỗi phần gồm một từ kèm khoảng trắng theo sau; khoảng trắng cuối dòng không tính vào bề rộng (như CSS).
    for (const token of paragraph.match(/\S+\s*|\s+/g) ?? []) {
      if (measure((line + token).trimEnd()) <= maxWidth) {
        line += token
        continue
      }
      if (line) out.push(line.trimEnd())
      line = ''
      if (measure(token.trimEnd()) <= maxWidth) {
        line = token
        continue
      }
      for (const { segment } of new Intl.Segmenter().segment(token)) {
        if (line && measure((line + segment).trimEnd()) > maxWidth) {
          out.push(line)
          line = ''
        }
        line += segment
      }
    }
    out.push(line.trimEnd())
  }
  return out
}

/** Mép trái của một dòng so với tâm hộp chữ. */
export const lineStart = (align: TextAlign, boxWidth: number, lineWidth: number) =>
  align === 'left' ? -boxWidth / 2 : align === 'right' ? boxWidth / 2 - lineWidth : -lineWidth / 2

/**
 * Hộp chữ vừa cao thêm `deltaH` (px khung xuất): tâm hộp phải dời bao nhiêu để mép được neo đứng yên.
 * Neo giữa thì hộp nở đều hai phía nên tâm không đổi. Văn bản dọc: `deltaH` là phần hộp rộng thêm, hộp nở sang trái.
 */
export function anchorShift(anchor: TextAnchor, deltaH: number, rotation: number, vertical = false): { dx: number; dy: number } {
  const half = anchor === 'top' ? deltaH / 2 : anchor === 'bottom' ? -deltaH / 2 : 0
  const rad = (rotation * Math.PI) / 180
  // Dời theo hướng hộp nở ra, tính trên trục của chính hộp chữ (đã xoay). `|| 0` để không trả về -0.
  if (vertical) return { dx: -Math.cos(rad) * half || 0, dy: -Math.sin(rad) * half || 0 }
  return { dx: -Math.sin(rad) * half || 0, dy: Math.cos(rad) * half || 0 }
}

/**
 * CSS dàn chữ của một khối chữ ở cỡ `px`, hộp dài `wrap` px theo chiều chữ chạy (null = ôm vừa nội dung).
 * Preview và bước đo lúc xuất văn bản dọc dùng chung hàm này nên chữ xuống dòng / sang cột giống hệt nhau.
 */
export function textLayoutStyle(item: TextItem, px: number, wrap: number | null, font: FontId = item.font) {
  const size = wrap === null ? undefined : `${wrap}px`
  return {
    width: item.vertical ? undefined : size,
    height: item.vertical ? size : undefined,
    minWidth: item.vertical ? `${item.lineHeight}em` : '0.5em',
    minHeight: item.vertical ? '0.5em' : `${item.lineHeight}em`,
    writingMode: item.vertical ? ('vertical-rl' as const) : ('horizontal-tb' as const),
    // Chữ Latin cũng đứng thẳng từng chữ một, không nằm nghiêng 90° (muốn nghiêng thì đã có nút xoay).
    textOrientation: item.vertical ? ('upright' as const) : undefined,
    whiteSpace: wrap === null ? ('pre' as const) : ('pre-wrap' as const),
    overflowWrap: 'break-word' as const,
    // Văn bản dọc: 'left' là đầu dòng, tức mép trên.
    textAlign: item.align,
    fontFamily: fontFamily(font),
    fontWeight: fontWeight(item.bold),
    fontStyle: item.italic ? 'italic' : undefined,
    fontSize: `${px}px`,
    lineHeight: String(item.lineHeight),
    letterSpacing: `${item.spacing / 1000}em`,
  }
}

/** Góc (độ) trong khoảng -180..180, hít vào bội số của 45° khi lại gần. */
export function snapAngle(deg: number, threshold = 4): number {
  const near = Math.round(deg / 45) * 45
  const snapped = Math.abs(near - deg) <= threshold ? near : Math.round(deg)
  const wrapped = ((((snapped + 180) % 360) + 360) % 360) - 180
  return wrapped === -180 ? 180 : wrapped
}

export type FontId = string
export type FontGroup = VnFontGroup
/** Ngôn ngữ mà một font vẽ được đầy đủ (ngoài chữ Latin cơ bản). */
export type FontLang = 'vi' | 'ko' | 'ja'

export interface FontInfo {
  id: FontId
  label: string
  family: string
  group: FontGroup
  /** Font của máy không biết trước nên để trống. */
  langs: FontLang[]
  /** Ảnh minh hoạ font đang được dùng trong thiết kế thật; 4 font cơ bản không có. */
  thumb?: string
}

export const FONT_GROUPS: { id: FontGroup; label: string }[] = [
  { id: 'sans', label: 'Không chân' },
  { id: 'serif', label: 'Có chân' },
  { id: 'script', label: 'Viết tay' },
  { id: 'display', label: 'Trang trí' },
]

/** Thứ tự hiển thị; người dùng chủ yếu là người Việt nên tên ngôn ngữ viết bằng tiếng Việt. */
export const FONT_LANGS: { id: FontLang; label: string }[] = [
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'ko', label: 'Tiếng Hàn' },
  { id: 'ja', label: 'Tiếng Nhật' },
]

const FALLBACK: Record<FontGroup, string> = { sans: 'sans-serif', serif: 'serif', script: 'cursive', display: 'sans-serif' }
const VI: FontLang[] = ['vi']

// Mọi font hiện có đều đủ dấu tiếng Việt. 4 font đầu đi kèm app từ trước; phần còn lại là bộ font Việt hoá (scripts/build-fonts.py).
export const FONTS: FontInfo[] = [
  { id: 'sans', label: 'Hiện đại', family: '"Be Vietnam Pro", sans-serif', group: 'sans', langs: VI },
  { id: 'round', label: 'Mềm mại', family: '"Quicksand", sans-serif', group: 'sans', langs: VI },
  { id: 'serif', label: 'Cổ điển', family: '"Lora", serif', group: 'serif', langs: VI },
  { id: 'script', label: 'Viết tay', family: '"Dancing Script", cursive', group: 'script', langs: VI },
  ...VN_FONTS.map(({ lang, ...f }) => ({ ...f, family: `"${f.id}", ${FALLBACK[f.group]}`, langs: lang === 'vi' ? VI : [lang], thumb: `/fonts/thumbs/${f.id}.webp` })),
]

const BY_ID = new Map(FONTS.map((f) => [f.id, f]))

export const TEXT_COLORS = [
  '#ffffff',
  '#000000',
  '#2b2622',
  '#8a8f98',
  '#f2603c',
  '#e5306c',
  '#ffb23e',
  '#ffe14d',
  '#8fe0a8',
  '#4f8a7a',
  '#25c2f4',
  '#3f6bff',
  '#9a4cf2',
  '#c58bff',
  '#f7c7b8',
  '#f1e4d3',
]

/** Font cài sẵn trên máy người dùng (không đi kèm app) có id dạng "sys:<tên họ font>". */
const SYSTEM_PREFIX = 'sys:'
export const isSystemFont = (id: FontId) => id.startsWith(SYSTEM_PREFIX)
export const systemFont = (family: string): FontInfo => ({
  id: SYSTEM_PREFIX + family,
  label: family,
  // Máy khác không có font này thì rơi về font không chân mặc định.
  family: `"${family.replace(/["\\]/g, '')}", sans-serif`,
  group: 'sans',
  langs: [],
})

export const fontInfo = (id: FontId) => BY_ID.get(id) ?? (isSystemFont(id) ? systemFont(id.slice(SYSTEM_PREFIX.length)) : FONTS[0])
export const fontFamily = (id: FontId) => fontInfo(id).family
export const fontWeight = (bold: boolean) => (bold ? 700 : 500)

/** Bóng chữ, tính theo cỡ chữ (px) — dùng cùng công thức cho CSS và canvas. */
export const textShadow = (px: number) => ({ offsetY: px * 0.04, blur: px * 0.18, color: 'rgba(0, 0, 0, 0.45)' })

/** Nét gạch chân / gạch ngang theo cỡ chữ (em) — dùng chung cho CSS và canvas để preview khớp ảnh xuất. */
export const DECORATION = { thickness: 0.07, underline: 0.12, strike: 0.3 }

/**
 * Vẽ một khối chữ lên canvas, tâm hộp tại (cx, cy), khớp với cách CSS dàn dòng ở preview.
 * `wrapWidth`: bề rộng hộp (px) khi chữ tự xuống dòng; null = hộp ôm vừa dòng dài nhất.
 */
export async function drawText(
  ctx: CanvasRenderingContext2D,
  item: TextItem,
  cx: number,
  cy: number,
  px: number,
  wrapWidth: number | null = null,
) {
  await loadTextFont(item, px)
  drawTextNow(ctx, item, cx, cy, px, wrapWidth)
}

/**
 * Font web chỉ tải khi được dùng; phải chờ xong, nếu không canvas sẽ vẽ bằng font dự phòng.
 * Tải hỏng (bản web mất mạng giữa chừng) thì dừng hẳn: thà báo lỗi còn hơn xuất ra ảnh sai font.
 */
export async function loadTextFont(item: TextItem, px: number) {
  await document.fonts.load(canvasFont(item, px), item.text).catch(() => {
    throw new Error(`Chưa tải được phông chữ "${fontInfo(item.font).label}". Kiểm tra kết nối mạng rồi xuất lại nhé.`)
  })
}

/** Như `drawText` nhưng vẽ ngay, cho nơi đã chắc font tải xong (canvas xem trước vẽ lại theo từng khung hình). */
export function drawTextNow(ctx: CanvasRenderingContext2D, item: TextItem, cx: number, cy: number, px: number, wrapWidth: number | null = null) {
  if (!hasEffects(item) || item.opacity >= 100) return paintText(ctx, item, cx, cy, px, wrapWidth)
  // Các lượt vẽ hiệu ứng chồng lên nhau: vẽ đặc ra một lớp riêng rồi mới làm mờ cả lớp, để lượt dưới không lộ qua lượt trên.
  const layer = scratch(ctx)
  const lctx = layer.getContext('2d')!
  lctx.setTransform(ctx.getTransform())
  paintText(lctx, { ...item, opacity: 100 }, cx, cy, px, wrapWidth)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha *= item.opacity / 100
  ctx.drawImage(layer, 0, 0)
  ctx.restore()
}

/** Hình dạng đã dàn của một khối chữ quanh gốc toạ độ (tâm hộp): kích thước hộp và hàm vẽ nét chữ kèm gạch chân / gạch ngang. */
interface Shape {
  w: number
  h: number
  /** Vẽ toàn bộ nét chữ lên `c` bằng fillStyle (hoặc strokeStyle khi `stroke`) hiện tại của nó. */
  draw: (c: CanvasRenderingContext2D, stroke: boolean) => void
}

const canvasFont = (item: TextItem, px: number) => `${item.italic ? 'italic ' : ''}${fontWeight(item.bold)} ${px}px ${fontFamily(item.font)}`

/** Đặt font, giãn cách, nét viền… cho một context sắp vẽ `item` ở cỡ `px`. */
function prepare(c: CanvasRenderingContext2D, item: TextItem, px: number) {
  c.font = canvasFont(item, px)
  // Phải đặt trước khi đo chữ để bề rộng dòng tính cả giãn cách, như CSS letter-spacing.
  c.letterSpacing = `${(px * item.spacing) / 1000}px`
  c.textAlign = 'left'
  c.textBaseline = 'alphabetic'
  if (item.outline) {
    // Nét viền nằm giữa mép chữ: vẽ dày gấp đôi rồi để phần chữ đè lên nửa trong.
    c.lineWidth = (px * item.outline.width * 2) / 100
    c.lineJoin = 'round'
  }
}

/** Kích thước hộp chữ (px) khi vẽ ở cỡ `px`; font phải tải xong trước. */
export function measureTextBox(ctx: CanvasRenderingContext2D, item: TextItem, px: number, wrapWidth: number | null = null): { w: number; h: number } {
  ctx.save()
  prepare(ctx, item, px)
  const { w, h } = item.vertical ? verticalShape(ctx, item, px, wrapWidth) : horizontalShape(ctx, item, px, wrapWidth)
  ctx.restore()
  return { w, h }
}

/** Canvas tạm cùng cỡ với canvas đang vẽ. */
function scratch(ctx: CanvasRenderingContext2D) {
  const canvas = document.createElement('canvas')
  canvas.width = ctx.canvas.width
  canvas.height = ctx.canvas.height
  return canvas
}

function paintText(ctx: CanvasRenderingContext2D, item: TextItem, cx: number, cy: number, px: number, wrapWidth: number | null) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((item.rotation * Math.PI) / 180)
  prepare(ctx, item, px)
  ctx.globalAlpha *= item.opacity / 100
  const shape = item.vertical ? verticalShape(ctx, item, px, wrapWidth) : horizontalShape(ctx, item, px, wrapWidth)
  const unit = px / 100

  /** Chỉ để lại bóng của nét chữ (kể cả viền): đẩy nét vẽ ra ngoài canvas và kéo bóng ngược lại đúng bấy nhiêu. */
  const cast = (color: string, blur: number, offsetY = 0) => {
    const away = ctx.canvas.width + ctx.canvas.height + px * 4
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = blur
    ctx.shadowOffsetX = away
    ctx.shadowOffsetY = offsetY
    ctx.fillStyle = ctx.strokeStyle = '#000'
    if (!item.outline) {
      ctx.setTransform(new DOMMatrix().translate(-away, 0).multiply(ctx.getTransform()))
      shape.draw(ctx, false)
    } else {
      // Viền và chữ đè lên nhau: gộp thành một hình trước, nếu không chỗ đè đổ bóng hai lần.
      const layer = scratch(ctx)
      const lctx = layer.getContext('2d')!
      lctx.setTransform(ctx.getTransform())
      prepare(lctx, item, px)
      shape.draw(lctx, true)
      shape.draw(lctx, false)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(layer, -away, 0)
    }
    ctx.restore()
  }
  /** Nét chữ kèm viền, tô một màu. */
  const solid = (color: string) => {
    ctx.fillStyle = ctx.strokeStyle = color
    if (item.outline) shape.draw(ctx, true)
    shape.draw(ctx, false)
  }

  if (item.plate) {
    const pad = item.plate.pad * unit
    ctx.fillStyle = item.plate.color
    ctx.beginPath()
    ctx.roundRect(-shape.w / 2 - pad, -shape.h / 2 - pad, shape.w + pad * 2, shape.h + pad * 2, Math.min(item.plate.radius * unit, shape.w / 2 + pad, shape.h / 2 + pad))
    ctx.fill()
  }
  if (item.shadow) {
    const s = textShadow(px)
    cast(s.color, s.blur, s.offsetY)
  }
  if (item.glow) {
    // Hai lượt: một lượt toả rộng, một lượt sát chữ cho quầng sáng có lõi.
    cast(item.glow.color, item.glow.size * unit)
    cast(item.glow.color, (item.glow.size * unit) / 2.5)
  }
  if (item.block) {
    const dx = item.block.x * unit
    const dy = item.block.y * unit
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))))
    for (let i = steps; i >= 1; i--) {
      ctx.save()
      ctx.translate((dx * i) / steps, (dy * i) / steps)
      solid(item.block.color)
      ctx.restore()
    }
  }
  if (item.outline) {
    ctx.strokeStyle = item.outline.color
    shape.draw(ctx, true)
  }
  ctx.fillStyle = item.gradient ? gradientFill(ctx, item.color, item.gradient, shape.w, shape.h) : item.color
  shape.draw(ctx, false)
  ctx.restore()
}

/** Dải chuyển màu phủ vừa hộp chữ w × h (tâm ở gốc toạ độ), hướng theo quy ước góc của CSS linear-gradient. */
function gradientFill(ctx: CanvasRenderingContext2D, from: string, gradient: TextGradient, w: number, h: number) {
  const rad = (gradient.angle * Math.PI) / 180
  const half = (Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))) / 2
  const fill = ctx.createLinearGradient(-Math.sin(rad) * half, Math.cos(rad) * half, Math.sin(rad) * half, -Math.cos(rad) * half)
  fill.addColorStop(0, from)
  fill.addColorStop(1, gradient.color)
  return fill
}

const put = (c: CanvasRenderingContext2D, stroke: boolean, text: string, x: number, y: number) => (stroke ? c.strokeText(text, x, y) : c.fillText(text, x, y))
const bar = (c: CanvasRenderingContext2D, stroke: boolean, x: number, y: number, w: number, h: number) => (stroke ? c.strokeRect(x, y, w, h) : c.fillRect(x, y, w, h))

/** Dàn chữ ngang. `ctx` đã có sẵn font và giãn cách. */
function horizontalShape(ctx: CanvasRenderingContext2D, item: TextItem, px: number, wrapWidth: number | null): Shape {
  const measure = (s: string) => ctx.measureText(s).width
  const lines = wrapLines(item.text, wrapWidth, measure)
  const widths = lines.map(measure)
  const boxWidth = wrapWidth ?? Math.max(...widths)
  const lineHeight = px * item.lineHeight
  const m = ctx.measureText('Hg')
  // CSS đặt vùng chữ (ascent + descent) vào giữa dòng → suy ra vị trí baseline tương ứng.
  const baselineShift = (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2
  const top = -(lines.length * lineHeight) / 2
  const thickness = px * DECORATION.thickness
  return {
    w: boxWidth,
    h: lines.length * lineHeight,
    draw: (c, stroke) =>
      lines.forEach((line, i) => {
        const x = lineStart(item.align, boxWidth, widths[i])
        const baseline = top + i * lineHeight + lineHeight / 2 + baselineShift
        put(c, stroke, line, x, baseline)
        if (item.underline) bar(c, stroke, x, baseline + px * DECORATION.underline, widths[i], thickness)
        if (item.strike) bar(c, stroke, x, baseline - px * DECORATION.strike - thickness / 2, widths[i], thickness)
      }),
  }
}

/** Ký tự mà font CJK thay bằng dạng xoay 90° khi viết dọc (dấu trường âm, ngoặc, gạch nối, ba chấm). */
const SIDEWAYS = /[ー〜～－—―…‥（）［］｛｝「」『』【】〈〉《》〔〕]/
/** Dấu chấm, phẩy CJK: viết dọc thì nằm ở góc trên bên phải ô chữ thay vì góc dưới bên trái. */
const CORNER = /[、。，．]/

/** Font hệ thống mà trình duyệt hay mượn cho chữ Hán, kana, Hangul… khi font đang chọn không có (thứ tự ưu tiên của Chromium). */
const FALLBACK_FAMILIES = [
  'Meiryo',
  'Yu Gothic',
  'MS Gothic',
  'Microsoft YaHei',
  'Microsoft JhengHei',
  'SimSun',
  'Malgun Gothic',
  'Hiragino Sans',
  'Hiragino Kaku Gothic ProN',
  'PingFang SC',
  'PingFang TC',
  'Apple SD Gothic Neo',
  'Noto Sans CJK JP',
  'Noto Sans CJK SC',
  'Noto Sans CJK KR',
]
const installed = new Map<string, boolean>()
const inkOf = (m: TextMetrics) =>
  [m.width, m.actualBoundingBoxAscent, m.actualBoundingBoxDescent, m.actualBoundingBoxLeft, m.actualBoundingBoxRight].map((v) => v.toFixed(2)).join()

/**
 * Chữ lấy từ font dự phòng được trình duyệt canh giữa theo số đo của chính font đó, nên nằm lệch khỏi tâm cột một chút.
 * Canvas không cho biết font nào đã được mượn → thử từng font hệ thống, font nào vẽ ra đúng nét chữ ấy thì lấy số đo của nó.
 * Trả về độ lệch ngang (px) so với tâm cột; 0 nếu chữ có sẵn trong font đang chọn hoặc không đoán được.
 */
function fallbackShift(ctx: CanvasRenderingContext2D, char: string, cache: Map<string, number>): number {
  if (char.codePointAt(0)! < 0x2000) return 0
  const known = cache.get(char)
  if (known !== undefined) return known
  const font = ctx.font
  const base = ctx.measureText(char)
  const ink = inkOf(base)
  const style = font.slice(0, font.search(/\d+(\.\d+)?px/))
  const size = /\d+(\.\d+)?px/.exec(font)![0]
  let shift = 0
  for (const family of FALLBACK_FAMILIES) {
    if (!installed.has(family)) {
      // Font không có trên máy thì chuỗi mẫu rộng đúng bằng khi chỉ dùng monospace.
      ctx.font = `16px "${family}", monospace`
      const withFamily = ctx.measureText('mmmmmmmmmlli').width
      ctx.font = '16px monospace'
      installed.set(family, withFamily !== ctx.measureText('mmmmmmmmmlli').width)
    }
    if (!installed.get(family)) continue
    ctx.font = `${style}${size} "${family}"`
    const m = ctx.measureText(char)
    if (inkOf(m) !== ink) continue
    shift = (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent - (base.fontBoundingBoxAscent - base.fontBoundingBoxDescent)) / 2
    break
  }
  ctx.font = font
  cache.set(char, shift)
  return shift
}

interface Glyph {
  char: string
  /** Tâm cột và mép trên của ô chữ, so với tâm hộp. */
  x: number
  top: number
  /** Chiều cao ô chữ (đã gồm giãn cách chữ). */
  advance: number
}

/**
 * Canvas không biết viết dọc, nên nhờ chính trình duyệt dàn chữ: dựng một khối ẩn với đúng CSS của preview
 * rồi đọc vị trí từng chữ. Nhờ vậy sang cột, căn lề, font dự phòng… khớp với những gì thấy trên màn hình.
 */
function measureVertical(item: TextItem, px: number, wrap: number | null): { glyphs: Glyph[]; w: number; h: number } {
  const host = document.createElement('div')
  Object.assign(host.style, textLayoutStyle(item, px, wrap), { position: 'fixed', left: '0', top: '0', visibility: 'hidden', pointerEvents: 'none' })
  host.textContent = item.text
  document.body.append(host)
  const box = host.getBoundingClientRect()
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const node = host.firstChild
  const range = document.createRange()
  const glyphs: Glyph[] = []
  // Các cột rộng đúng bằng khoảng cách dòng và xếp từ mép phải sang; chữ nằm giữa cột. Lấy tâm cột theo cách này chứ không
  // theo ô của từng chữ, vì ô của chữ lấy từ font dự phòng (chữ Hán, kana…) không cân quanh tâm cột.
  const pitch = px * item.lineHeight
  if (node)
    for (const { segment, index } of new Intl.Segmenter().segment(item.text)) {
      if (segment === '\n') continue
      range.setStart(node, index)
      range.setEnd(node, index + segment.length)
      const rect = [...range.getClientRects()].find((r) => r.height > 0 && r.width > 0)
      if (!rect) continue
      const column = Math.max(0, Math.floor((box.right - (rect.left + rect.width / 2)) / pitch))
      glyphs.push({ char: segment, x: box.right - (column + 0.5) * pitch - cx, top: rect.top - cy, advance: rect.height })
    }
  host.remove()
  return { glyphs, w: box.width, h: box.height }
}

/** Dàn chữ dọc quanh gốc toạ độ (tâm hộp chữ). `ctx` đã có sẵn font và giãn cách. */
function verticalShape(ctx: CanvasRenderingContext2D, item: TextItem, px: number, wrap: number | null): Shape {
  const { glyphs, w, h } = measureVertical(item, px, wrap)
  const spacing = (px * item.spacing) / 1000
  const m = ctx.measureText('Hg')
  const ascent = m.fontBoundingBoxAscent
  const descent = m.fontBoundingBoxDescent
  // Đường baseline khi đặt vùng chữ (ascent + descent) vào giữa một khoảng.
  const centred = (ascent - descent) / 2
  const thickness = px * DECORATION.thickness
  const shifts = new Map<string, number>()

  const draw = (c: CanvasRenderingContext2D, stroke: boolean) => {
    c.save()
    // Từng chữ được đặt riêng theo vị trí đã đo, giãn cách đã nằm trong đó.
    c.letterSpacing = '0px'
    for (const g of glyphs) {
      // Khoảng trắng không có nét để vẽ, nhưng vẫn chiếm chỗ trong cột nên gạch chân / gạch ngang chạy qua nó (như CSS).
      if (!g.char.trim()) continue
      const gw = c.measureText(g.char).width
      const cell = g.advance - spacing
      const x = g.x + fallbackShift(c, g.char, shifts)
      if (SIDEWAYS.test(g.char)) {
        c.save()
        c.translate(x, g.top + cell / 2)
        c.rotate(Math.PI / 2)
        put(c, stroke, g.char, -gw / 2, centred)
        c.restore()
        continue
      }
      // Font không có số đo cho viết dọc (hầu hết font Latin): ô chữ cao bằng ascent + descent, baseline cách mép trên một ascent.
      // Font CJK có số đo riêng: ô chữ vuông 1em, vùng chữ nằm giữa ô.
      const baseline = Math.abs(cell - (ascent + descent)) < Math.max(1.5, px * 0.04) ? ascent : cell / 2 + centred
      if (CORNER.test(g.char)) put(c, stroke, g.char, x - gw / 2 + cell * 0.56, g.top + baseline - cell * 0.56)
      else put(c, stroke, g.char, x - gw / 2, g.top + baseline)
    }
    if (item.underline || item.strike) {
      // Gạch chân / gạch ngang chạy dọc theo từng cột.
      const columns = new Map<number, { top: number; bottom: number }>()
      for (const g of glyphs) {
        const key = Math.round(g.x * 100) / 100
        const col = columns.get(key)
        // Tính cả giãn cách sau chữ cuối, như nét gạch của CSS.
        const end = g.top + g.advance
        if (col) {
          col.top = Math.min(col.top, g.top)
          col.bottom = Math.max(col.bottom, end)
        } else columns.set(key, { top: g.top, bottom: end })
      }
      for (const [x, col] of columns) {
        if (item.strike) bar(c, stroke, x - thickness / 2, col.top, thickness, col.bottom - col.top)
        // Chữ đứng thẳng trong cột dọc: trình duyệt kẻ gạch chân sát mép trái của cột, không cộng thêm khoảng hở như chữ ngang.
        if (item.underline) bar(c, stroke, x - (ascent + descent) / 2 - thickness, col.top, thickness, col.bottom - col.top)
      }
    }
    c.restore()
  }
  return { w, h, draw }
}
