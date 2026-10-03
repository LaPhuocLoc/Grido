import { describe, expect, it } from 'vitest'
import { justify, searchPhotos } from '../src/lib/libraryView'
import { photo } from './helpers/bridge'

describe('searchPhotos', () => {
  const photos = [
    photo('a', { name: 'DSCF3377', path: 'kimono sakura/DSCF3377.JPG', exif: { make: 'FUJIFILM', model: 'X-T5', filmSimulation: 'Classic Neg.', takenAt: '2026-03-28T12:15:41+09:00' } }),
    photo('b', { name: 'DSC00441', path: 'Đảo Sado/DSC00441.JPG', exif: { make: 'SONY', model: 'ILCE-7M5', lens: '20-200mm F3.5-6.3 DG', takenAt: '2026-09-18T21:31:29+09:00' } }),
    photo('c', { name: 'Ảnh chụp màn hình', path: 'Ảnh chụp màn hình.png', exif: null }),
  ]
  const ids = (q: string) => searchPhotos(photos, q).map((p) => p.id)

  it('finds by file name, folder, camera, lens and film simulation, ignoring accents and case', () => {
    expect(ids('dscf33')).toEqual(['a'])
    expect(ids('sakura')).toEqual(['a'])
    expect(ids('dao sado')).toEqual(['b'])
    expect(ids('x-t5')).toEqual(['a'])
    expect(ids('20-200')).toEqual(['b'])
    expect(ids('classic neg')).toEqual(['a'])
    expect(ids('man hinh')).toEqual(['c'])
  })

  it('finds by capture date in either order, or by month', () => {
    expect(ids('28/03/2026')).toEqual(['a'])
    expect(ids('2026-09-18')).toEqual(['b'])
    expect(ids('09/2026')).toEqual(['b'])
  })

  it('needs every word to match; an empty query keeps everything', () => {
    expect(ids('sony sakura')).toEqual([])
    expect(ids('  ')).toEqual(['a', 'b', 'c'])
  })
})

describe('justify', () => {
  it('fills each row to the exact width, keeping every aspect ratio', () => {
    const aspects = [1.5, 0.667, 1.5, 1, 1.5, 1.5, 0.75]
    const rows = justify(aspects, 300, 100, 6)
    for (const row of rows.slice(0, -1)) {
      const used = aspects.slice(row.start, row.start + row.count).reduce((sum, a) => sum + a * row.height, 0) + 6 * (row.count - 1)
      expect(used).toBeCloseTo(300, 6)
      expect(row.height).toBeLessThanOrEqual(100)
    }
    expect(rows.map((r) => r.count).reduce((a, b) => a + b)).toBe(aspects.length)
  })

  it('leaves a short last row at the target height instead of blowing it up', () => {
    const rows = justify([1.5, 1.5, 1.5, 1], 300, 100, 6)
    expect(rows.at(-1)).toEqual({ start: 2, count: 2, height: 100 })
  })

  it('keeps extreme panoramas from flattening a whole row', () => {
    const [row] = justify([12, 1, 1], 300, 100, 6)
    expect(row.height).toBeGreaterThan(50)
  })
})
