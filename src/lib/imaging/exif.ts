/**
 * EXIF: đọc lúc nhập ảnh, gắn lại vào file xuất — như Lightroom xuất với "Metadata: All Metadata".
 *
 * Lúc nhập lấy hai thứ: bản tóm tắt thông tin chụp (máy, ống kính, thông số, giờ chụp, GPS, giả lập phim Fuji) để các
 * tính năng sau này dùng, và một khối EXIF đã làm sạch để gắn vào file xuất. Làm sạch giống Lightroom: bỏ MakerNote (phần
 * riêng của hãng, tới vài chục KB), thumbnail nhúng (là ảnh chưa cắt, trình xem có thể hiện nhầm), cờ xoay (pixel đã
 * xoay sẵn) và các thẻ chỉ đúng với file gốc (kích thước, cách nén).
 */
import type { PhotoExif } from '../../../shared/types'

interface Field {
  type: number
  count: number
  /** Giá trị thô, theo thứ tự byte của khối TIFF chứa nó. */
  bytes: Uint8Array
}
type Ifd = Map<number, Field>

interface Tiff {
  little: boolean
  ifd0: Ifd
  exif: Ifd
  gps: Ifd
}

// Số byte của một phần tử theo kiểu dữ liệu TIFF (1 BYTE … 12 DOUBLE, 13 IFD).
const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4]
const ASCII = 2
const SHORT = 3
const LONG = 4
const UNDEFINED = 7

const EXIF_IFD = 0x8769
const GPS_IFD = 0x8825
const MAKER_NOTE = 0x927c
// Lớn hơn mức này là khối dữ liệu riêng của phần mềm / hãng, không phải thông tin chụp.
const MAX_FIELD_BYTES = 4096

/** Thẻ của IFD0 được giữ (Lightroom cũng chỉ giữ chừng này). Software / DateTime được ghi mới lúc xuất. */
const KEEP_IFD0 = new Set([0x010e, 0x010f, 0x0110, 0x011a, 0x011b, 0x0128, 0x013b, 0x8298])
/** Thẻ của Exif IFD bị bỏ: chỉ đúng với file gốc, hoặc được ghi mới lúc xuất. */
const DROP_EXIF = new Set([
  MAKER_NOTE,
  0x9286, // UserComment
  0xa005, // con trỏ Interoperability IFD
  0x9101, // ComponentsConfiguration
  0x9102, // CompressedBitsPerPixel
  0xa000, // FlashpixVersion
  0xa001, // ColorSpace
  0xa002, // PixelXDimension
  0xa003, // PixelYDimension
  0x9010, // OffsetTime (của DateTime)
  0x9290, // SubsecTime (của DateTime)
  0xa460, // CompositeImage
  0xea1c, // Padding (Windows)
  0xea1d, // OffsetSchema (Windows)
])

// ---- Đọc -------------------------------------------------------------------------------------------------------------

function readIfd(t: Uint8Array, little: boolean, offset: number): Ifd {
  const ifd: Ifd = new Map()
  const v = new DataView(t.buffer, t.byteOffset, t.byteLength)
  if (!offset || offset + 2 > t.length) return ifd
  const n = v.getUint16(offset, little)
  for (let i = 0; i < n; i++) {
    const e = offset + 2 + 12 * i
    if (e + 12 > t.length) break
    const type = v.getUint16(e + 2, little)
    const count = v.getUint32(e + 4, little)
    const size = (TYPE_SIZE[type] ?? 0) * count
    if (!size) continue
    const at = size <= 4 ? e + 8 : v.getUint32(e + 8, little)
    if (at + size > t.length) continue
    ifd.set(v.getUint16(e, little), { type, count, bytes: t.subarray(at, at + size) })
  }
  return ifd
}

