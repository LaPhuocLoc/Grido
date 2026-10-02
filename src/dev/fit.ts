import type { TemplateItem, TextTemplate } from '../lib/templates'
import { drawTextNow, fontInfo, lineStart, loadTextFont, measureTextBox, normalizeText, type TextItem } from '../lib/text'

/**
 * Tự canh một mẫu chữ nháp cho khớp ảnh mẫu gốc của font (chỉ dùng ở bản dev, qua trang `/?lab=…&fit=1`).
 *
 * Người (hoặc agent) dựng mẫu chỉ cần ghi đúng nội dung, font, màu gần đúng và vị trí / cỡ chữ áng chừng. Phần còn lại là
 * việc đo đếm: với từng dòng chữ, tìm vị trí, cỡ chữ, khoảng cách dòng (và giãn chữ, độ đậm nếu có) sao cho nét chữ vẽ
 * bằng đúng hàm vẽ của app chồng khít nhất lên vùng cùng màu trong ảnh gốc, rồi lấy lại màu chữ và màu nền từ chính ảnh.
 */

/** Dòng chữ của mẫu nháp, kèm gợi ý cho bước canh (không ghi vào file mẫu cuối). */
export type DraftItem = TemplateItem & {
  /**
   * false: giữ nguyên như đã ghi, không canh. 'bg': tìm chữ bằng "khác màu nền" thay vì "giống màu chữ" (chữ chuyển màu,
   * chữ nhiều màu).
   */
  fit?: false | 'bg'
  /** Ngưỡng khác màu (khoảng cách RGB) khi dò nét chữ trong ảnh gốc. */
  tol?: number
  /** Canh xong bằng `text` (chữ trong ảnh gốc) rồi thay bằng câu này, cho ảnh mẫu chỉ ghi "Tên font + Việt hoá". */
  then?: string
}
export interface Draft extends Omit<TextTemplate, 'aspect' | 'bg' | 'items'> {
  aspect?: number
  bg?: string
  /** Toạ độ nháp được ước lượng trên thumbnail 16:9 (bản cắt giữa của ảnh gốc) chứ không phải trên ảnh gốc. */
  crop?: boolean
  items: DraftItem[]
}

export interface FitReport {
  font: string
  /** Độ chồng khít (0..1) của từng dòng chữ; null = dòng không canh. */
  scores: (number | null)[]
  /** Những dòng chữ đã được tách ra theo màu (ảnh gốc tô mỗi cụm từ một màu). */
  split: string[]
}

