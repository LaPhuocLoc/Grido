import { describe, expect, it } from 'vitest'
import { sourceCrop } from '../src/lib/imaging/crop'
import { jpegSubsampling, pngWithSrgb, withIccFrom } from '../src/lib/imaging/metadata'
import { sharpen, sharpenFactor } from '../src/lib/imaging/sharpen'
import { DEFAULT_ADJUST } from '../src/lib/geometry'

describe('sourceCrop', () => {
  const cell = { w: 100, h: 100 }

  it('takes the centred square of a landscape photo for a square cell', () => {
    expect(sourceCrop(4000, 2000, cell, DEFAULT_ADJUST)).toEqual({ sx: 1000, sy: 0, sw: 2000, sh: 2000 })
  })

  it('narrows the crop when zoomed and follows the crop anchor', () => {
    expect(sourceCrop(4000, 2000, cell, { ...DEFAULT_ADJUST, zoom: 2, cx: 0, cy: 1 })).toEqual({ sx: 0, sy: 1000, sw: 1000, sh: 1000 })
  })

  it('works in rotated coordinates for a photo turned 90°', () => {
    expect(sourceCrop(4000, 2000, cell, { ...DEFAULT_ADJUST, rot: 90 })).toEqual({ sx: 0, sy: 1000, sw: 2000, sh: 2000 })
  })

  it('keeps the whole photo when the frame is off by less than an output pixel, like Lightroom', () => {
    expect(sourceCrop(7008, 4672, { w: 2048, h: 1365 }, DEFAULT_ADJUST)).toEqual({ sx: 0, sy: 0, sw: 7008, sh: 4672 })
    expect(sourceCrop(4672, 7008, { w: 900, h: 1350 }, DEFAULT_ADJUST)).toEqual({ sx: 0, sy: 0, sw: 4672, sh: 7008 })
  })

  it('never reaches outside the photo, whatever the rounding', () => {
    for (const iw of [997, 1001, 3333])
      for (const cx of [0, 0.333, 1])
        for (const zoom of [1, 1.37, 4]) {
          const c = sourceCrop(iw, 751, { w: 313, h: 217 }, { ...DEFAULT_ADJUST, cx, cy: cx, zoom })
          expect(c.sx >= 0 && c.sy >= 0 && c.sw >= 1 && c.sh >= 1, JSON.stringify({ iw, cx, zoom, c })).toBe(true)
          expect(c.sx + c.sw <= iw && c.sy + c.sh <= 751, JSON.stringify({ iw, cx, zoom, c })).toBe(true)
        }
  })
})

describe('sharpen', () => {
  const row = (values: number[], alpha = 255) => ({
    data: new Uint8ClampedArray(values.flatMap((v) => [v, v, v, alpha])),
    width: values.length,
    height: 1,
  })
  const greys = (r: { data: Uint8ClampedArray }) => [...r.data].filter((_, i) => i % 4 === 0)

  it('leaves flat areas untouched', () => {
    expect(greys(sharpen(row([90, 90, 90, 90]), 1))).toEqual([90, 90, 90, 90])
  })

  it('adds contrast on both sides of a mid-tone edge in proportion to the amount', () => {
    expect(greys(sharpen(row([100, 100, 100, 200, 200]), 1))).toEqual([100, 100, 81, 215, 200])
    expect(greys(sharpen(row([100, 100, 100, 200, 200]), 0.5))).toEqual([100, 100, 90, 208, 200])
  })

  // Như Lightroom: tăng gấp ba thì quầng sáng ở mép gắt đậm thêm ít hơn gấp ba.
  it('reins in the halo on a very hard edge', () => {
    const [, , dark] = greys(sharpen(row([70, 70, 70, 190, 190]), 1))
    const [, , darker] = greys(sharpen(row([70, 70, 70, 190, 190]), 3))
    expect(70 - darker).toBeLessThan(0.9 * 3 * (70 - dark))
    expect(darker).toBeLessThan(dark)
  })

  // Như Lightroom: vùng tối không bị đẩy noise lên, vùng gần trắng không bị cháy.
  it('leaves deep shadows and near-white highlights alone', () => {
    expect(greys(sharpen(row([10, 10, 10, 30, 30]), 1))).toEqual([10, 10, 10, 30, 30])
    expect(greys(sharpen(row([235, 235, 250, 250]), 1))).toEqual([235, 235, 250, 250])
  })

  it('does nothing at amount 0', () => {
    expect(greys(sharpen(row([0, 255, 0, 255]), 0))).toEqual([0, 255, 0, 255])
  })

  it('clips instead of wrapping around at black and white', () => {
    expect(greys(sharpen(row([0, 0, 255, 255]), 3))).toEqual([0, 0, 255, 255])
  })

  it('sharpens along columns as well as rows', () => {
    const col = { data: new Uint8ClampedArray([100, 100, 200, 200].flatMap((v) => [v, v, v, 255])), width: 1, height: 4 }
    expect(greys(sharpen(col, 1))).toEqual([100, 81, 215, 200])
  })

  it('keeps transparency as it was', () => {
    const out = sharpen(row([100, 100, 200, 200], 128), 1)
    expect([...out.data].filter((_, i) => i % 4 === 3)).toEqual([128, 128, 128, 128])
  })
})

