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
}

export type TextAlign = 'left' | 'center' | 'right'

export const MIN_TEXT_SIZE = 1
export const MAX_TEXT_SIZE = 60

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

export const LINE_HEIGHT = 1.25
export const TEXT_COLORS = ['#ffffff', '#2b2622', '#f2603c', '#ffb23e', '#f7c7b8', '#4f8a7a']

export const fontInfo = (id: FontId) => BY_ID.get(id) ?? FONTS[0]
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
  const lineHeight = px * LINE_HEIGHT
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
