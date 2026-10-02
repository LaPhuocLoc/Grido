import { describe, expect, it } from 'vitest'
import { availableLangs, countByGroup, detectLang, sampleLine, searchFonts } from '../src/lib/fontSearch'
import { FONT_LANGS, FONTS, type FontInfo } from '../src/lib/text'

const font = (id: string, label: string, group: FontInfo['group'], langs: FontInfo['langs'] = ['vi']): FontInfo => ({
  id,
  label,
  group,
  langs,
  family: `"${id}", sans-serif`,
})

const SAMPLE = [
  font('gilroy', 'SVN-Gilroy', 'sans'),
  font('helv', 'SVN-Helvetica Neue', 'sans'),
  font('lobster', 'SVN-Lobster', 'script'),
  font('script', 'Splendid Script', 'script'),
  font('abril', 'SVN-Abril Fatface', 'serif'),
  font('duong', 'Đường Phố', 'display'),
  font('noto-kr', 'Noto Sans KR', 'sans', ['ko']),
]
const ids = (fonts: FontInfo[]) => fonts.map((f) => f.id)

describe('searchFonts', () => {
  it('returns every font for an empty query', () => {
    expect(searchFonts(SAMPLE, '   ')).toEqual(SAMPLE)
  })

  it('matches names without diacritics, case, prefix or separators', () => {
    expect(ids(searchFonts(SAMPLE, 'GILROY'))).toEqual(['gilroy'])
    expect(ids(searchFonts(SAMPLE, 'svn gilroy'))).toEqual(['gilroy'])
    expect(ids(searchFonts(SAMPLE, 'helveticaneue'))).toEqual(['helv'])
    expect(ids(searchFonts(SAMPLE, 'duong pho'))).toEqual(['duong'])
    expect(ids(searchFonts(SAMPLE, 'đường'))).toEqual(['duong'])
  })

  it('needs every word of the query to match', () => {
    expect(ids(searchFonts(SAMPLE, 'helvetica lobster'))).toEqual([])
  })

  it('finds a style by its Vietnamese or English name, with name matches first', () => {
    expect(ids(searchFonts(SAMPLE, 'viet tay'))).toEqual(['lobster', 'script'])
    expect(ids(searchFonts(SAMPLE, 'co chan'))).toEqual(['abril'])
    // "script" is in one font's name and is also the style of another.
    expect(ids(searchFonts(SAMPLE, 'script'))).toEqual(['script', 'lobster'])
  })
})

describe('countByGroup', () => {
  it('counts fonts per style, including styles with none', () => {
    expect(countByGroup(SAMPLE)).toEqual({ sans: 3, serif: 1, script: 2, display: 1 })
    expect(countByGroup([])).toEqual({ sans: 0, serif: 0, script: 0, display: 0 })
  })
})

describe('languages', () => {
  it('labels languages in Vietnamese', () => {
    expect(FONT_LANGS.map((l) => l.label)).toEqual(['Tiếng Việt', 'Tiếng Hàn', 'Tiếng Nhật'])
  })

  it('lists the languages a catalog covers, in display order', () => {
    expect(availableLangs(SAMPLE)).toEqual(['vi', 'ko'])
    expect(availableLangs(FONTS)[0]).toBe('vi')
  })

  it('gives every bundled font exactly the language its id prefix says', () => {
    for (const f of FONTS) {
      const lang = f.id.startsWith('ja-') ? 'ja' : f.id.startsWith('ko-') ? 'ko' : 'vi'
      expect(f.langs, f.id).toEqual([lang])
    }
  })

  it('guesses the language of a text from its characters', () => {
    expect(detectLang('Đường về quê hương')).toBe('vi')
    expect(detectLang('Hello 2026')).toBe('vi')
    expect(detectLang('')).toBe('vi')
    expect(detectLang('안녕하세요')).toBe('ko')
    expect(detectLang('こんにちは')).toBe('ja')
    expect(detectLang('カタカナ')).toBe('ja')
    expect(detectLang('東京')).toBe('ja')
    // Hangul wins over the Han characters Korean text may contain.
    expect(detectLang('大韓 한국')).toBe('ko')
  })
})

describe('sampleLine', () => {
  it('uses the first non-empty line of the text', () => {
    expect(sampleLine('\n  Xin chào \nDòng hai')).toBe('Xin chào')
  })

  it('cuts long lines and falls back when there is no text', () => {
    expect(sampleLine('a'.repeat(80))).toHaveLength(40)
    expect(sampleLine('   ')).toBe('Xin chào Việt Nam')
    expect(sampleLine(undefined)).toBe('Xin chào Việt Nam')
  })
})