describe('sharpenFactor', () => {
  it('skips cells that are enlarged or kept at their own size, so a sharpened 2048px file is not sharpened twice', () => {
    for (const edge of [2048, 7728]) {
      expect(sharpenFactor(0.5, edge)).toBe(0)
      expect(sharpenFactor(1, edge)).toBe(0)
    }
  })

  it('sharpens a camera original fully from 1.5× down', () => {
    expect(sharpenFactor(1.25, 7728)).toBeCloseTo(0.5)
    expect(sharpenFactor(1.5, 7728)).toBe(1)
    expect(sharpenFactor(5, 7728)).toBe(1)
  })

  // Bản 2048 của Lightroom đã làm nét sẵn: thu về 1350 chỉ cần khoảng nửa mức, thu nhỏ nhiều mới cần gần đủ.
  it('sharpens an already exported file only partly, more as it is shrunk further', () => {
    expect(sharpenFactor(1.025, 2048)).toBeCloseTo(0.21, 2)
    expect(sharpenFactor(1.05, 2048)).toBeCloseTo(0.43, 2)
    expect(sharpenFactor(2048 / 1350, 2048)).toBeCloseTo(0.5, 1)
    expect(sharpenFactor(3, 2048)).toBeCloseTo(0.72, 2)
    expect(sharpenFactor(6, 2048)).toBe(1)
  })
})

/* ── JPEG / PNG dựng tay cho gọn: chỉ cần đúng cấu trúc đoạn (segment / chunk). ── */

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
const SOI = [0xff, 0xd8]
const APP0 = seg(0xe0, [...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0])
const icc = (index: number, count: number, data: number[]) => seg(0xe2, [...ascii('ICC_PROFILE\0'), index, count, ...data])
const DQT = seg(0xdb, [0, 1, 2, 3])
const sof = (y: number) => seg(0xc0, [8, 0, 16, 0, 16, 3, 1, y, 0, 2, 0x11, 1, 3, 0x11, 1])
const SCAN = [...seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]), 0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]
const jpeg = (...parts: number[][]) => new Uint8Array(parts.flat())

