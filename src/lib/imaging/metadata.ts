/**
 * Đọc / chèn thông tin màu trong file ảnh đã mã hoá.
 * Ảnh không gắn không gian màu sẽ bị một số phần mềm (và màn hình gam rộng) hiển thị sai màu,
 * nên mọi file xuất ra đều khai báo rõ là sRGB.
 */

interface Segment {
  marker: number
  start: number
  end: number
}

const ICC_TAG = 'ICC_PROFILE\0'

/** Các đoạn (segment) đứng trước dữ liệu ảnh của một file JPEG; rỗng nếu không phải JPEG. */
function jpegSegments(b: Uint8Array): Segment[] {
  const out: Segment[] = []
  if (b[0] !== 0xff || b[1] !== 0xd8) return out
  for (let i = 2; i + 4 <= b.length && b[i] === 0xff; ) {
    const marker = b[i + 1]
    const end = i + 2 + ((b[i + 2] << 8) | b[i + 3])
    if (end > b.length) break
    out.push({ marker, start: i, end })
    // Sau SOS là dữ liệu nén, không còn chia đoạn.
    if (marker === 0xda) break
    i = end
  }
  return out
}

const isIcc = (b: Uint8Array, s: Segment) =>
  s.marker === 0xe2 && [...ICC_TAG].every((ch, i) => b[s.start + 4 + i] === ch.charCodeAt(0))

/** Chép hồ sơ màu ICC từ `source` sang `target` (đặt ngay sau phần đầu JFIF). */
export function withIccFrom(source: Uint8Array, target: Uint8Array): Uint8Array {
  const profile = jpegSegments(source).filter((s) => isIcc(source, s))
  const segments = jpegSegments(target)
  if (!profile.length || !segments.length || segments.some((s) => isIcc(target, s))) return target
  const at = segments[0].marker === 0xe0 ? segments[0].end : 2
  const size = profile.reduce((sum, s) => sum + s.end - s.start, 0)
  const out = new Uint8Array(target.length + size)
  out.set(target.subarray(0, at))
  let o = at
  for (const s of profile) {
    out.set(source.subarray(s.start, s.end), o)
    o += s.end - s.start
  }
  out.set(target.subarray(at), o)
  return out
}

/** Kiểu lấy mẫu màu của JPEG: '4:4:4' = màu giữ đủ độ phân giải, '4:2:0' = màu chỉ còn 1/4. */
export function jpegSubsampling(b: Uint8Array): string | null {
  const sof = jpegSegments(b).find((s) => s.marker >= 0xc0 && s.marker <= 0xc2)
  if (!sof) return null
  const hv = b[sof.start + 11]
  return hv === 0x11 ? '4:4:4' : hv === 0x22 ? '4:2:0' : hv === 0x21 ? '4:2:2' : `${hv >> 4}x${hv & 15}`
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
// Chunk sRGB (rendering intent: perceptual) kèm CRC.
const PNG_SRGB = [0, 0, 0, 1, 0x73, 0x52, 0x47, 0x42, 0, 0xae, 0xce, 0x1c, 0xe9]
const IHDR_END = 8 + 12 + 13

/** Gắn nhãn sRGB cho PNG chưa khai báo không gian màu. */
export function pngWithSrgb(b: Uint8Array): Uint8Array {
  if (b.length < IHDR_END || !PNG_SIGNATURE.every((v, i) => b[i] === v)) return b
  for (let i = 8; i + 12 <= b.length; ) {
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7])
    if (type === 'sRGB' || type === 'iCCP') return b
    if (type === 'IDAT') break
    i += 12 + ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3])
  }
  const out = new Uint8Array(b.length + PNG_SRGB.length)
  out.set(b.subarray(0, IHDR_END))
  out.set(PNG_SRGB, IHDR_END)
  out.set(b.subarray(IHDR_END), IHDR_END + PNG_SRGB.length)
  return out
}
