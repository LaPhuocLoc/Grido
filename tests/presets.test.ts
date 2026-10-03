import { describe, expect, it } from 'vitest'
import { DEFAULT_PRESET_ID, MAX_CANVAS, MIN_CANVAS, PLATFORMS, POPULAR_PRESETS, RETIRED_PRESETS, SIZE_PRESETS } from '../src/lib/presets'

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
