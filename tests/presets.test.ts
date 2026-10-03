import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRESET_ID,
  MAX_CANVAS,
  MIN_CANVAS,
  orientationOf,
  orientCanvas,
  PLATFORMS,
  POPULAR_PRESETS,
  presetOfSize,
  RETIRED_PRESETS,
  SIZE_PRESETS,
} from '../src/lib/presets'

describe('frame presets', () => {
  it('have unique ids, none reusing a retired one', () => {
    const ids = SIZE_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => id in RETIRED_PRESETS)).toEqual([])
    expect(ids).toContain(DEFAULT_PRESET_ID)
  })

  it('cover exactly Facebook, Instagram and TikTok, in that order', () => {
    expect(PLATFORMS.map((p) => p.id)).toEqual(['facebook', 'instagram', 'tiktok'])
    for (const { id } of PLATFORMS) expect(SIZE_PRESETS.some((p) => p.platform === id)).toBe(true)
  })

  it('"Phổ biến" points at real frames with the sizes users know', () => {
    const size = (id: string) => SIZE_PRESETS.find((p) => p.id === id)
    expect(POPULAR_PRESETS.map((p) => [p.label, size(p.id)?.width, size(p.id)?.height])).toEqual([
      ['Bài đăng Instagram', 1080, 1350],
      ['Ảnh dọc Facebook', 1365, 2048],
      ['Ảnh ngang Facebook', 2048, 1365],
      ['Tin story', 1080, 1920],
    ])
  })

  it.each(SIZE_PRESETS)('$id: the ratio label matches its pixel size', (p) => {
    const [a, b] = p.ratio.split(':').map(Number)
    // Nhãn là tên gọi quen thuộc của tỉ lệ (vd 1.91:1 cho 1200×630), cho phép lệch dưới 1%.
    expect(Math.abs(p.width / p.height / (a / b) - 1)).toBeLessThan(0.01)
    expect(Math.min(p.width, p.height)).toBeGreaterThanOrEqual(MIN_CANVAS)
    expect(Math.max(p.width, p.height)).toBeLessThanOrEqual(MAX_CANVAS)
  })
})

describe('frame orientation', () => {
  it('reads portrait, square and landscape off the pixel size', () => {
    expect(orientationOf({ width: 1080, height: 1350 })).toBe('portrait')
    expect(orientationOf({ width: 1080, height: 1080 })).toBe('square')
    expect(orientationOf({ width: 6000, height: 4000 })).toBe('landscape')
  })

  it('swaps the sides between portrait and landscape, keeping every pixel', () => {
    expect(orientCanvas({ width: 6000, height: 4000 }, 'portrait')).toEqual({ width: 4000, height: 6000 })
    expect(orientCanvas({ width: 1080, height: 1920 }, 'landscape')).toEqual({ width: 1920, height: 1080 })
    expect(orientCanvas({ width: 1080, height: 1920 }, 'portrait')).toEqual({ width: 1080, height: 1920 })
  })

  it('squares on the short side and leaves a square as 4:5', () => {
    expect(orientCanvas({ width: 6000, height: 4000 }, 'square')).toEqual({ width: 4000, height: 4000 })
    expect(orientCanvas({ width: 1080, height: 1080 }, 'portrait')).toEqual({ width: 1080, height: 1350 })
    expect(orientCanvas({ width: 1080, height: 1080 }, 'landscape')).toEqual({ width: 1350, height: 1080 })
    // Biết khung trước lúc vuông dài gấp mấy thì trả lại đúng cỡ đó.
    expect(orientCanvas({ width: 1365, height: 1365 }, 'landscape', 2048 / 1365)).toEqual({ width: 2048, height: 1365 })
  })

  it('never grows past the largest frame the app can export', () => {
    expect(orientCanvas({ width: MAX_CANVAS, height: MAX_CANVAS }, 'portrait')).toEqual({ width: MAX_CANVAS / 1.25, height: MAX_CANVAS })
    expect(orientCanvas({ width: MIN_CANVAS, height: 900 }, 'square')).toEqual({ width: MIN_CANVAS, height: MIN_CANVAS })
  })

  it('finds the ready-made frame of a size, on the same platform when it can', () => {
    expect(presetOfSize({ width: 1080, height: 1080 })?.id).toBe('ig-square')
    expect(presetOfSize({ width: 1080, height: 1080 }, 'facebook')?.id).toBe('fb-post-square')
    expect(presetOfSize({ width: 1350, height: 1080 })).toBeUndefined()
  })
})
