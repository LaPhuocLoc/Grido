import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VN_FONTS } from '../src/lib/fonts.generated'
import { FONT_GROUPS, FONTS, fontFamily, fontInfo } from '../src/lib/text'

const css = readFileSync('src/fonts.generated.css', 'utf8')

describe('font catalog', () => {
  it('keeps the four original font ids so saved collages still resolve', () => {
    expect(FONTS.slice(0, 4).map((f) => f.id)).toEqual(['sans', 'round', 'serif', 'script'])
    expect(fontFamily('round')).toBe('"Quicksand", sans-serif')
  })

  it('has unique ids and a known group for every font', () => {
    expect(new Set(FONTS.map((f) => f.id)).size).toBe(FONTS.length)
    const groups = FONT_GROUPS.map((g) => g.id)
    for (const f of FONTS) expect(groups).toContain(f.group)
  })

  it('falls back to the first font for an unknown id', () => {
    expect(fontInfo('khong-ton-tai')).toBe(FONTS[0])
  })

  it.each(VN_FONTS.map((f) => f.id))('ships the font file, thumbnail and @font-face for %s', (id) => {
    expect(existsSync(`public/fonts/vn/${id}.woff2`)).toBe(true)
    expect(existsSync(`public/fonts/thumbs/${id}.webp`)).toBe(true)
    expect(css).toContain(`font-family:'${id}';src:url('/fonts/vn/${id}.woff2')`)
    expect(fontInfo(id).thumb).toBe(`/fonts/thumbs/${id}.webp`)
  })

  it('references no font file that is missing from public/', () => {
    const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1])
    expect(urls.length).toBeGreaterThanOrEqual(VN_FONTS.length)
    for (const url of urls) expect(existsSync(`public${url}`)).toBe(true)
  })
})
