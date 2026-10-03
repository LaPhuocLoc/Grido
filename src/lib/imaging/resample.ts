/**
 * Bộ resample đổi kích thước ảnh: bicubic Catmull-Rom tách trục, trộn trực tiếp trên giá trị sRGB (gamma) với alpha nhân trước.
 * Chọn đúng như Lightroom / Photoshop vì đo trên hàng chục cặp ảnh (ảnh gốc → bản Lightroom xuất), cách này cho kết quả
 * sát Lightroom nhất: trộn trong ánh sáng tuyến tính làm chi tiết nhỏ sáng và nhạt đi so với Lightroom, còn Lanczos3
 * nét gắt hơn ở mép. Khi thu nhỏ, kernel được giãn theo tỉ lệ nên không răng cưa / moiré.
 * File này thuần tính toán, không đụng DOM, nên chạy được trong Web Worker.
 */

export interface Raster {
  data: Uint8ClampedArray
  width: number
  height: number
}

const SUPPORT = 2

/** Catmull-Rom (Keys, a = -0.5). */
function cubic(x: number): number {
  x = Math.abs(x)
  if (x < 1) return 1.5 * x * x * x - 2.5 * x * x + 1
  if (x < 2) return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2
  return 0
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
  const support = SUPPORT * filterScale
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
      const w = cubic((j - center) / filterScale)
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

  // Hàng nguồn đã nhân alpha (dùng lại cho mọi hàng).
  const srcRow = new Float32Array(srcW * 4)
  // Cache các hàng đã resize ngang; chỉ giữ những hàng mà cửa sổ dọc hiện tại còn cần.
  const rowCache = new Map<number, Float32Array>()
  const pool: Float32Array[] = []

  const horizontalRow = (y: number): Float32Array => {
    let p = y * srcW * 4
    for (let x = 0, q = 0; x < srcW; x++, p += 4, q += 4) {
      const a = data[p + 3] / 255
      srcRow[q] = data[p] * a
      srcRow[q + 1] = data[p + 1] * a
      srcRow[q + 2] = data[p + 2] * a
      srcRow[q + 3] = a
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
        r += srcRow[q] * w
        g += srcRow[q + 1] * w
        b += srcRow[q + 2] * w
        a += srcRow[q + 3] * w
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
      // Uint8ClampedArray tự làm tròn và kẹp về 0–255 phần vọt lố (ringing) của kernel bicubic.
      out[o] = acc[i] / a
      out[o + 1] = acc[i + 1] / a
      out[o + 2] = acc[i + 2] / a
      out[o + 3] = a * 255
    }
  }
  return { data: out, width: dstW, height: dstH }
}
