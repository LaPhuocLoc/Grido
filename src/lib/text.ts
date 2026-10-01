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
  /** Bề rộng hộp chữ theo tỉ lệ chiều rộng khung (chữ tự xuống dòng); null = hộp ôm vừa nội dung. */
  width: number | null
  /** Giãn cách chữ, tính bằng phần nghìn cỡ chữ (0 = mặc định của font). */
  spacing: number
  /** Khoảng cách dòng, theo bội số cỡ chữ. */
  lineHeight: number
  /** Mép nào của hộp chữ đứng yên khi hộp cao lên / thấp đi (gõ thêm dòng, đổi khoảng cách dòng, đổi cỡ…). */
  anchor: TextAnchor
  /** Độ đậm nhạt của chữ, 0..100 (100 = không trong suốt). */
  opacity: number
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
 * Neo giữa thì hộp nở đều hai phía nên tâm không đổi.
 */
export function anchorShift(anchor: TextAnchor, deltaH: number, rotation: number): { dx: number; dy: number } {
  const half = anchor === 'top' ? deltaH / 2 : anchor === 'bottom' ? -deltaH / 2 : 0
  const rad = (rotation * Math.PI) / 180
  // Dời dọc theo trục đứng của chính hộp chữ (đã xoay). `|| 0` để không trả về -0.
  return { dx: -Math.sin(rad) * half || 0, dy: Math.cos(rad) * half || 0 }
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

export interface FontInfo {
  id: FontId
  label: string
  family: string
  group: FontGroup
  /** Ảnh minh hoạ font đang được dùng trong thiết kế thật; 4 font cơ bản không có. */
  thumb?: string
}

export const FONT_GROUPS: { id: FontGroup; label: string }[] = [
  { id: 'sans', label: 'Không chân' },
  { id: 'serif', label: 'Có chân' },
  { id: 'script', label: 'Viết tay' },
  { id: 'display', label: 'Trang trí' },
]

const FALLBACK: Record<FontGroup, string> = { sans: 'sans-serif', serif: 'serif', script: 'cursive', display: 'sans-serif' }

// Mọi font đều có đủ dấu tiếng Việt. 4 font đầu đi kèm app từ trước; phần còn lại là bộ font Việt hoá (scripts/build-fonts.py).
export const FONTS: FontInfo[] = [
  { id: 'sans', label: 'Hiện đại', family: '"Be Vietnam Pro", sans-serif', group: 'sans' },
  { id: 'round', label: 'Mềm mại', family: '"Quicksand", sans-serif', group: 'sans' },
  { id: 'serif', label: 'Cổ điển', family: '"Lora", serif', group: 'serif' },
  { id: 'script', label: 'Viết tay', family: '"Dancing Script", cursive', group: 'script' },
  ...VN_FONTS.map((f) => ({ ...f, family: `"${f.id}", ${FALLBACK[f.group]}`, thumb: `/fonts/thumbs/${f.id}.webp` })),
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
  const font = `${item.italic ? 'italic ' : ''}${fontWeight(item.bold)} ${px}px ${fontFamily(item.font)}`
  // Font web chỉ tải khi được dùng; phải chờ xong, nếu không canvas sẽ vẽ bằng font dự phòng.
  await document.fonts.load(font, item.text).catch(() => {})
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((item.rotation * Math.PI) / 180)
  ctx.font = font
  // Phải đặt trước khi đo chữ để bề rộng dòng tính cả giãn cách, như CSS letter-spacing.
  ctx.letterSpacing = `${(px * item.spacing) / 1000}px`
  ctx.globalAlpha *= item.opacity / 100
  ctx.fillStyle = item.color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  if (item.shadow) {
    const s = textShadow(px)
    ctx.shadowColor = s.color
    ctx.shadowBlur = s.blur
    ctx.shadowOffsetY = s.offsetY
  }
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
  lines.forEach((line, i) => {
    const x = lineStart(item.align, boxWidth, widths[i])
    const baseline = top + i * lineHeight + lineHeight / 2 + baselineShift
    ctx.fillText(line, x, baseline)
    if (item.underline) ctx.fillRect(x, baseline + px * DECORATION.underline, widths[i], thickness)
    if (item.strike) ctx.fillRect(x, baseline - px * DECORATION.strike - thickness / 2, widths[i], thickness)
  })
  ctx.restore()
}