const W = 360
const round = (v: number, digits: number) => Number(v.toFixed(digits))
type RGB = [number, number, number]
const hex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const rgb = (color: string): RGB => {
  const n = parseInt(color.slice(1, 7), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

interface Params {
  x: number
  y: number
  size: number
  lineHeight: number
  spacing: number
  rotation: number
}

export async function fitTemplate(
  draft: Draft,
  image: HTMLImageElement,
): Promise<{
  template: TextTemplate
  matched: TextTemplate
  report: FitReport
}> {
  const aspect = image.naturalWidth / image.naturalHeight
  const H = Math.round(W / aspect)
  const short = Math.min(W, H)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, W, H)
  const thumb = ctx.getImageData(0, 0, W, H).data
  const bg = draft.bg ?? hex(dominant(thumb))

  // Nét của những dòng đã canh xong: dòng sau không được bám vào đó nữa (dòng phụ cùng màu hay bị hút về phía tiêu đề).
  const claimed = new Uint8Array(W * H)
  const claim = (r: Uint8Array) => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!r[y * W + x]) continue
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const tx = x + dx
            const ty = y + dy
            if (tx >= 0 && tx < W && ty >= 0 && ty < H) claimed[ty * W + tx] = 1
          }
      }
  }

  /** Vùng trong ảnh gốc có thể là nét của một dòng chữ. */
  const target = (item: DraftItem, color: string, tol: number) => {
    const mask = new Uint8Array(W * H)
    const [r, g, b] = rgb(item.fit === 'bg' ? bg : color)
    for (let i = 0; i < W * H; i++) {
      const d = Math.hypot(thumb[i * 4] - r, thumb[i * 4 + 1] - g, thumb[i * 4 + 2] - b)
      mask[i] = !claimed[i] && (item.fit === 'bg' ? d > tol : d < tol) ? 1 : 0
    }
    return mask
  }
  /** Nét chữ của dòng này khi vẽ với thông số `p`: chỉ phần chữ, không hiệu ứng. */
  const render = (item: TextItem, p: Params) => ink(ctx, W, H, { ...item, ...p })
  /** Toạ độ các điểm của nét vẽ `r` kèm hộp bao, để trượt thử nhiều vị trí mà không phải quét lại cả ảnh. */
  const points = (r: Uint8Array) => {
    const xs: number[] = []
    const ys: number[] = []
    let x0 = W
    let y0 = H
    let x1 = -1
    let y1 = -1
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!r[y * W + x]) continue
        xs.push(x)
        ys.push(y)
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    return { xs, ys, x0, y0, x1, y1 }
  }
  /** Độ chồng khít giữa nét vẽ (dời đi dx, dy điểm ảnh) và vùng `t`, chỉ tính quanh hộp bao nét vẽ để dòng chữ khác cùng màu không làm nhiễu. */
  const overlap = (r: ReturnType<typeof points>, t: Uint8Array, sum: Float64Array, dx = 0, dy = 0) => {
    const count = r.xs.length
    if (!count) return 0
    let hit = 0
    for (let i = 0; i < count; i++) {
      const tx = r.xs[i] + dx
      const ty = r.ys[i] + dy
      if (tx >= 0 && tx < W && ty >= 0 && ty < H && t[ty * W + tx]) hit++
    }
    const pad = Math.round(Math.max(r.x1 - r.x0, r.y1 - r.y0) * 0.1) + 2
    const around = boxSum(sum, r.x0 + dx - pad, r.y0 + dy - pad, r.x1 + dx + pad, r.y1 + dy + pad)
    return hit / (count + around - hit)
  }
  /** Bảng cộng dồn để đếm nhanh số điểm của vùng `t` trong một hình chữ nhật. */
  const integral = (t: Uint8Array) => {
    const sum = new Float64Array((W + 1) * (H + 1))
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) sum[(y + 1) * (W + 1) + x + 1] = t[y * W + x] + sum[y * (W + 1) + x + 1] + sum[(y + 1) * (W + 1) + x] - sum[y * (W + 1) + x]
    return sum
  }
  const boxSum = (sum: Float64Array, x0: number, y0: number, x1: number, y1: number) => {
    const a = Math.max(0, x0)
    const b = Math.max(0, y0)
    const c = Math.min(W, x1 + 1)
    const d = Math.min(H, y1 + 1)
    if (c <= a || d <= b) return 0
    return sum[d * (W + 1) + c] - sum[b * (W + 1) + c] - sum[d * (W + 1) + a] + sum[b * (W + 1) + a]
  }

  /** Canh một dòng chữ (hoặc một khối nhiều dòng) quanh vị trí áng chừng của nó; `span`: tầm dò vị trí theo tỉ lệ bề rộng ảnh. */
  const fitOne = async (raw: DraftItem, item: TextItem, span: number, steps = 8) => {
    const { fit, tol = 70 } = raw
    const multiline = item.text.includes('\n')
    const tracked = raw.spacing !== undefined
    const turned = raw.rotation !== undefined
    // Font có mặt đậm riêng thì thử cả hai độ đậm; font một mặt chữ mà bật đậm là trình duyệt tự làm đậm giả, không dùng.
    const family = fontInfo(item.font).family.split(',')[0].replace(/["']/g, '')
    // Mặt đậm riêng (700 / bold) hoặc font biến thiên có dải độ đậm phủ tới 700.
    const hasBold = [...document.fonts].some((f) => f.family.replace(/["']/g, '') === family && (/^(700|bold)$/.test(f.weight) || Number(f.weight.split(' ')[1]) >= 700))
    const weights = hasBold && raw.bold === undefined ? [false, true] : [raw.bold ?? false]
    let best: {
      score: number
      p: Params
      bold: boolean
      color: string
      mask: Uint8Array
    } | null = null
    for (const bold of weights) {
      const face = { ...item, bold }
      await loadTextFont(face, 40).catch(() => {})
      let t = target(raw, item.color, tol)
      let sum = integral(t)
      const score = (p: Params) => overlap(points(render(face, p)), t, sum)

      // Bước thô: với mỗi cỡ chữ, vẽ một lần rồi trượt nét vẽ đi quanh vị trí áng chừng.
      const start: Params = {
        x: item.x,
        y: item.y,
        size: item.size,
        lineHeight: item.lineHeight,
        spacing: item.spacing,
        rotation: item.rotation,
      }
      let p = start
      let top = -1
      // Chữ thu thật nhỏ lọt thỏm vào một nét của ảnh gốc cũng "khớp" rất cao,
      // nên càng xa cỡ áng chừng càng bị trừ điểm.
      for (let step = -steps; step <= steps; step++) {
        const size = item.size * 1.09 ** step
        const r = points(render(face, { ...start, size }))
        const reach = Math.round(W * span)
        const prior = Math.exp(-((step * Math.log(1.09)) ** 2) / (2 * 0.7 ** 2))
        for (let dy = -reach; dy <= reach; dy += 4)
          for (let dx = -reach; dx <= reach; dx += 4) {
            const s = overlap(r, t, sum, dx, dy) * prior
            if (s > top) {
              top = s
              p = { ...start, size, x: item.x + dx / W, y: item.y + dy / H }
            }
          }
      }
      // Chữ nhiều dòng: dò khoảng cách dòng trước, vì đổi nó là mọi dòng cùng dời nên bước tinh khó tự tìm ra.
      top = score(p)
      const coarse = p.size
      if (multiline) {
        const base = p
        for (let lineHeight = 0.7; lineHeight <= 1.8; lineHeight += 0.05) {
          const r = points(render(face, { ...base, lineHeight }))
          for (let dy = -14; dy <= 14; dy += 2) {
            const s = overlap(r, t, sum, 0, dy)
            if (s > top) {
              top = s
              p = { ...base, lineHeight, y: base.y + dy / H }
            }
          }
        }
      }
      // Bước tinh: lần lượt nhích từng thông số, bước nhích nhỏ dần.
      const refine = (start: Params, rounds: number) => {
        let now = start
        let value = score(now)
        const steps: Params = {
          x: 3 / W,
          y: 3 / H,
          size: now.size * 0.05,
          lineHeight: multiline ? 0.06 : 0,
          spacing: tracked ? 30 : 0,
          rotation: turned ? 2 : 0,
        }
        for (let round = 0; round < rounds; round++) {
          for (let pass = 0; pass < 3; pass++)
            for (const key of Object.keys(steps) as (keyof Params)[]) {
              if (!steps[key]) continue
              for (const dir of [1, -1])
                for (;;) {
                  const next = { ...now, [key]: now[key] + dir * steps[key] }
                  if (next.lineHeight < 0.6 || next.lineHeight > 2.5 || next.spacing < -100 || next.spacing > 500) break
                  if (next.size < coarse * 0.75 || next.size > coarse * 1.33) break
                  const s = score(next)
                  if (s <= value + 1e-4) break
                  now = next
                  value = s
                }
            }
          for (const key of Object.keys(steps) as (keyof Params)[]) steps[key] /= 2
        }
        return { p: now, value }
      }
      let fine = refine(p, 4)
      // Lấy lại màu chữ từ chính ảnh gốc (trung vị các điểm ảnh nằm dưới nét chữ), rồi canh lại với vùng màu chuẩn hơn.
      let color = item.color
      if (!item.gradient) {
        const r = render(face, fine.p)
        const under: RGB[] = []
        for (let i = 0; i < W * H; i++) if (r[i] && t[i]) under.push([thumb[i * 4], thumb[i * 4 + 1], thumb[i * 4 + 2]])
        if (under.length > 30) {
          color = hex([0, 1, 2].map((c) => under.map((v) => v[c]).sort((a, b) => a - b)[under.length >> 1]) as RGB)
          if (fit !== 'bg') {
            t = target(raw, color, tol * 0.85)
            sum = integral(t)
            fine = refine(fine.p, 3)
          }
        }
      }
      if (!best || fine.value > best.score)
        best = {
          score: fine.value,
          p: fine.p,
          bold,
          color,
          mask: render(face, fine.p),
        }
    }
    const fitted: TextItem = {
      ...item,
      bold: best!.bold,
      color: best!.color,
      x: round(best!.p.x, 4),
      y: round(best!.p.y, 4),
      size: round(best!.p.size, 2),
      lineHeight: round(best!.p.lineHeight, 2),
      spacing: Math.round(best!.p.spacing / 5) * 5,
      rotation: Math.round(best!.p.rotation),
    }
    return { score: best!.score, fitted, mask: best!.mask }
  }

  const scores: (number | null)[] = draft.items.map(() => null)
  const split: string[] = []
  const items: TemplateItem[][] = []
  // Bản giữ nguyên chữ của ảnh gốc (trước khi thay bằng `then`), để nhìn bằng mắt xem canh có khớp không.
  const originals: TemplateItem[][] = []
  // Dòng to canh trước: nó chiếm phần lớn vùng màu, canh xong thì nhường phần còn lại cho các dòng nhỏ.
  const order = draft.items.map((_, i) => i).sort((a, b) => draft.items[b].size - draft.items[a].size)
  const largest = Math.max(...draft.items.map((item) => item.size))
  for (const index of order) {
    const raw = draft.items[index]
    const { fit, tol: _tol, then, ...rest } = raw
    let item = normalizeText({ id: 'fit', ...rest })
    if (draft.crop) item = uncrop(item, aspect)
    if (fit === false) {
      items[index] = [clean({ ...item, text: then ?? item.text })]
      originals[index] = [clean(item)]
      continue
    }
    // Dòng phụ nhỏ dễ bị hút về phía chữ khác: chỉ dò sát quanh vị trí và cỡ áng chừng.
    const minor = item.size < largest * 0.45
    let whole = await fitOne(raw, item, minor ? 0.07 : 0.28, minor ? 3 : 8)
    // Không tìm thấy dòng này trong ảnh gốc (font khác ảnh gốc, chữ quá mảnh): giữ vị trí và cỡ áng chừng của bản nháp.
    if (whole.score < 0.2) whole = { ...whole, fitted: { ...item, bold: raw.bold ?? false } }
    let parts = [whole]
    const lines = item.text.split('\n')
    // Khối nhiều dòng không khớp: trong ảnh gốc mỗi dòng thường được đặt riêng (so le, lệch lề). Thử tách từng dòng ra canh riêng.
    if (lines.length > 1 && whole.score < 0.65 && then === undefined) {
      const saved = claimed.slice()
      const pitch = (whole.fitted.lineHeight * whole.fitted.size * short) / 100 / H
      const split: (typeof whole)[] = []
      for (let i = 0; i < lines.length; i++) {
        const line = {
          ...whole.fitted,
          text: lines[i],
          y: whole.fitted.y + (i - (lines.length - 1) / 2) * pitch,
        }
        const one = await fitOne({ ...raw, text: lines[i], bold: whole.fitted.bold }, line, 0.12)
        claim(one.mask)
        split.push(one)
      }
      const mean = split.reduce((sum, r) => sum + r.score, 0) / split.length
      if (mean > 0.3 && mean > whole.score + 0.08) parts = split
      else claimed.set(saved)
    }
    if (parts.length === 1) claim(whole.mask)
    scores[index] = round(parts.reduce((sum, r) => sum + r.score, 0) / parts.length, 2)
    if (then !== undefined) {
      items[index] = parts.map((r) => clean({ ...r.fitted, text: then }))
      originals[index] = parts.map((r) => clean(r.fitted))
      continue
    }
    // Ảnh gốc tô mỗi cụm từ một màu: tách dòng chữ ra theo màu.
    const coloured: TextItem[] = []
    for (const r of parts) {
      const pieces = await splitColours(ctx, thumb, W, H, r.fitted, bg)
      if (pieces.length > 1) split.push(r.fitted.text.replace(/\n/g, ' / '))
      coloured.push(...pieces)
    }
    items[index] = originals[index] = coloured.map(clean)
  }
  const head = { font: draft.font, aspect: round(aspect, 4), bg }
  return {
    template: { ...head, items: items.flat() },
    matched: { ...head, items: originals.flat() },
    report: { font: draft.font, scores, split },
  }
}

/** Chỉ tách màu cho một mẫu đã canh xong (không dời, không đổi cỡ chữ): dùng để soát lại các mẫu cũ. */
export async function recolourTemplate(template: TextTemplate, image: HTMLImageElement): Promise<{ template: TextTemplate; report: FitReport }> {
  const H = Math.round(W / (image.naturalWidth / image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, W, H)
  const thumb = ctx.getImageData(0, 0, W, H).data
  const split: string[] = []
  const items: TemplateItem[] = []
  for (const [i, raw] of template.items.entries()) {
    const item = normalizeText({ id: `c${i}`, ...raw })
    const pieces = await splitColours(ctx, thumb, W, H, item, template.bg)
    if (pieces.length > 1) split.push(item.text.replace(/\n/g, ' / '))
    items.push(...(pieces.length > 1 ? pieces.map(clean) : [raw]))
  }
  return { template: { ...template, items }, report: { font: template.font, scores: [], split } }
}

/** Nét chữ của `item` trên khung W × H: chỉ phần chữ, không hiệu ứng. */
function ink(ctx: CanvasRenderingContext2D, W: number, H: number, item: TextItem) {
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  const plain: TextItem = { ...item, color: '#000', shadow: false, opacity: 100, outline: null, block: null, glow: null, gradient: null, plate: null }
  drawTextNow(ctx, plain, item.x * W, item.y * H, (item.size * Math.min(W, H)) / 100, item.width === null ? null : item.width * W)
  const data = ctx.getImageData(0, 0, W, H).data
  const mask = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) mask[i] = data[i * 4] < 128 ? 1 : 0
  return mask
}

const distance = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * Ảnh gốc hay tô mỗi cụm từ của một dòng một màu ("bánh mỳ" nâu, "xá xíu" đỏ) mà mỗi dòng chữ của app chỉ có một màu.
 * Đo màu ảnh gốc dưới nét của từng từ; nếu các từ khác màu rõ ràng thì tách dòng chữ thành nhiều dòng đặt đúng chỗ cũ,
 * mỗi dòng một màu. Không chắc (từ không nằm trên chữ của ảnh gốc, màu loang lổ) thì giữ nguyên.
 */
async function splitColours(ctx: CanvasRenderingContext2D, thumb: Uint8ClampedArray, W: number, H: number, item: TextItem, bg: string): Promise<TextItem[]> {
  if (item.gradient || item.vertical || item.width !== null || !/\s/.test(item.text.trim())) return [item]
  const px = (item.size * Math.min(W, H)) / 100
  await loadTextFont(item, px).catch(() => {})
  const measure = (text: string) => (text ? measureTextBox(ctx, { ...item, text }, px).w : 0)
  const back = rgb(bg)
  /** Màu ảnh gốc dưới nét chữ của `piece`; null = quá ít điểm ảnh, false = không phải một màu. */
  const colourOf = (piece: TextItem): RGB | null | false => {
    const mask = ink(ctx, W, H, piece)
    const under: RGB[] = []
    let x0 = W
    let y0 = H
    let x1 = -1
    let y1 = -1
    for (let i = 0; i < W * H; i++) {
      if (!mask[i]) continue
      under.push([thumb[i * 4], thumb[i * 4 + 1], thumb[i * 4 + 2]])
      x0 = Math.min(x0, i % W)
      x1 = Math.max(x1, i % W)
      y0 = Math.min(y0, Math.floor(i / W))
      y1 = Math.max(y1, Math.floor(i / W))
    }
    if (under.length < 12) return null
    const middle = (list: RGB[]) => [0, 1, 2].map((c) => list.map((v) => v[c]).sort((a, b) => a - b)[list.length >> 1]) as RGB
    const median = middle(under)
    const near = under.filter((v) => distance(v, median) < 60).length
    // Màu quanh nét chữ: trùng với màu dưới nét thì nét vẽ đang nằm trên nền chứ không phải trên chữ của ảnh gốc.
    const around: RGB[] = []
    for (let y = Math.max(0, y0 - 3); y <= Math.min(H - 1, y1 + 3); y++)
      for (let x = Math.max(0, x0 - 3); x <= Math.min(W - 1, x1 + 3); x++) {
        const i = y * W + x
        if (!mask[i]) around.push([thumb[i * 4], thumb[i * 4 + 1], thumb[i * 4 + 2]])
      }
    return near / under.length < 0.55 || distance(median, back) < 50 || distance(median, middle(around)) < 50 ? false : median
  }
  const lines = item.text.split('\n')
  const widths = lines.map(measure)
  const box = Math.max(...widths)
  const angle = (item.rotation * Math.PI) / 180
  const at = (text: string, along: number, down: number): TextItem => ({
    ...item,
    text,
    x: round(item.x + (along * Math.cos(angle) - down * Math.sin(angle)) / W, 4),
    y: round(item.y + (along * Math.sin(angle) + down * Math.cos(angle)) / H, 4),
  })
  // Mỗi dòng → các cụm từ liền nhau cùng màu.
  const runs: { line: number; piece: TextItem; color: RGB }[] = []
  for (const [i, line] of lines.entries()) {
    const down = (i - (lines.length - 1) / 2) * px * item.lineHeight
    const left = lineStart(item.align, box, widths[i])
    const words = line.split(' ')
    const colours: (RGB | null)[] = []
    for (let k = 0; k < words.length; k++) {
      const prefix = words.slice(0, k).join(' ') + (k ? ' ' : '')
      const c = words[k] ? colourOf(at(words[k], left + measure(prefix) + measure(words[k]) / 2, down)) : null
      if (c === false) return [item]
      colours.push(c)
    }
    let from = 0
    let first: RGB | null = null
    const close = (to: number) => {
      const prefix = words.slice(0, from).join(' ') + (from ? ' ' : '')
      const text = words.slice(from, to).join(' ')
      if (!text.trim()) return true
      const piece = at(text, left + measure(prefix) + measure(text) / 2, down)
      const color = colourOf(piece)
      if (!color) return false
      runs.push({ line: i, piece: { ...piece, color: hex(color) }, color })
      return true
    }
    for (let k = 0; k < words.length; k++) {
      const c = colours[k]
      if (!c) continue
      if (first && distance(c, first) > 60) {
        if (!close(k)) return [item]
        from = k
        first = c
      } else first ??= c
    }
    if (!first || !close(words.length)) return [item]
  }
  if (runs.every((r) => distance(r.color, runs[0].color) <= 60)) return [item]
  // Các dòng liền nhau trọn một màu thì gộp lại thành một khối nhiều dòng (chỉ đúng vị trí khi canh giữa).
  const out: TextItem[] = []
  let block: typeof runs = []
  const flush = () => {
    if (!block.length) return
    const mid = (key: 'x' | 'y') => round(block.reduce((sum, r) => sum + r.piece[key], 0) / block.length, 4)
    out.push(block.length === 1 ? block[0].piece : { ...block[0].piece, text: block.map((r) => r.piece.text).join('\n'), x: mid('x'), y: mid('y') })
    block = []
  }
  for (const run of runs) {
    const alone = runs.filter((r) => r.line === run.line).length === 1
    const last = block[block.length - 1]
    if (!alone || item.align !== 'center' || (last && (last.line !== run.line - 1 || distance(last.color, run.color) > 60))) flush()
    block.push(run)
    if (!alone || item.align !== 'center') flush()
  }
  flush()
  return out
}

/** Màu chiếm nhiều diện tích nhất của ảnh (gom theo 16 mức mỗi kênh): coi là màu nền. */
function dominant(data: Uint8ClampedArray): RGB {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4)
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bin.n++
    bin.r += data[i]
    bin.g += data[i + 1]
    bin.b += data[i + 2]
    bins.set(key, bin)
  }
  const top = [...bins.values()].sort((a, b) => b.n - a.n)[0]
  return [top.r / top.n, top.g / top.n, top.b / top.n]
}

/** Đổi toạ độ ước lượng trên thumbnail 16:9 (cắt giữa, phủ kín) sang toạ độ trên ảnh gốc tỉ lệ `aspect`. */
function uncrop(item: TextItem, aspect: number): TextItem {
  const wide = 16 / 9
  if (aspect <= wide) {
    // Ảnh gốc cao hơn 16:9: thumbnail lấy trọn chiều rộng, cắt bớt trên dưới.
    const shown = aspect / wide
    const short = Math.min(1, 1 / aspect)
    return {
      ...item,
      y: 0.5 + (item.y - 0.5) * shown,
      size: (item.size * (1 / wide)) / short,
    }
  }
  const shown = wide / aspect
  return {
    ...item,
    x: 0.5 + (item.x - 0.5) * shown,
    width: item.width === null ? null : item.width * shown,
  }
}

const DEFAULTS = normalizeText({ id: '' }) as unknown as Record<string, unknown>

/** File mẫu chỉ ghi những trường khác mặc định. */
function clean(item: TextItem): TemplateItem {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(item)) {
    if (key === 'id' || key === 'group') continue
    if (['text', 'x', 'y', 'size'].includes(key) || JSON.stringify(value) !== JSON.stringify(DEFAULTS[key])) out[key] = value
  }
  return out as TemplateItem
}
