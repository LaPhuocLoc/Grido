import { describe, expect, it } from 'vitest'
import { autoName, copyName, designTitle, frameLabel, UNTITLED } from '../src/lib/designs'

describe('design names', () => {
  it('uses the first non-empty line of the first caption with text', () => {
    expect(autoName([{ text: '  ' }, { text: '\n SKYTREE   Tokyo \nmùa xuân' }, { text: 'khác' }])).toBe('SKYTREE Tokyo')
  })

  it('has no automatic name without captions and shortens a very long line', () => {
    expect(autoName([])).toBeNull()
    const name = autoName([{ text: 'a'.repeat(80) }])!
    expect(name).toHaveLength(40)
    expect(name.endsWith('…')).toBe(true)
  })

  it('prefers the name the user typed, then the caption, then a placeholder', () => {
    expect(designTitle('Kỷ yếu', [{ text: 'Tokyo' }])).toBe('Kỷ yếu')
    expect(designTitle(null, [{ text: 'Tokyo' }])).toBe('Tokyo')
    expect(designTitle(null, [])).toBe(UNTITLED)
  })

  it('numbers copies so no two designs share a name', () => {
    expect(copyName('Tokyo', ['Tokyo'])).toBe('Tokyo (bản sao)')
    expect(copyName('Tokyo (bản sao)', ['Tokyo', 'Tokyo (bản sao)'])).toBe('Tokyo (bản sao 2)')
  })
})

describe('frameLabel', () => {
  it('names the platform frame, or gives the pixel size for original / custom frames', () => {
    expect(frameLabel('ig-portrait', 1080, 1350)).toBe('Instagram · Bài đăng dọc (4:5)')
    expect(frameLabel('original', 4672, 7008)).toBe('4672 × 7008 px')
    expect(frameLabel('custom', 800, 600)).toBe('800 × 600 px')
  })
})
