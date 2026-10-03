import { describe, expect, it } from 'vitest'
import { exportExif, readExif } from '../src/lib/imaging/exif'
import { withExif } from '../src/lib/imaging/metadata'

// ---- Dựng / đọc khối TIFF độc lập với code của app ---------------------------------------------------------------

type Value = string | number[] | Uint8Array | { rational: [number, number][] } | { srational: [number, number][] }
type Entries = Record<number, Value>

/** Khối TIFF như máy ảnh ghi: IFD0 → Exif IFD (+ MakerNote), GPS IFD, IFD1 (thumbnail). */
function makeTiff(little: boolean, ifd0: Entries, exif: Entries = {}, gps: Entries = {}, ifd1: Entries = {}): Uint8Array {
  const buf = new Uint8Array(8192)
  const v = new DataView(buf.buffer)
  buf.set(little ? [0x49, 0x49] : [0x4d, 0x4d])
  v.setUint16(2, 42, little)
  let free = 8
  const alloc = (n: number) => {
    const at = free
    free += n + (n & 1)
    return at
  }
  const write = (entries: Entries, extra: [number, number][] = []): number => {
    const tags = [...Object.entries(entries).map(([t, val]) => [Number(t), val] as const), ...extra.map(([t, n]) => [t, [n] as Value] as const)]
    tags.sort((a, b) => a[0] - b[0])
    const at = alloc(6 + 12 * tags.length)
    v.setUint16(at, tags.length, little)
    tags.forEach(([tag, val], i) => {
      const e = at + 2 + 12 * i
      let type: number
      let bytes: Uint8Array
      if (typeof val === 'string') {
        type = 2
        bytes = new TextEncoder().encode(`${val}\0`)
      } else if (val instanceof Uint8Array) {
        type = 7
        bytes = val
      } else if (Array.isArray(val)) {
        type = extra.some(([t]) => t === tag) || val.some((n) => n > 0xffff) ? 4 : 3
        bytes = new Uint8Array(val.length * (type === 4 ? 4 : 2))
        const d = new DataView(bytes.buffer)
        val.forEach((n, j) => (type === 4 ? d.setUint32(j * 4, n, little) : d.setUint16(j * 2, n, little)))
      } else {
        const signed = 'srational' in val
        const pairs = signed ? val.srational : val.rational
        type = signed ? 10 : 5
        bytes = new Uint8Array(pairs.length * 8)
        const d = new DataView(bytes.buffer)
        pairs.forEach(([n, den], j) => {
          if (signed) d.setInt32(j * 8, n, little)
          else d.setUint32(j * 8, n, little)
          d.setUint32(j * 8 + 4, den, little)
        })
      }
      v.setUint16(e, tag, little)
      v.setUint16(e + 2, type, little)
      v.setUint32(e + 4, type === 2 || type === 7 ? bytes.length : bytes.length / (type === 3 ? 2 : type === 4 ? 4 : 8), little)
      if (bytes.length <= 4) buf.set(bytes, e + 8)
      else {
        const data = alloc(bytes.length)
        buf.set(bytes, data)
        v.setUint32(e + 8, data, little)
      }
    })
    return at
  }
  v.setUint32(4, 8, little)
  // IFD0 phải nằm ở byte 8: dựng các IFD con trước ở chỗ khác rồi mới ghi IFD0 vào đầu.
  free = 2048
  const exifAt = write(exif)
  const gpsAt = Object.keys(gps).length ? write(gps) : 0
  const ifd1At = Object.keys(ifd1).length ? write(ifd1) : 0
  const end = free
  free = 8
  const pointers: [number, number][] = [[0x8769, exifAt]]
  if (gpsAt) pointers.push([0x8825, gpsAt])
  const ifd0At = write(ifd0, pointers)
  if (ifd1At) v.setUint32(ifd0At + 2 + 12 * v.getUint16(ifd0At, little), ifd1At, little)
  return buf.slice(0, end)
}