function parseTiff(t: Uint8Array): Tiff | null {
  if (t.length < 8) return null
  const little = t[0] === 0x49 && t[1] === 0x49
  if (!little && !(t[0] === 0x4d && t[1] === 0x4d)) return null
  const v = new DataView(t.buffer, t.byteOffset, t.byteLength)
  if (v.getUint16(2, little) !== 42) return null
  const ifd0 = readIfd(t, little, v.getUint32(4, little))
  const sub = (tag: number) => {
    const f = ifd0.get(tag)
    return f && (f.type === LONG || f.type === 13) ? readIfd(t, little, number(f, little) ?? 0) : new Map()
  }
  return { little, ifd0, exif: sub(EXIF_IFD), gps: sub(GPS_IFD) }
}

function number(f: Field | undefined, little: boolean, i = 0): number | undefined {
  if (!f || i >= f.count) return undefined
  const v = new DataView(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength)
  const at = i * TYPE_SIZE[f.type]
  switch (f.type) {
    case 1:
    case UNDEFINED:
      return v.getUint8(at)
    case 6:
      return v.getInt8(at)
    case SHORT:
      return v.getUint16(at, little)
    case 8:
      return v.getInt16(at, little)
    case LONG:
    case 13:
      return v.getUint32(at, little)
    case 9:
      return v.getInt32(at, little)
    case 5:
    case 10: {
      const signed = f.type === 10
      const n = signed ? v.getInt32(at, little) : v.getUint32(at, little)
      const d = signed ? v.getInt32(at + 4, little) : v.getUint32(at + 4, little)
      return d ? n / d : undefined
    }
    case 11:
      return v.getFloat32(at, little)
    case 12:
      return v.getFloat64(at, little)
  }
  return undefined
}

function text(f: Field | undefined): string | undefined {
  if (!f || (f.type !== ASCII && f.type !== UNDEFINED)) return undefined
  const end = f.bytes.indexOf(0)
  const s = new TextDecoder().decode(end < 0 ? f.bytes : f.bytes.subarray(0, end)).trim()
  return s || undefined
}

// Fuji ghi giả lập phim màu ở FilmMode, còn đen trắng (Acros, Monochrome…) ở Saturation. Bảng mã theo ExifTool.
const FUJI_FILM: Record<number, string> = {
  0x000: 'Provia/Standard',
  0x120: 'Astia/Soft',
  0x200: 'Velvia/Vivid',
  0x400: 'Velvia/Vivid',
  0x500: 'Pro Neg. Std',
  0x501: 'Pro Neg. Hi',
  0x600: 'Classic Chrome',
  0x700: 'Eterna/Cinema',
  0x800: 'Classic Neg.',
  0x900: 'Eterna Bleach Bypass',
  0xa00: 'Nostalgic Neg.',
  0xb00: 'Reala Ace',
}
const FUJI_MONO: Record<number, string> = {
  0x300: 'Monochrome',
  0x301: 'Monochrome + R',
  0x302: 'Monochrome + Ye',
  0x303: 'Monochrome + G',
  0x310: 'Sepia',
  0x500: 'Acros',
  0x501: 'Acros + R',
  0x502: 'Acros + Ye',
  0x503: 'Acros + G',
}

/** MakerNote của Fuji: "FUJIFILM" + vị trí IFD, luôn little-endian, toạ độ tính từ đầu MakerNote. */
function fujiFilm(note: Field | undefined): string | undefined {
  const b = note?.bytes
  if (!b || b.length < 14 || new TextDecoder().decode(b.subarray(0, 8)) !== 'FUJIFILM') return undefined
  const ifd = readIfd(b, true, new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(8, true))
  const mono = number(ifd.get(0x1003), true)
  if (mono !== undefined && FUJI_MONO[mono]) return FUJI_MONO[mono]
  const film = number(ifd.get(0x1401), true)
  return film === undefined ? undefined : FUJI_FILM[film]
}

