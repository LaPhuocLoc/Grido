import { describe, expect, it } from 'vitest'
import { resample, type Raster } from '../src/lib/imaging/resample'

function raster(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): Raster {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4)
  return { data, width, height }
}

const px = (r: Raster, x: number, y: number) => [...r.data.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 4)]

describe('resample', () => {
  it('returns a raster of the requested size', () => {
    const out = resample(raster(20, 10, () => [10, 20, 30, 255]), 7, 3)
    expect([out.width, out.height, out.data.length]).toEqual([7, 3, 7 * 3 * 4])
  })

  it('copies instead of aliasing when the size is unchanged', () => {
    const src = raster(4, 4, () => [1, 2, 3, 255])
    const out = resample(src, 4, 4)
    expect(out.data).toEqual(src.data)
    expect(out.data.buffer).not.toBe(src.data.buffer)
  })

  it('keeps every flat grey level exactly when downscaling', () => {
    for (let v = 0; v < 256; v++) {
      const out = resample(raster(9, 9, () => [v, v, v, 255]), 4, 4)
      expect(px(out, 0, 0), `level ${v}`).toEqual([v, v, v, 255])
      expect(px(out, 2, 3), `level ${v}`).toEqual([v, v, v, 255])
    }
  })

  it('keeps flat colour exactly when upscaling', () => {
    const out = resample(raster(3, 3, () => [200, 100, 50, 255]), 10, 10)
    expect(px(out, 5, 5)).toEqual([200, 100, 50, 255])
    expect(px(out, 0, 9)).toEqual([200, 100, 50, 255])
  })

  // Như Lightroom / Photoshop: trộn trên giá trị sRGB nên 50% đen + 50% trắng ra xám 128 (trộn theo ánh sáng thật sẽ ra 188,
  // làm chi tiết nhỏ sáng và nhạt đi so với bản Lightroom xuất).
  it('averages fine detail on sRGB values, like Lightroom', () => {
    const out = resample(raster(64, 4, (x) => (x % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255])), 8, 1)
    for (let x = 1; x < 7; x++) {
      const [r] = px(out, x, 0)
      expect(Math.abs(r - 128), `pixel ${x} = ${r}`).toBeLessThanOrEqual(2)
    }
  })

  it('does not let the colour of fully transparent pixels bleed into visible ones', () => {
    const out = resample(raster(16, 4, (x) => (x < 8 ? [255, 0, 0, 255] : [0, 255, 0, 0])), 4, 1)
    for (let x = 0; x < 4; x++) {
      const [r, g, , a] = px(out, x, 0)
      if (a > 0) expect([r, g], `pixel ${x}`).toEqual([255, 0])
    }
    expect(px(out, 0, 0)[3]).toBe(255)
    expect(px(out, 3, 0)[3]).toBe(0)
  })

  it('upscales an edge without leaving the 0–255 range or reversing direction', () => {
    const out = resample(raster(2, 1, (x) => (x ? [255, 255, 255, 255] : [0, 0, 0, 255])), 8, 1)
    const row = Array.from({ length: 8 }, (_, x) => px(out, x, 0)[0])
    expect(row[0]).toBe(0)
    expect(row[7]).toBe(255)
    for (let x = 1; x < 8; x++) expect(row[x], row.join(',')).toBeGreaterThanOrEqual(row[x - 1])
  })
})