/** Đọc lại các thẻ của khối TIFF (IFD0, Exif, GPS, có IFD1 không). */
function tags(t: Uint8Array) {
  const v = new DataView(t.buffer, t.byteOffset, t.byteLength)
  const little = t[0] === 0x49
  const ifd = (at: number) => {
    const out = new Map<number, { type: number; count: number; value: number | string }>()
    const n = v.getUint16(at, little)
    for (let i = 0; i < n; i++) {
      const e = at + 2 + 12 * i
      const type = v.getUint16(e + 2, little)
      const count = v.getUint32(e + 4, little)
      const size = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8][type] * count
      const p = size <= 4 ? e + 8 : v.getUint32(e + 8, little)
      const value =
        type === 2 ? new TextDecoder().decode(t.subarray(p, p + count - 1))
        : type === 3 ? v.getUint16(p, little)
        : type === 4 ? v.getUint32(p, little)
        : type === 5 ? v.getUint32(p, little) / v.getUint32(p + 4, little)
        : type === 7 ? new TextDecoder().decode(t.subarray(p, p + count))
        : NaN
      out.set(v.getUint16(e, little), { type, count, value })
    }
    return { out, next: v.getUint32(at + 2 + 12 * n, little) }
  }
  const root = ifd(v.getUint32(4, little))
  const ptr = (tag: number) => root.out.get(tag)?.value as number | undefined
  const val = (m: Map<number, { value: number | string }>) => new Map([...m].map(([k, x]) => [k, x.value]))
  return {
    ifd0: val(root.out),
    exif: ptr(0x8769) ? val(ifd(ptr(0x8769)!).out) : new Map(),
    gps: ptr(0x8825) ? val(ifd(ptr(0x8825)!).out) : new Map(),
    hasIfd1: root.next !== 0,
  }
}

// MakerNote của Fuji: "FUJIFILM", vị trí IFD (tính từ đầu MakerNote), IFD little-endian.
function fujiNote(film: number, saturation = 0x80): Uint8Array {
  const b = new Uint8Array(12 + 2 + 24 + 4)
  const v = new DataView(b.buffer)
  b.set(new TextEncoder().encode('FUJIFILM'))
  v.setUint32(8, 12, true)
  v.setUint16(12, 2, true)
  ;[
    [0x1003, saturation],
    [0x1401, film],
  ].forEach(([tag, n], i) => {
    const e = 14 + 12 * i
    v.setUint16(e, tag, true)
    v.setUint16(e + 2, 3, true)
    v.setUint32(e + 4, 1, true)
    v.setUint16(e + 8, n, true)
  })
  return b
}

const camera = (little: boolean, note = fujiNote(0x800)) =>
  makeTiff(
    little,
    {
      0x010f: 'FUJIFILM',
      0x0110: 'X-T5',
      0x0112: [8], // Orientation
      0x011a: { rational: [[72, 1]] },
      0x0131: 'Digital Camera X-T5 Ver4.31',
      0x0132: '2026:03:28 12:15:26',
      0x010e: '                ', // mô tả rỗng, chỉ có khoảng trắng
      0xc4a5: new Uint8Array(40), // PrintIM
    },
    {
      0x829a: { rational: [[1, 800]] },
      0x829d: { rational: [[28, 10]] },
      0x8827: [500],
      0x9003: '2026:03:28 12:15:26',
      0x9011: '+09:00',
      0x9204: { srational: [[-1, 1]] },
      0x920a: { rational: [[550, 10]] },
      0x927c: note,
      0xa002: [7728],
      0xa003: [5152],
      0xa405: [83],
      0xa431: '4C001221\0\0',
      0xa434: 'XF16-55mmF2.8 R LM WR II\0\0\0\0',
      0x9101: new Uint8Array([1, 2, 3, 0]),
    },
    {
      1: 'S',
      2: { rational: [[33, 1], [52, 1], [3600, 100]] },
      3: 'W',
      4: { rational: [[151, 1], [12, 1], [0, 1]] },
      5: new Uint8Array([0]),
      6: { rational: [[120, 1]] },
    },
    { 0x0103: [6], 0x0201: [1000], 0x0202: [5000] }, // thumbnail
  )

const segment = (marker: number, body: number[] | Uint8Array) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body]
const APP0 = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
const SCAN = [...segment(0xda, [1, 2, 3]), 9, 8, 7, 6, 0xff, 0xd9]
const exifApp1 = (tiff: Uint8Array) => segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff])
const jpeg = (...parts: number[][]) => new Uint8Array([0xff, 0xd8, ...parts.flat()])
const blob = (b: Uint8Array) => new Blob([b as Uint8Array<ArrayBuffer>])

