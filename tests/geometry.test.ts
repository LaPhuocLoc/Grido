import { describe, expect, it } from 'vitest'
import { DEFAULT_ADJUST, placeImage as place } from '../src/lib/geometry'

// -0 và 0 là một với người dùng; bỏ dấu để so sánh bằng giá trị.
const placeImage = (...args: Parameters<typeof place>) =>
  Object.fromEntries(Object.entries(place(...args)).map(([k, v]) => [k, v + 0]))

describe('placeImage', () => {
  it('covers the cell and centres the overflow', () => {
    expect(placeImage(400, 200, 100, 100, DEFAULT_ADJUST)).toEqual({ dw: 200, dh: 100, left: -50, top: 0, scale: 0.5 })
  })

  it('applies zoom and the crop anchor', () => {
    expect(placeImage(400, 200, 100, 100, { ...DEFAULT_ADJUST, zoom: 2, cx: 0, cy: 1 })).toEqual({
      dw: 400,
      dh: 200,
      left: 0,
      top: -100,
      scale: 1,
    })
  })

  it('swaps width and height for a 90° rotation', () => {
    expect(placeImage(400, 200, 100, 100, { ...DEFAULT_ADJUST, rot: 90 })).toEqual({ dw: 100, dh: 200, left: 0, top: -50, scale: 0.5 })
  })

  it('reports upscaling when the photo is smaller than the cell', () => {
    expect(placeImage(50, 50, 200, 100, DEFAULT_ADJUST).scale).toBe(4)
  })
})
