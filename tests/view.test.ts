import { describe, expect, it } from 'vitest'
import { clampPan, clampViewZoom, MAX_VIEW_ZOOM, MIN_VIEW_ZOOM, panLimit, zoomByWheel } from '../src/lib/view'

describe('workspace zoom', () => {
  it('zooms in when the wheel is rolled up and out when rolled down', () => {
    expect(zoomByWheel(1, -100)).toBeGreaterThan(1)
    expect(zoomByWheel(1, 100)).toBeLessThan(1)
  })

  it('never goes past the smallest or largest zoom level', () => {
    expect(zoomByWheel(MAX_VIEW_ZOOM, -5000)).toBe(MAX_VIEW_ZOOM)
    expect(zoomByWheel(MIN_VIEW_ZOOM, 5000)).toBe(MIN_VIEW_ZOOM)
    expect(clampViewZoom(10)).toBe(MAX_VIEW_ZOOM)
    expect(clampViewZoom(0)).toBe(MIN_VIEW_ZOOM)
  })

  it('snaps back to exactly fit when the wheel lands close to it', () => {
    expect(zoomByWheel(1.02, 5)).toBe(1)
  })
})

describe('workspace panning', () => {
  it('does not allow panning while the whole canvas fits in view', () => {
    expect(panLimit(500, 800)).toBe(0)
    expect(clampPan(120, 500, 800)).toBe(0)
  })

  it('lets the canvas be pushed just far enough to reach each edge, plus a small margin', () => {
    expect(panLimit(1200, 800)).toBe(224)
    expect(clampPan(900, 1200, 800)).toBe(224)
    expect(clampPan(-900, 1200, 800)).toBe(-224)
    expect(clampPan(50, 1200, 800)).toBe(50)
  })
})