// ---- Đọc ---------------------------------------------------------------------------------------------------------

describe('readExif', () => {
  for (const little of [true, false])
    it(`summarises what was shot (${little ? 'little' : 'big'}-endian)`, async () => {
      const { exif } = await readExif(blob(jpeg(APP0, exifApp1(camera(little)), SCAN)))
      expect(exif).toEqual({
        make: 'FUJIFILM',
        model: 'X-T5',
        lens: 'XF16-55mmF2.8 R LM WR II',
        focalLength: 55,
        focalLength35: 83,
        fNumber: 2.8,
        exposureTime: 1 / 800,
        iso: 500,
        exposureBias: -1,
        takenAt: '2026-03-28T12:15:26+09:00',
        gps: { lat: -(33 + 52 / 60 + 36 / 3600), lon: -(151 + 12 / 60), alt: 120 },
        filmSimulation: 'Classic Neg.',
      })
    })

  it('reads Fuji black & white simulations from Saturation', async () => {
    const { exif } = await readExif(blob(jpeg(exifApp1(camera(true, fujiNote(0, 0x501))), SCAN)))
    expect(exif?.filmSimulation).toBe('Acros + R')
  })

  it('returns null for files without EXIF, or with broken EXIF', async () => {
    expect(await readExif(blob(jpeg(APP0, SCAN)))).toEqual({ exif: null })
    expect(await readExif(blob(jpeg(segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2, 3]), SCAN)))).toEqual({ exif: null })
    expect(await readExif(blob(new Uint8Array([1, 2, 3])))).toEqual({ exif: null })
  })

  it('finds EXIF in PNG (eXIf) and WebP (EXIF chunk at the end)', async () => {
    const tiff = camera(true)
    const png = withExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...ihdr, ...idat]), 'image/png', tiff, 2, 2)
    expect((await readExif(blob(png))).exif?.model).toBe('X-T5')
    const webp = withExif(simpleWebp('VP8 '), 'image/webp', tiff, 2, 2)
    expect((await readExif(blob(webp))).exif?.model).toBe('X-T5')
  })
})

// ---- Làm sạch + ghi khi xuất ---------------------------------------------------------------------------------------

describe('exportExif', () => {
  const now = new Date(2026, 9, 3, 18, 29, 17)

  it('keeps what Lightroom keeps, drops what only fits the camera file', async () => {
    const { exifData } = await readExif(blob(jpeg(exifApp1(camera(false)), SCAN)))
    const t = tags(exportExif(exifData, 2048, 1365, now))
    expect(t.hasIfd1).toBe(false)
    expect(t.ifd0.get(0x0112)).toBeUndefined() // Orientation: pixel đã xoay sẵn
    expect(t.ifd0.get(0xc4a5)).toBeUndefined() // PrintIM
    expect(t.ifd0.get(0x010e)).toBeUndefined() // mô tả rỗng
    expect(t.ifd0.get(0x010f)).toBe('FUJIFILM')
    expect(t.ifd0.get(0x0131)).toBe('Tiem Ghep Anh')
    expect(t.ifd0.get(0x0132)).toBe('2026:10:03 18:29:17')
    expect(t.exif.get(0x927c)).toBeUndefined() // MakerNote
    expect(t.exif.get(0x9101)).toBeUndefined()
    expect(t.exif.get(0xa434)).toBe('XF16-55mmF2.8 R LM WR II')
    expect(t.exif.get(0xa431)).toBe('4C001221')
    expect(t.exif.get(0x9003)).toBe('2026:03:28 12:15:26')
    expect(t.exif.get(0x829d)).toBeCloseTo(2.8)
    expect([t.exif.get(0xa001), t.exif.get(0xa002), t.exif.get(0xa003)]).toEqual([1, 2048, 1365])
    expect(t.gps.get(1)).toBe('S')
  })

  it('writes only size, export time and colour space for a collage', () => {
    const t = tags(exportExif(undefined, 3000, 2000, now))
    expect([...t.ifd0.keys()].sort((a, b) => a - b)).toEqual([0x0131, 0x0132, 0x8769])
    expect([...t.exif.keys()].sort((a, b) => a - b)).toEqual([0x9000, 0x9010, 0xa001, 0xa002, 0xa003])
    expect(t.exif.get(0x9000)).toBe('0232')
    expect(t.exif.get(0x9010)).toMatch(/^[+-]\d\d:\d\d$/)
    expect(t.gps.size).toBe(0)
  })

  it('round-trips through readExif', async () => {
    const { exifData } = await readExif(blob(jpeg(exifApp1(camera(true)), SCAN)))
    const again = await readExif(blob(withExif(jpeg(APP0, SCAN), 'image/jpeg', exportExif(exifData, 10, 10, now), 10, 10)))
    expect(again.exif).toMatchObject({ model: 'X-T5', iso: 500, takenAt: '2026-03-28T12:15:26+09:00' })
    expect(again.exif?.filmSimulation).toBeUndefined() // MakerNote đã bỏ, như bản Lightroom
  })
})

