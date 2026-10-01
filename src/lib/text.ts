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
}

export type FontId = 'sans' | 'round' | 'serif' | 'script'

// Cả 4 font đều có đủ dấu tiếng Việt.
export const FONTS: { id: FontId; label: string; family: string }[] = [
  { id: 'sans', label: 'Hiện đại', family: '"Be Vietnam Pro", sans-serif' },
  { id: 'round', label: 'Mềm mại', family: '"Quicksand", sans-serif' },
  { id: 'serif', label: 'Cổ điển', family: '"Lora", serif' },
  { id: 'script', label: 'Viết tay', family: '"Dancing Script", cursive' },
]

export const LINE_HEIGHT = 1.25
export const TEXT_COLORS = ['#ffffff', '#2b2622', '#f2603c', '#ffb23e', '#f7c7b8', '#4f8a7a']

export const fontFamily = (id: FontId) => (FONTS.find((f) => f.id === id) ?? FONTS[0]).family
export const fontWeight = (bold: boolean) => (bold ? 700 : 500)

/** Bóng chữ, tính theo cỡ chữ (px) — dùng cùng công thức cho CSS và canvas. */
export const textShadow = (px: number) => ({ offsetY: px * 0.04, blur: px * 0.18, color: 'rgba(0, 0, 0, 0.45)' })

/** Vẽ một khối chữ lên canvas, căn giữa tại (cx, cy), khớp với cách CSS dàn dòng ở preview. */
export async function drawText(ctx: CanvasRenderingContext2D, item: TextItem, cx: number, cy: number, px: number) {
  const font = `${fontWeight(item.bold)} ${px}px ${fontFamily(item.font)}`
  // Font web chỉ tải khi được dùng; phải chờ xong, nếu không canvas sẽ vẽ bằng font dự phòng.
  await document.fonts.load(font, item.text).catch(() => {})
  ctx.save()
  ctx.font = font
  ctx.fillStyle = item.color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  if (item.shadow) {
    const s = textShadow(px)
    ctx.shadowColor = s.color
    ctx.shadowBlur = s.blur
    ctx.shadowOffsetY = s.offsetY
  }
  const lines = item.text.split('\n')
  const lineHeight = px * LINE_HEIGHT
  const m = ctx.measureText('Hg')
  // CSS đặt vùng chữ (ascent + descent) vào giữa dòng → suy ra vị trí baseline tương ứng.
  const baselineShift = (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2
  const top = cy - (lines.length * lineHeight) / 2
  lines.forEach((line, i) => ctx.fillText(line, cx, top + i * lineHeight + lineHeight / 2 + baselineShift))
  ctx.restore()
}
