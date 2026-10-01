/**
 * Bộ resample chất lượng cao: Lanczos3 tách trục, tính trong không gian ánh sáng tuyến tính
 * (linear light) với alpha nhân trước. So với drawImage của canvas (bilinear trong gamma sRGB):
 *  - không răng cưa / moiré khi thu nhỏ mạnh (kernel được giãn theo tỉ lệ thu nhỏ),
 *  - không làm tối các chi tiết tương phản cao (vì trộn màu trên giá trị tuyến tính),
 *  - giữ độ nét tốt hơn bicubic.
 * File này thuần tính toán, không đụng DOM, nên chạy được trong Web Worker.
 */

export interface Raster {
  data: Uint8ClampedArray
  width: number
  height: number
}

const LOBES = 3

const SRGB_TO_LINEAR = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
const LUT_MAX = 65535
const LINEAR_TO_SRGB = new Uint8Array(LUT_MAX + 1)
for (let i = 0; i <= LUT_MAX; i++) {
  const l = i / LUT_MAX
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055
  LINEAR_TO_SRGB[i] = Math.round(c * 255)
}

function lanczos(x: number): number {
  if (x === 0) return 1
  if (x <= -LOBES || x >= LOBES) return 0
  const px = Math.PI * x
  return (LOBES * Math.sin(px) * Math.sin(px / LOBES)) / (px * px)
}

interface Contributions {
  start: Int32Array
  count: Int32Array
  weights: Float32Array
  maxTaps: number
}

/** Với mỗi pixel đích: dải pixel nguồn đóng góp và trọng số đã chuẩn hoá. */
function contributions(src: number, dst: number): Contributions {
  const scale = src / dst
  const filterScale = Math.max(1, scale)
  const support = LOBES * filterScale
  const maxTaps = Math.ceil(support * 2) + 2
  const start = new Int32Array(dst)
  const count = new Int32Array(dst)
  const weights = new Float32Array(dst * maxTaps)
  for (let i = 0; i < dst; i++) {
    const center = (i + 0.5) * scale - 0.5
    const lo = Math.max(0, Math.ceil(center - support))
    const hi = Math.min(src - 1, Math.floor(center + support))
    let sum = 0
    for (let j = lo; j <= hi; j++) {
      const w = lanczos((j - center) / filterScale)
      weights[i * maxTaps + (j - lo)] = w
      sum += w
    }
    for (let j = lo; j <= hi; j++) weights[i * maxTaps + (j - lo)] /= sum
    start[i] = lo
    count[i] = hi - lo + 1
  }
  return { start, count, weights, maxTaps }
}

export function resample(src: Raster, dstW: number, dstH: number): Raster {
  const { width: srcW, height: srcH, data } = src
  if (srcW === dstW && srcH === dstH) return { data: new Uint8ClampedArray(data), width: dstW, height: dstH }

  const cx = contributions(srcW, dstW)
  const cy = contributions(srcH, dstH)
  const out = new Uint8ClampedArray(dstW * dstH * 4)

  // Hàng nguồn đã chuyển sang linear + nhân alpha (dùng lại cho mọi hàng).
  const linRow = new Float32Array(srcW * 4)
  // Cache các hàng đã resize ngang; chỉ giữ những hàng mà cửa sổ dọc hiện tại còn cần.
  const rowCache = new Map<number, Float32Array>()
  const pool: Float32Array[] = []

  const horizontalRow = (y: number): Float32Array => {
    let p = y * srcW * 4
    for (let x = 0, q = 0; x < srcW; x++, p += 4, q += 4) {
      const a = data[p + 3] / 255
      linRow[q] = SRGB_TO_LINEAR[data[p]] * a
      linRow[q + 1] = SRGB_TO_LINEAR[data[p + 1]] * a
      linRow[q + 2] = SRGB_TO_LINEAR[data[p + 2]] * a
      linRow[q + 3] = a
    }
    const row = pool.pop() ?? new Float32Array(dstW * 4)
    const { start, count, weights, maxTaps } = cx
    for (let x = 0; x < dstW; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let q = start[x] * 4
      const wBase = x * maxTaps
      for (let k = 0, n = count[x]; k < n; k++, q += 4) {
        const w = weights[wBase + k]
        r += linRow[q] * w
        g += linRow[q + 1] * w
        b += linRow[q + 2] * w
        a += linRow[q + 3] * w
      }
      const o = x * 4
      row[o] = r
      row[o + 1] = g
      row[o + 2] = b
      row[o + 3] = a
    }
    return row
  }

  const acc = new Float32Array(dstW * 4)
  for (let y = 0; y < dstH; y++) {
    const first = cy.start[y]
    const n = cy.count[y]
    for (const key of rowCache.keys()) {
      if (key < first) {
        pool.push(rowCache.get(key)!)
        rowCache.delete(key)
      }
    }
    acc.fill(0)
    for (let k = 0; k < n; k++) {
      const sy = first + k
      let row = rowCache.get(sy)
      if (!row) {
        row = horizontalRow(sy)
        rowCache.set(sy, row)
      }
      const w = cy.weights[y * cy.maxTaps + k]
      for (let i = 0, len = dstW * 4; i < len; i++) acc[i] += row[i] * w
    }
    let o = y * dstW * 4
    for (let i = 0, len = dstW * 4; i < len; i += 4, o += 4) {
      const a = acc[i + 3]
      if (a <= 0.0005) continue
      const inv = LUT_MAX / a
      // Lanczos có thể vọt lố (ringing) nên phải kẹp về [0, 1] trước khi tra bảng.
      const r = acc[i] * inv
      const g = acc[i + 1] * inv
      const b = acc[i + 2] * inv
      out[o] = LINEAR_TO_SRGB[r < 0 ? 0 : r > LUT_MAX ? LUT_MAX : (r + 0.5) | 0]
      out[o + 1] = LINEAR_TO_SRGB[g < 0 ? 0 : g > LUT_MAX ? LUT_MAX : (g + 0.5) | 0]
      out[o + 2] = LINEAR_TO_SRGB[b < 0 ? 0 : b > LUT_MAX ? LUT_MAX : (b + 0.5) | 0]
      out[o + 3] = a * 255
    }
  }
  return { data: out, width: dstW, height: dstH }
}