function gps(ifd: Ifd, little: boolean): PhotoExif['gps'] {
  const angle = (tag: number) => {
    const f = ifd.get(tag)
    if (!f || f.count < 3) return undefined
    const [d, m, s] = [0, 1, 2].map((i) => number(f, little, i))
    if (d === undefined || m === undefined || s === undefined) return undefined
    return d + m / 60 + s / 3600
  }
  const lat = angle(2)
  const lon = angle(4)
  if (lat === undefined || lon === undefined) return undefined
  const alt = number(ifd.get(6), little)
  return {
    lat: text(ifd.get(1)) === 'S' ? -lat : lat,
    lon: text(ifd.get(3)) === 'W' ? -lon : lon,
    ...(alt !== undefined && { alt: number(ifd.get(5), little) === 1 ? -alt : alt }),
  }
}

function summarize({ little, ifd0, exif, gps: gpsIfd }: Tiff): PhotoExif {
  const positive = (f: Field | undefined) => {
    const n = number(f, little)
    return n !== undefined && Number.isFinite(n) && n > 0 ? n : undefined
  }
  const bias = number(exif.get(0x9204), little)
  const taken = text(exif.get(0x9003))?.match(/^(\d{4}):(\d\d):(\d\d) (\d\d:\d\d:\d\d)/)
  const offset = text(exif.get(0x9011))
  const out: PhotoExif = {
    make: text(ifd0.get(0x010f)),
    model: text(ifd0.get(0x0110)),
    lens: text(exif.get(0xa434)),
    focalLength: positive(exif.get(0x920a)),
    focalLength35: positive(exif.get(0xa405)),
    fNumber: positive(exif.get(0x829d)),
    exposureTime: positive(exif.get(0x829a)),
    iso: positive(exif.get(0x8827)),
    exposureBias: bias !== undefined && Number.isFinite(bias) ? bias : undefined,
    takenAt: taken ? `${taken[1]}-${taken[2]}-${taken[3]}T${taken[4]}${offset?.match(/^[+-]\d\d:\d\d$/) ? offset : ''}` : undefined,
    artist: text(ifd0.get(0x013b)),
    copyright: text(ifd0.get(0x8298)),
    gps: gps(gpsIfd, little),
    filmSimulation: fujiFilm(exif.get(MAKER_NOTE)),
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as PhotoExif
}

// ---- Ghi -------------------------------------------------------------------------------------------------------------

function ascii(s: string): Field {
  const bytes = new TextEncoder().encode(`${s}\0`)
  return { type: ASCII, count: bytes.length, bytes }
}

function integer(type: typeof SHORT | typeof LONG, n: number, little: boolean): Field {
  const bytes = new Uint8Array(TYPE_SIZE[type])
  const v = new DataView(bytes.buffer)
  if (type === SHORT) v.setUint16(0, n, little)
  else v.setUint32(0, n, little)
  return { type, count: 1, bytes }
}

const ifdSize = (ifd: Ifd) =>
  6 + 12 * ifd.size + [...ifd.values()].reduce((sum, f) => sum + (f.bytes.length > 4 ? f.bytes.length + (f.bytes.length & 1) : 0), 0)

function writeTiff({ little, ifd0, exif, gps }: Tiff): Uint8Array {
  const root = new Map(ifd0)
  root.set(EXIF_IFD, integer(LONG, 0, little))
  if (gps.size) root.set(GPS_IFD, integer(LONG, 0, little))
  const atExif = 8 + ifdSize(root)
  const atGps = atExif + ifdSize(exif)
  root.set(EXIF_IFD, integer(LONG, atExif, little))
  if (gps.size) root.set(GPS_IFD, integer(LONG, atGps, little))

  const out = new Uint8Array(atGps + (gps.size ? ifdSize(gps) : 0))
  const v = new DataView(out.buffer)
  out.set(little ? [0x49, 0x49] : [0x4d, 0x4d])
  v.setUint16(2, 42, little)
  v.setUint32(4, 8, little)
  const put = (ifd: Ifd, at: number) => {
    const tags = [...ifd.keys()].sort((a, b) => a - b)
    v.setUint16(at, tags.length, little)
    // Sau các mục là 4 byte "IFD kế tiếp" (= 0, không có), rồi tới vùng chứa giá trị dài hơn 4 byte.
    let data = at + 6 + 12 * tags.length
    tags.forEach((tag, i) => {
      const f = ifd.get(tag)!
      const e = at + 2 + 12 * i
      v.setUint16(e, tag, little)
      v.setUint16(e + 2, f.type, little)
      v.setUint32(e + 4, f.count, little)
      if (f.bytes.length <= 4) out.set(f.bytes, e + 8)
      else {
        v.setUint32(e + 8, data, little)
        out.set(f.bytes, data)
        data += f.bytes.length + (f.bytes.length & 1)
      }
    })
  }
  put(root, 8)
  put(exif, atExif)
  if (gps.size) put(gps, atGps)
  return out
}

function keep(ifd: Ifd, wanted: (tag: number) => boolean): Ifd {
  const out: Ifd = new Map()
  for (const [tag, f] of ifd) {
    if (!wanted(tag) || f.type === 13 || f.bytes.length > MAX_FIELD_BYTES) continue
    if (f.type !== ASCII) out.set(tag, f)
    else {
      // Bỏ khoảng trắng / byte 0 đệm thừa mà nhiều máy ảnh ghi kèm; chuỗi rỗng thì bỏ cả thẻ.
      const s = text(f)
      if (s) out.set(tag, ascii(s))
    }
  }
  return out
}

function rational(type: 5 | 10, n: number, little: boolean): Field {
  const bytes = new Uint8Array(8)
  const v = new DataView(bytes.buffer)
  const den = 1_000_000
  if (type === 10) v.setInt32(0, Math.round(n * den), little)
  else v.setUint32(0, Math.round(n * den), little)
  v.setUint32(4, den, little)
  return { type, count: 1, bytes }
}

/** Khối EXIF đã làm sạch kiểu Lightroom (xem đầu file). */
function clean(t: Tiff): Uint8Array {
  const exif = keep(t.exif, (tag) => !DROP_EXIF.has(tag))
  // Khẩu / tốc dạng APEX: máy không ghi (vd. Sony) thì tính từ FNumber / ExposureTime như Lightroom.
  const f = number(exif.get(0x829d), t.little)
  const time = number(exif.get(0x829a), t.little)
  if (!exif.has(0x9202) && f && f > 0) exif.set(0x9202, rational(5, 2 * Math.log2(f), t.little))
  if (!exif.has(0x9201) && time && time > 0) exif.set(0x9201, rational(10, -Math.log2(time), t.little))
  return writeTiff({ little: t.little, ifd0: keep(t.ifd0, (tag) => KEEP_IFD0.has(tag)), exif, gps: keep(t.gps, () => true) })
}

// ---- Tìm khối EXIF trong file ----------------------------------------------------------------------------------------

const HEAD_BYTES = 256 * 1024
const ascii4 = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3])
const bytesOf = async (blob: Blob, start: number, end: number) => new Uint8Array(await blob.slice(start, end).arrayBuffer())
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0] // "Exif\0\0"
const hasExifHeader = (b: Uint8Array, at = 0) => EXIF_HEADER.every((c, i) => b[at + i] === c)