// ---- Gắn vào file ----------------------------------------------------------------------------------------------------

const ihdr = [0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0, 1, 2, 3, 4]
const idat = [0, 0, 0, 1, 0x49, 0x44, 0x41, 0x54, 7, 1, 2, 3, 4, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]

function simpleWebp(kind: 'VP8 ' | 'VP8L', payload = [1, 2, 3, 4, 5, 6]): Uint8Array {
  const body = [...new TextEncoder().encode(`WEBP${kind}`), payload.length, 0, 0, 0, ...payload]
  const size = body.length
  return new Uint8Array([...new TextEncoder().encode('RIFF'), size & 0xff, size >> 8, 0, 0, ...body])
}

describe('withExif', () => {
  const tiff = new Uint8Array([0x49, 0x49, 42, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0])

  it('puts APP1 right after JFIF and leaves the image data byte for byte', () => {
    const out = withExif(jpeg(APP0, SCAN), 'image/jpeg', tiff, 1, 1)
    expect(out).toEqual(jpeg(APP0, exifApp1(tiff), SCAN))
    expect(withExif(jpeg(SCAN), 'image/jpeg', tiff, 1, 1)).toEqual(jpeg(exifApp1(tiff), SCAN))
    // Đã có EXIF thì không thêm lần nữa.
    expect(withExif(out, 'image/jpeg', tiff, 1, 1)).toEqual(out)
  })

  it('adds a PNG eXIf chunk with a valid CRC', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...ihdr, ...idat])
    const out = withExif(png, 'image/png', tiff, 2, 2)
    const at = 8 + ihdr.length
    expect(new TextDecoder().decode(out.subarray(at + 4, at + 8))).toBe('eXIf')
    expect([...out.subarray(at + 8, at + 8 + tiff.length)]).toEqual([...tiff])
    expect(new DataView(out.buffer).getUint32(at + 8 + tiff.length)).toBe(crc(out.subarray(at + 4, at + 8 + tiff.length)))
    expect(out.subarray(at + 12 + tiff.length)).toEqual(new Uint8Array(idat))
  })

  it('turns a simple WebP into VP8X with the canvas size and an EXIF chunk', () => {
    const out = withExif(simpleWebp('VP8 '), 'image/webp', tiff, 3000, 2000)
    const v = new DataView(out.buffer)
    const tag = (at: number) => new TextDecoder().decode(out.subarray(at, at + 4))
    expect(tag(12)).toBe('VP8X')
    expect(out[20]).toBe(0x08)
    expect(out[24] | (out[25] << 8) | (out[26] << 16)).toBe(2999)
    expect(out[27] | (out[28] << 8) | (out[29] << 16)).toBe(1999)
    expect(tag(30)).toBe('VP8 ')
    expect(tag(44)).toBe('EXIF')
    expect(v.getUint32(4, true)).toBe(out.length - 8)
    // Đã có VP8X + EXIF thì giữ nguyên.
    expect(withExif(out, 'image/webp', tiff, 3000, 2000)).toEqual(out)
  })

  it('keeps the alpha flag of a lossless WebP', () => {
    const out = withExif(simpleWebp('VP8L', [0x2f, 0, 0, 0, 0x10, 0]), 'image/webp', tiff, 1, 1)
    expect(out[20]).toBe(0x18)
  })
})

function crc(b: Uint8Array): number {
  let c = ~0
  for (const x of b) {
    c ^= x
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return ~c >>> 0
}
