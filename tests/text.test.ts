import { describe, expect, it } from 'vitest'
import { lineStart, normalizeText, snapAngle, wrapLines } from '../src/lib/text'

/** Mỗi ký tự rộng 10px — đủ để kiểm tra chỗ ngắt dòng mà không cần font thật. */
const measure = (s: string) => s.length * 10

describe('wrapLines', () => {
  it('only breaks at typed newlines when the box has no fixed width', () => {
    expect(wrapLines('Gió Mây\nĐà Lạt', null, measure)).toEqual(['Gió Mây', 'Đà Lạt'])
  })

  it('moves a word that does not fit down to the next line', () => {
    expect(wrapLines('Thêm tiêu đề', 80, measure)).toEqual(['Thêm', 'tiêu đề'])
  })

  it('keeps words on one line when they fit exactly', () => {
    expect(wrapLines('Thêm tiêu', 90, measure)).toEqual(['Thêm tiêu'])
  })

  it('wraps each typed line on its own and keeps empty lines', () => {
    expect(wrapLines('một hai\n\nba bốn', 40, measure)).toEqual(['một', 'hai', '', 'ba', 'bốn'])
  })

  it('splits a single word that is wider than the box', () => {
    expect(wrapLines('abcdefgh', 30, measure)).toEqual(['abc', 'def', 'gh'])
  })

  it('never returns an empty chunk when the box is narrower than one character', () => {
    expect(wrapLines('abc', 5, measure)).toEqual(['a', 'b', 'c'])
  })
})

describe('lineStart', () => {
  it('places the left edge of a line inside the box according to the alignment', () => {
    expect(lineStart('left', 200, 80)).toBe(-100)
    expect(lineStart('center', 200, 80)).toBe(-40)
    expect(lineStart('right', 200, 80)).toBe(20)
  })
})

describe('normalizeText', () => {
  it('fills in the newer style fields for a caption saved by an older version', () => {
    const old = { id: 't1', text: 'Đà Lạt', x: 0.3, y: 0.7, size: 8, color: '#fff', font: 'round', bold: true, shadow: true }
    expect(normalizeText(old)).toEqual({
      ...old,
      italic: false,
      underline: false,
      strike: false,
      align: 'center',
      rotation: 0,
      width: null,
    })
  })

  it('keeps the style fields that are already there', () => {
    const item = normalizeText({ id: 't1', italic: true, align: 'left', rotation: 30, width: 0.5 })
    expect(item).toMatchObject({ italic: true, align: 'left', rotation: 30, width: 0.5 })
  })
})

describe('snapAngle', () => {
  it('snaps to the nearest 45° step when close to it', () => {
    expect(snapAngle(2.5)).toBe(0)
    expect(snapAngle(43)).toBe(45)
    expect(snapAngle(-88)).toBe(-90)
  })

  it('leaves other angles alone, rounded to a whole degree', () => {
    expect(snapAngle(20.4)).toBe(20)
  })

  it('keeps the angle within -180..180', () => {
    expect(snapAngle(200)).toBe(-160)
    expect(snapAngle(-178)).toBe(180)
  })
})