/** Khối TIFF chứa EXIF của file JPEG / PNG / WebP; null nếu không có. */
async function findTiff(blob: Blob): Promise<Uint8Array | null> {
  const head = await bytesOf(blob, 0, HEAD_BYTES)
  // JPEG: đoạn APP1 bắt đầu bằng "Exif\0\0", nằm trước dữ liệu ảnh.
  if (head[0] === 0xff && head[1] === 0xd8) {
    for (let i = 2; i + 4 <= head.length && head[i] === 0xff; ) {
      const marker = head[i + 1]
      const end = i + 2 + ((head[i + 2] << 8) | head[i + 3])
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0xe1 && hasExifHeader(head, i + 4)) return end <= head.length ? head.slice(i + 10, end) : bytesOf(blob, i + 10, end)
      i = end
    }
    return null
  }
  // PNG: chunk eXIf, nằm trước dữ liệu ảnh (IDAT).
  if (head[0] === 0x89 && ascii4(head, 1).startsWith('PNG')) {
    for (let i = 8; i + 8 <= head.length; ) {
      const size = ((head[i] << 24) | (head[i + 1] << 16) | (head[i + 2] << 8) | head[i + 3]) >>> 0
      const type = ascii4(head, i + 4)
      if (type === 'IDAT' || type === 'IEND') break
      if (type === 'eXIf') return bytesOf(blob, i + 8, i + 8 + size)
      i += 12 + size
    }
    return null
  }
  // WebP: chunk EXIF, thường nằm cuối file (sau dữ liệu ảnh) nên đọc lần lượt từng đầu chunk.
  if (ascii4(head, 0) === 'RIFF' && ascii4(head, 8) === 'WEBP') {
    for (let i = 12; i + 8 <= blob.size; ) {
      const h = i + 8 <= head.length ? head.subarray(i, i + 8) : await bytesOf(blob, i, i + 8)
      const size = (h[4] | (h[5] << 8) | (h[6] << 16) | (h[7] << 24)) >>> 0
      if (ascii4(h, 0) === 'EXIF') {
        const b = await bytesOf(blob, i + 8, i + 8 + size)
        // Một số phần mềm ghi kèm "Exif\0\0" như trong JPEG.
        return hasExifHeader(b) ? b.subarray(6) : b
      }
      i += 8 + size + (size & 1)
    }
  }
  return null
}