describe('withIccFrom', () => {
  it('copies the colour profile to just after the JFIF header', () => {
    const source = jpeg(SOI, APP0, icc(1, 1, [9, 8, 7]), DQT, sof(0x22), SCAN)
    const target = jpeg(SOI, APP0, DQT, sof(0x11), SCAN)
    expect(withIccFrom(source, target)).toEqual(jpeg(SOI, APP0, icc(1, 1, [9, 8, 7]), DQT, sof(0x11), SCAN))
  })

  it('puts the profile right after the start marker when there is no JFIF header', () => {
    const source = jpeg(SOI, APP0, icc(1, 1, [5]), DQT, sof(0x22), SCAN)
    const target = jpeg(SOI, DQT, sof(0x11), SCAN)
    expect(withIccFrom(source, target)).toEqual(jpeg(SOI, icc(1, 1, [5]), DQT, sof(0x11), SCAN))
  })

  it('keeps a profile that is split over several segments in order', () => {
    const source = jpeg(SOI, APP0, icc(1, 2, [1, 1]), icc(2, 2, [2, 2]), DQT, sof(0x22), SCAN)
    const target = jpeg(SOI, APP0, DQT, sof(0x11), SCAN)
    expect(withIccFrom(source, target)).toEqual(jpeg(SOI, APP0, icc(1, 2, [1, 1]), icc(2, 2, [2, 2]), DQT, sof(0x11), SCAN))
  })

  it('returns the target unchanged when the source has no profile', () => {
    const target = jpeg(SOI, APP0, DQT, sof(0x11), SCAN)
    expect(withIccFrom(jpeg(SOI, APP0, DQT, sof(0x22), SCAN), target)).toEqual(target)
  })

  it('does not add a second profile to a file that already has one', () => {
    const target = jpeg(SOI, APP0, icc(1, 1, [4]), DQT, sof(0x11), SCAN)
    expect(withIccFrom(jpeg(SOI, APP0, icc(1, 1, [9]), DQT, sof(0x22), SCAN), target)).toEqual(target)
  })

  it('leaves data that is not a JPEG alone', () => {
    const junk = new Uint8Array([1, 2, 3, 4])
    expect(withIccFrom(jpeg(SOI, APP0, icc(1, 1, [9]), DQT, sof(0x22), SCAN), junk)).toEqual(junk)
    expect(withIccFrom(junk, jpeg(SOI, DQT, sof(0x11), SCAN))).toEqual(jpeg(SOI, DQT, sof(0x11), SCAN))
  })
})

describe('jpegSubsampling', () => {
  it('reads full-resolution colour as 4:4:4 and halved colour as 4:2:0', () => {
    expect(jpegSubsampling(jpeg(SOI, APP0, DQT, sof(0x11), SCAN))).toBe('4:4:4')
    expect(jpegSubsampling(jpeg(SOI, APP0, DQT, sof(0x22), SCAN))).toBe('4:2:0')
    expect(jpegSubsampling(new Uint8Array([1, 2, 3]))).toBeNull()
  })
})

describe('pngWithSrgb', () => {
  const chunk = (type: string, data: number[], crc = [0, 0, 0, 0]) => [0, 0, 0, data.length, ...ascii(type), ...data, ...crc]
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const IHDR = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])
  const IDAT = chunk('IDAT', [1, 2, 3])
  const IEND = chunk('IEND', [])
  // Chunk sRGB chuẩn (rendering intent 0) kèm CRC đúng — dãy byte này cố định trong mọi file PNG gắn sRGB.
  const SRGB = [0, 0, 0, 1, 0x73, 0x52, 0x47, 0x42, 0, 0xae, 0xce, 0x1c, 0xe9]
  const png = (...parts: number[][]) => new Uint8Array(parts.flat())

  it('tags the image as sRGB right after the header', () => {
    expect(pngWithSrgb(png(SIG, IHDR, IDAT, IEND))).toEqual(png(SIG, IHDR, SRGB, IDAT, IEND))
  })

  it('leaves a PNG that already declares its colour space alone', () => {
    const tagged = png(SIG, IHDR, SRGB, IDAT, IEND)
    expect(pngWithSrgb(tagged)).toEqual(tagged)
    const profiled = png(SIG, IHDR, chunk('iCCP', [1, 2]), IDAT, IEND)
    expect(pngWithSrgb(profiled)).toEqual(profiled)
  })

  it('leaves data that is not a PNG alone', () => {
    expect(pngWithSrgb(new Uint8Array([1, 2, 3]))).toEqual(new Uint8Array([1, 2, 3]))
  })
})
