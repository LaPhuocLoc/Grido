import { describe, expect, it } from 'vitest'
import { nextHint, nextStep } from '../src/lib/onboarding'

describe('next step dot', () => {
  it('points at the photo library until there is a photo in the frame', () => {
    expect(nextStep({ done: false, cells: 0, visited: [] })).toBe('library')
    expect(nextStep({ done: false, cells: 0, visited: ['layout', 'text'] })).toBe('library')
  })

  it('walks the editing tabs in rail order, then the export button', () => {
    expect(nextStep({ done: false, cells: 4, visited: [] })).toBe('layout')
    expect(nextStep({ done: false, cells: 4, visited: ['layout'] })).toBe('size')
    expect(nextStep({ done: false, cells: 4, visited: ['layout', 'text'] })).toBe('size')
    expect(nextStep({ done: false, cells: 4, visited: ['layout', 'size', 'style'] })).toBe('text')
    expect(nextStep({ done: false, cells: 4, visited: ['layout', 'size', 'style', 'text'] })).toBe('export')
  })

  it('skips the layout tab for a single photo', () => {
    expect(nextStep({ done: false, cells: 1, visited: [] })).toBe('size')
  })

  it('is gone for good after the first export', () => {
    expect(nextStep({ done: true, cells: 0, visited: [] })).toBeNull()
    expect(nextStep({ done: true, cells: 4, visited: [] })).toBeNull()
  })
})

describe('stage hints', () => {
  const base = { cells: 4, photos: 4, texts: 0, canPan: true, seen: [] as string[] }

  it('shows one hint at a time, in order, and never one already done', () => {
    expect(nextHint(base)).toBe('pan')
    expect(nextHint({ ...base, seen: ['pan'] })).toBe('zoom')
    expect(nextHint({ ...base, seen: ['pan', 'zoom'] })).toBe('swap')
    expect(nextHint({ ...base, seen: ['pan', 'zoom', 'swap'] })).toBe('resize')
    expect(nextHint({ ...base, seen: ['pan', 'zoom', 'swap', 'resize'] })).toBeNull()
  })

  it('only suggests what the collage allows', () => {
    // Ảnh vừa khít ô thì kéo không dịch được; một ảnh thì không có ô nào khác để đổi chỗ hay đổi cỡ.
    expect(nextHint({ ...base, cells: 1, photos: 1, canPan: false })).toBe('zoom')
    expect(nextHint({ ...base, cells: 1, photos: 1, canPan: false, seen: ['zoom'] })).toBeNull()
    expect(nextHint({ ...base, cells: 0, photos: 0 })).toBeNull()
  })

  it('points at the library first while the layout still has empty cells', () => {
    expect(nextHint({ ...base, photos: 1 })).toBe('fill')
    // Bố cục chưa có ảnh nào thì chưa có gì để kéo hay phóng.
    expect(nextHint({ ...base, photos: 0, canPan: false })).toBe('fill')
    expect(nextHint({ ...base, photos: 0, canPan: false, seen: ['fill'] })).toBe('resize')
    expect(nextHint({ ...base, photos: 1, seen: ['fill'] })).toBe('pan')
  })

  it('teaches marquee selection first once there are several captions', () => {
    expect(nextHint({ ...base, texts: 2 })).toBe('marquee')
    expect(nextHint({ ...base, texts: 2, seen: ['marquee'] })).toBe('pan')
    expect(nextHint({ ...base, texts: 1 })).toBe('pan')
  })
})