const toBase64 = (b: Uint8Array) => btoa(Array.from(b, (c) => String.fromCharCode(c)).join(''))
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/**
 * Đọc EXIF của file ảnh. `exif` = null nếu file không có (ảnh chụp màn hình, ảnh đã bị mạng xã hội xoá EXIF…).
 * Chỉ đọc phần đầu file (và vài đầu chunk với WebP), không đụng tới dữ liệu ảnh.
 */
export async function readExif(blob: Blob): Promise<{ exif: PhotoExif | null; exifData?: string }> {
  try {
    const raw = await findTiff(blob)
    const tiff = raw && parseTiff(raw)
    if (!tiff) return { exif: null }
    return { exif: summarize(tiff), exifData: toBase64(clean(tiff)) }
  } catch {
    // File hỏng phần EXIF: coi như không có, ảnh vẫn nhập bình thường.
    return { exif: null }
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Khối EXIF cho file xuất cỡ `width`×`height`. `exifData`: của ảnh duy nhất trong khung (giữ toàn bộ thông tin chụp như
 * Lightroom); ảnh ghép nhiều ảnh thì không truyền, chỉ ghi kích thước, giờ xuất và không gian màu.
 */
export function exportExif(exifData: string | undefined, width: number, height: number, now = new Date()): Uint8Array {
  const source = exifData ? parseTiff(fromBase64(exifData)) : null
  const t: Tiff = source ?? { little: true, ifd0: new Map(), exif: new Map(), gps: new Map() }
  const { little } = t
  const offset = -now.getTimezoneOffset()
  const date = `${now.getFullYear()}:${pad(now.getMonth() + 1)}:${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  // Thẻ ASCII của EXIF không có dấu: tên app viết không dấu để Windows / trình xem nào cũng đọc đúng.
  t.ifd0.set(0x0131, ascii('Tiem Ghep Anh'))
  t.ifd0.set(0x0132, ascii(date))
  if (!t.exif.has(0x9000)) t.exif.set(0x9000, { type: UNDEFINED, count: 4, bytes: new TextEncoder().encode('0232') })
  t.exif.set(0x9010, ascii(`${offset < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`))
  t.exif.set(0xa001, integer(SHORT, 1, little)) // sRGB
  t.exif.set(0xa002, integer(LONG, width, little))
  t.exif.set(0xa003, integer(LONG, height, little))
  return writeTiff(t)
}
