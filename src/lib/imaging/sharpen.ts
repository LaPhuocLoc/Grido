import type { Raster } from './resample'

/**
 * Làm nét đầu ra (unsharp mask bán kính nhỏ): bù lại phần chi tiết bị mềm đi sau khi thu nhỏ, giống bước
 * "Output Sharpening" của Lightroom. `amount` 0 = không đổi; khoảng 0.3–0.9 là dùng được cho ảnh xem trên màn hình.
 * Chạy trên giá trị sRGB (không phải linear) để quầng tối quanh mép không bị gắt. Kênh alpha giữ nguyên.
 */
export function sharpen(src: Raster, amount: number): Raster {
  const { width: w, height: h, data } = src
  if (amount <= 0) return src
  const out = new Uint8ClampedArray(data)
  const stride = w * 3
  // Ba hàng đã làm mờ ngang (trên, giữa, dưới) xoay vòng; mép ảnh lặp lại pixel ngoài cùng.
  const rows = [new Float32Array(stride), new Float32Array(stride), new Float32Array(stride)]
  const blurRow = (y: number, into: Float32Array) => {
    const base = y * w * 4
    for (let x = 0; x < w; x++) {
      const l = base + (x > 0 ? x - 1 : x) * 4
      const c = base + x * 4
      const r = base + (x < w - 1 ? x + 1 : x) * 4
      const o = x * 3
      into[o] = (data[l] + 2 * data[c] + data[r]) / 4
      into[o + 1] = (data[l + 1] + 2 * data[c + 1] + data[r + 1]) / 4
      into[o + 2] = (data[l + 2] + 2 * data[c + 2] + data[r + 2]) / 4
    }
  }
  blurRow(0, rows[1])
  rows[0].set(rows[1])
  for (let y = 0; y < h; y++) {
    if (y < h - 1) blurRow(y + 1, rows[2])
    else rows[2].set(rows[1])
    const [above, mid, below] = rows
    let p = y * w * 4
    for (let i = 0; i < stride; i += 3, p += 4) {
      for (let ch = 0; ch < 3; ch++) {
        const blur = (above[i + ch] + 2 * mid[i + ch] + below[i + ch]) / 4
        const v = data[p + ch]
        out[p + ch] = v + amount * (v - blur)
      }
    }
    rows[0] = mid
    rows[1] = below
    rows[2] = above
  }
  return { data: out, width: w, height: h }
}
