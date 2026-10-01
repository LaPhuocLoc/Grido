import { afterEach, describe, expect, it, vi } from 'vitest'
import { anchorShift, drawText, fontInfo, isSystemFont, systemFont, lineStart, normalizeText, snapAngle, textLayoutStyle, wrapLines, type TextItem } from '../src/lib/text'

afterEach(() => vi.unstubAllGlobals())

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
      spacing: 0,
      lineHeight: 1.25,
      anchor: 'middle',
      opacity: 100,
      vertical: false,
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

describe('anchorShift', () => {
  it('leaves the centre alone when the box is anchored in the middle', () => {
    expect(anchorShift('middle', 40, 0)).toEqual({ dx: 0, dy: 0 })
  })

  it('moves the centre down by half the growth so the top edge stays put, and up for a bottom anchor', () => {
    expect(anchorShift('top', 40, 0)).toEqual({ dx: 0, dy: 20 })
    expect(anchorShift('bottom', 40, 0)).toEqual({ dx: 0, dy: -20 })
    expect(anchorShift('top', -40, 0)).toEqual({ dx: 0, dy: -20 })
  })

  it('follows the box’s own vertical axis when the text is rotated', () => {
    const { dx, dy } = anchorShift('top', 40, 90)
    expect(dx).toBeCloseTo(-20)
    expect(dy).toBeCloseTo(0)
  })

  it('vertical text grows sideways: columns run right to left, so the “top” anchor keeps the right edge put', () => {
    expect(anchorShift('top', 40, 0, true)).toEqual({ dx: -20, dy: 0 })
    expect(anchorShift('bottom', 40, 0, true)).toEqual({ dx: 20, dy: 0 })
    expect(anchorShift('middle', 40, 0, true)).toEqual({ dx: 0, dy: 0 })
    const turned = anchorShift('top', 40, 90, true)
    expect(turned.dx).toBeCloseTo(0)
    expect(turned.dy).toBeCloseTo(-20)
  })
})

describe('textLayoutStyle', () => {
  const item = (extra: Partial<TextItem>) => normalizeText({ id: 't', text: 'abc', ...extra })

  it('wraps a horizontal caption by width', () => {
    const style = textLayoutStyle(item({}), 40, 300)
    expect(style).toMatchObject({ width: '300px', whiteSpace: 'pre-wrap', writingMode: 'horizontal-tb', fontSize: '40px' })
    expect(style.height).toBeUndefined()
  })

  it('a vertical caption stacks upright letters and wraps by height instead', () => {
    const style = textLayoutStyle(item({ vertical: true }), 40, 300)
    expect(style).toMatchObject({ height: '300px', whiteSpace: 'pre-wrap', writingMode: 'vertical-rl', textOrientation: 'upright' })
    expect(style.width).toBeUndefined()
  })

  it('hugs the content when there is no box size', () => {
    const style = textLayoutStyle(item({ vertical: true }), 40, null)
    expect(style.whiteSpace).toBe('pre')
    expect(style.height).toBeUndefined()
  })
})

describe('drawText', () => {
  /** Canvas giả: mỗi ký tự rộng 10px cộng giãn cách, ghi lại những gì được vẽ. */
  function fakeContext() {
    const calls: { text: string; x: number; y: number; alpha: number; spacing: string }[] = []
    const ctx = {
      globalAlpha: 1,
      letterSpacing: '0px',
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      fillRect() {},
      measureText(s: string) {
        return { width: s.length * (10 + parseFloat(ctx.letterSpacing)), fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }
      },
      fillText(text: string, x: number, y: number) {
        calls.push({ text, x, y, alpha: ctx.globalAlpha, spacing: ctx.letterSpacing })
      },
    }
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
  }
  const item = (extra: Partial<TextItem>) => normalizeText({ id: 't', text: 'ab\ncd', shadow: false, align: 'left', ...extra })

  it('spaces lines by the caption’s own line height', async () => {
    vi.stubGlobal('document', { fonts: { load: async () => [] } })
    const tight = fakeContext()
    await drawText(tight.ctx, item({ lineHeight: 1 }), 0, 0, 100)
    const loose = fakeContext()
    await drawText(loose.ctx, item({ lineHeight: 2 }), 0, 0, 100)
    expect(tight.calls[1].y - tight.calls[0].y).toBe(100)
    expect(loose.calls[1].y - loose.calls[0].y).toBe(200)
  })

  it('applies letter spacing (in thousandths of the font size) and opacity', async () => {
    vi.stubGlobal('document', { fonts: { load: async () => [] } })
    const { ctx, calls } = fakeContext()
    await drawText(ctx, item({ spacing: 200, opacity: 40, align: 'center' }), 0, 0, 50)
    expect(calls[0]).toMatchObject({ spacing: '10px', alpha: 0.4 })
    // Dòng 2 ký tự rộng 2 × (10 + 10) = 40px nên bắt đầu ở -20 khi căn giữa.
    expect(calls[0].x).toBe(-20)
  })
})

describe('system fonts', () => {
  it('resolves a font installed on the computer from its id, and falls back to the first app font for unknown ids', () => {
    const font = systemFont('SF Pro Display')
    expect(font).toMatchObject({ id: 'sys:SF Pro Display', label: 'SF Pro Display', family: '"SF Pro Display", sans-serif' })
    expect(isSystemFont(font.id)).toBe(true)
    expect(fontInfo(font.id)).toEqual(font)
    expect(isSystemFont('round')).toBe(false)
    expect(fontInfo('no-such-font').id).toBe('sans')
  })

  it('keeps quotes in a family name from breaking the CSS font-family value', () => {
    expect(systemFont('Weird "Name"').family).toBe('"Weird Name", sans-serif')
  })
})
