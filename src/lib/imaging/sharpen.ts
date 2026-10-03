import type { Raster } from './resample'

/**
 * Làm nét đầu ra kiểu "Output Sharpening: Screen" của Lightroom: bù lại phần chi tiết bị mềm đi sau khi thu nhỏ.
 * Unsharp mask bán kính rất nhỏ (Gauss σ = 0.6px) trên giá trị sRGB, từng kênh màu; độ mạnh thay đổi theo độ sáng:
 * vùng tối và vùng gần trắng gần như không làm nét (khỏi đẩy noise lên, khỏi cháy), vùng trung tính làm nét mạnh nhất.
 * Đường cong `CURVE` và bán kính được dò từ ~30 cặp ảnh gốc → bản Lightroom xuất "Screen · High" (cả 2048 lẫn 1350px):
 * `amount` = 1 cho kết quả sát Lightroom High nhất. Như Lightroom, quầng sáng ở mép rất gắt được hãm lại (HALO_LIMIT).
 * Kênh alpha giữ nguyên.
 */

// Hệ số làm nét theo độ sáng (đã làm mờ) của chính pixel đó, mốc mỗi 15 mức từ 0 đến 255.
const CURVE = [0, 0, 0, 0.207, 0.479, 0.677, 0.865, 1.052, 1.235, 1.328, 1.289, 1.163, 0.96, 0.722, 0.418, 0.132, 0, 0]
const STEP = 255 / (CURVE.length - 1)
const GAIN = new Float32Array(256)
for (let v = 0; v < 256; v++) {
  const t = v / STEP
  const i = Math.min(CURVE.length - 2, Math.floor(t))
  GAIN[v] = CURVE[i] + (CURVE[i + 1] - CURVE[i]) * (t - i)
}

// Phần cộng thêm được nén mềm bằng HALO_LIMIT·tanh(x / HALO_LIMIT): mép bình thường gần như không đổi, mép rất gắt bị hãm
// (đo từ cặp Lightroom không làm nét / High: tăng 20 mức còn ~97%, 45 mức còn ~86%, 80 mức còn ~75%).
const HALO_LIMIT = 68

// Gauss σ = 0.6px rời rạc 3 điểm (điểm ±2 chỉ nặng 0.4% nên bỏ).
const SIDE = Math.exp(-1 / (2 * 0.6 * 0.6))
const W_SIDE = SIDE / (1 + 2 * SIDE)
const W_MID = 1 / (1 + 2 * SIDE)

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
      into[o] = W_SIDE * (data[l] + data[r]) + W_MID * data[c]
      into[o + 1] = W_SIDE * (data[l + 1] + data[r + 1]) + W_MID * data[c + 1]
      into[o + 2] = W_SIDE * (data[l + 2] + data[r + 2]) + W_MID * data[c + 2]
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
        const blur = W_SIDE * (above[i + ch] + below[i + ch]) + W_MID * mid[i + ch]
        const v = data[p + ch]
        out[p + ch] = v + HALO_LIMIT * Math.tanh((amount * GAIN[(blur + 0.5) | 0] * (v - blur)) / HALO_LIMIT)
      }
    }
    rows[0] = mid
    rows[1] = below
    rows[2] = above
  }
  return { data: out, width: w, height: h }
}

/** Ảnh có cạnh dài tới chừng này coi là bản đã xuất (đã được làm nét đầu ra sẵn), không phải file gốc của máy ảnh. */
export const EXPORTED_MAX_EDGE = 3000

/**
 * Phần làm nét dùng cho một ô, theo tỉ lệ thu nhỏ `scale` (cạnh nguồn / cạnh ô) và cạnh dài của ảnh nguồn.
 *  - Phóng to hoặc giữ nguyên cỡ: không làm nét (phóng to mà làm nét chỉ lộ thêm răng cưa; giữ nguyên cỡ thì ảnh không mềm
 *    đi chút nào).
 *  - Ảnh đã xuất (vd. file 2048px từ Lightroom): nó đã được làm nét sẵn và phần đó còn lại sau khi thu nhỏ, nên chỉ làm nét
 *    thêm một phần, càng thu nhỏ nhiều càng gần mức đủ. Đo trên 45 ảnh có cả bản Lightroom 2048 lẫn 1350: thu bản 2048 về
 *    1350 (1.52 lần) mà làm nét đủ thì nét hơn bản 1350 của Lightroom ~20%; mức ~0.5 thì khớp.
 *  - File gốc: làm nét đủ từ thu nhỏ 1.5 lần trở lên (khớp Lightroom khi thu ảnh 26–40MP về 2048 / 1350).
 */
export function sharpenFactor(scale: number, sourceEdge: number): number {
  if (scale <= 1) return 0
  if (sourceEdge <= EXPORTED_MAX_EDGE) return Math.min(1, (scale - 1) / 0.05) * Math.min(1, 0.42 + 0.15 * (scale - 1))
  return Math.min(1, (scale - 1) / 0.5)
}
