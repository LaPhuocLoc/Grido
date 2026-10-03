/**
 * Đọc / chèn thông tin màu và khối EXIF trong file ảnh đã mã hoá.
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

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0] // "Exif\0\0"

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (const v of b) c = CRC_TABLE[(c ^ v) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function splice(b: Uint8Array, at: number, insert: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length + insert.length)
  out.set(b.subarray(0, at))
  out.set(insert, at)
  out.set(b.subarray(at), at + insert.length)
  return out
}

function jpegWithExif(b: Uint8Array, tiff: Uint8Array): Uint8Array {
  const segments = jpegSegments(b)
  const size = 2 + EXIF_HEADER.length + tiff.length
  const isExif = (s: Segment) => s.marker === 0xe1 && EXIF_HEADER.every((c, i) => b[s.start + 4 + i] === c)
  if (!segments.length || size > 0xffff || segments.some(isExif)) return b
  const app1 = new Uint8Array(2 + size)
  app1.set([0xff, 0xe1, size >> 8, size & 0xff, ...EXIF_HEADER])
  app1.set(tiff, 4 + EXIF_HEADER.length)
  // Ngay sau SOI, hoặc sau phần đầu JFIF nếu có.
  return splice(b, segments[0].marker === 0xe0 ? segments[0].end : 2, app1)
}

function pngWithExif(b: Uint8Array, tiff: Uint8Array): Uint8Array {
  if (b.length < IHDR_END || !PNG_SIGNATURE.every((v, i) => b[i] === v)) return b
  const chunk = new Uint8Array(12 + tiff.length)
  const v = new DataView(chunk.buffer)
  v.setUint32(0, tiff.length)
  chunk.set([0x65, 0x58, 0x49, 0x66], 4) // "eXIf"
  chunk.set(tiff, 8)
  v.setUint32(8 + tiff.length, crc32(chunk.subarray(4, 8 + tiff.length)))
  return splice(b, IHDR_END, chunk)
}

/**
 * WebP: EXIF nằm trong chunk "EXIF" ở cuối file và phải được khai báo trong chunk "VP8X". File WebP đơn giản (chỉ một
 * chunk VP8 / VP8L, như canvas thường xuất) được chuyển sang dạng mở rộng VP8X để chứa nó.
 */
function webpWithExif(b: Uint8Array, tiff: Uint8Array, width: number, height: number): Uint8Array {
  const tag = (at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3])
  if (b.length < 20 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return b
  const exif = new Uint8Array(8 + tiff.length + (tiff.length & 1))
  exif.set([0x45, 0x58, 0x49, 0x46]) // "EXIF"
  new DataView(exif.buffer).setUint32(4, tiff.length, true)
  exif.set(tiff, 8)
  let body: Uint8Array
  if (tag(12) === 'VP8X') {
    if (b[20] & 0x08) return b // đã có EXIF
    body = new Uint8Array(b.length - 12 + exif.length)
    body.set(b.subarray(12))
    body[20 - 12] |= 0x08
    body.set(exif, b.length - 12)
  } else {
    // Ảnh VP8L có thể có kênh alpha (bit alpha_is_used trong phần đầu); VP8 thường thì không.
    const alpha = tag(12) === 'VP8L' && b.length > 25 && (b[24] & 0x10) !== 0
    const vp8x = new Uint8Array(18)
    vp8x.set([0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0]) // "VP8X", dài 10 byte
    vp8x[8] = 0x08 | (alpha ? 0x10 : 0)
    // Rộng − 1 và cao − 1, mỗi số 3 byte.
    for (let i = 0; i < 3; i++) {
      vp8x[12 + i] = ((width - 1) >> (8 * i)) & 0xff
      vp8x[15 + i] = ((height - 1) >> (8 * i)) & 0xff
    }
    body = new Uint8Array(vp8x.length + b.length - 12 + exif.length)
    body.set(vp8x)
    body.set(b.subarray(12), vp8x.length)
    body.set(exif, vp8x.length + b.length - 12)
  }
  const out = new Uint8Array(12 + body.length)
  out.set(b.subarray(0, 12))
  new DataView(out.buffer).setUint32(4, 4 + body.length, true)
  out.set(body, 12)
  return out
}

/** Gắn khối EXIF (TIFF) vào file ảnh đã mã hoá. Định dạng khác, hoặc file đã có EXIF, thì trả lại nguyên vẹn. */
export function withExif(b: Uint8Array, type: string, tiff: Uint8Array, width: number, height: number): Uint8Array {
  if (type === 'image/jpeg') return jpegWithExif(b, tiff)
  if (type === 'image/png') return pngWithExif(b, tiff)
  if (type === 'image/webp') return webpWithExif(b, tiff, width, height)
  return b
}
