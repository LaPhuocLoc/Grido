import { describe, expect, it } from 'vitest'
import { captureTemplate, placeTemplate, templateFrame, type TextTemplate } from '../src/lib/templates'
import { normalizeText } from '../src/lib/text'
import { clampGroupScale, moveGroup, rotateGroup, scaleGroup } from '../src/lib/textGroup'
import { TEMPLATES } from '../src/templates'
import { FONTS } from '../src/lib/text'

const template: TextTemplate = {
  font: 'vn-allura',
  aspect: 2,
  bg: '#ffffff',
  items: [
    { text: 'Tiêu đề', x: 0.5, y: 0.25, size: 40, font: 'vn-allura', bold: false },
    { text: 'dòng phụ', x: 0.25, y: 0.75, size: 10, width: 0.5 },
  ],
}

describe('templateFrame', () => {
  it('fits the reference frame into 80% of the width of a tall canvas, centred', () => {
    expect(templateFrame(2, 1000, 2000)).toEqual({ x: 100, y: 800, w: 800, h: 400 })
  })

  it('is limited by height on a wide canvas so a tall template never fills the whole photo', () => {
    // Cao tối đa 60% của 500 = 300 → rộng 300 với mẫu vuông.
    expect(templateFrame(1, 2000, 500)).toEqual({ x: 850, y: 100, w: 300, h: 300 })
  })
})

describe('placeTemplate', () => {
  it('maps positions, font sizes and box widths from the reference frame onto the canvas', () => {
    const [title, sub] = placeTemplate(template, 1000, 2000)
    // Khung 800 × 400 đặt tại (100, 800): cỡ chữ 40% cạnh ngắn 400 = 160px = 16% cạnh ngắn của khung ghép.
    expect(title).toMatchObject({ text: 'Tiêu đề', x: 0.5, y: 0.45, size: 16, width: null, font: 'vn-allura', bold: false })
    expect(sub).toMatchObject({ x: 0.3, y: 0.55, size: 4, width: 0.4 })
  })

  it('fills in defaults for the fields a template leaves out', () => {
    const [, sub] = placeTemplate(template, 1000, 2000)
    expect(sub).toMatchObject({ font: 'round', color: '#ffffff', outline: null, lineHeight: 1.25 })
    expect(sub).not.toHaveProperty('id')
    expect(sub).not.toHaveProperty('group')
  })
})

describe('captureTemplate', () => {
  it('round-trips: a captured group placed again on the same canvas keeps its layout', () => {
    const items = placeTemplate(template, 1000, 2000).map((t, i) => normalizeText({ ...t, id: `t${i}`, group: 'g' }))
    // Hộp chữ trên khung (px): tiêu đề 600 × 200 quanh tâm, dòng phụ 400 × 60.
    const boxes = [
      { left: 200, top: 800, right: 800, bottom: 1000 },
      { left: 100, top: 1070, right: 500, bottom: 1130 },
    ]
    const captured = captureTemplate(items, boxes, 1000, 2000, 'vn-allura', '#000000')
    expect(captured).toMatchObject({ font: 'vn-allura', bg: '#000000' })
    // Lề 12% cạnh dài của vùng chữ (700px) mỗi phía.
    expect(captured.aspect).toBeCloseTo((700 + 168) / (330 + 168), 3)
    const again = placeTemplate(captured, 1000, 2000)
    const ratio = again[0].size / again[1].size
    expect(ratio).toBeCloseTo(4, 1)
    // Khoảng cách giữa hai dòng so với cỡ chữ tiêu đề giữ nguyên.
    const before = ((items[1].y - items[0].y) * 2000) / items[0].size
    const after = ((again[1].y - again[0].y) * 2000) / again[0].size
    expect(after).toBeCloseTo(before, 0)
  })

  it('writes only the fields that differ from the defaults', () => {
    const item = normalizeText({ id: 't', text: 'A', x: 0.5, y: 0.5, size: 10, group: 'g', outline: { color: '#000000', width: 4 } })
    const captured = captureTemplate([item], [{ left: 400, top: 900, right: 600, bottom: 1100 }], 1000, 2000, 'sans', '#fff')
    expect(Object.keys(captured.items[0]).sort()).toEqual(['outline', 'size', 'text', 'x', 'y'])
  })
})

describe('group transforms', () => {
  const a = normalizeText({ id: 'a', x: 0.5, y: 0.4, size: 10, width: 0.4, group: 'g' })
  const b = normalizeText({ id: 'b', x: 0.5, y: 0.6, size: 4, group: 'g' })

  it('moves every member by the same offset', () => {
    expect(moveGroup([a, b], 0.1, -0.05)).toEqual({ a: { x: 0.6, y: 0.35 }, b: { x: 0.6, y: 0.55 } })
  })

  it('scales sizes, box widths and distances from the centre together', () => {
    // Tâm nhóm ở giữa khung 1000 × 1000.
    expect(scaleGroup([a, b], 500, 500, 2, 1000, 1000)).toEqual({
      a: { x: 0.5, y: 0.3, size: 20, width: 0.8 },
      b: { x: 0.5, y: 0.7, size: 8, width: null },
    })
  })

  it('stops scaling when any member would leave the allowed font sizes', () => {
    expect(clampGroupScale([a, b], 100)).toBe(6)
    expect(clampGroupScale([a, b], 0.01)).toBe(0.25)
  })

  it('rotates members around the centre in canvas pixels, so a non-square canvas does not skew the group', () => {
    const turned = rotateGroup([a, b], 500, 1000, 90, 1000, 2000)
    // a nằm trên tâm 200px → sau khi xoay 90° theo chiều kim đồng hồ thì nằm bên phải tâm 200px.
    expect(turned.a).toEqual({ x: 0.7, y: 0.5, rotation: 90 })
    expect(turned.b).toEqual({ x: 0.3, y: 0.5, rotation: 90 })
  })

  it('keeps rotations within -180..180', () => {
    const turned = rotateGroup([{ ...a, rotation: 170 }], 500, 500, 30, 1000, 1000)
    expect(turned.a.rotation).toBe(-160)
  })
})

describe('built-in templates', () => {
  const known = new Set(FONTS.map((f) => f.id))

  it('each belongs to a font in the catalogue and only uses fonts the app ships', () => {
    for (const t of TEMPLATES) {
      expect(known.has(t.font), t.font).toBe(true)
      expect(t.aspect).toBeGreaterThan(0.3)
      expect(t.items.length, t.font).toBeGreaterThan(0)
      for (const item of t.items) {
        expect(known.has(item.font ?? 'round'), `${t.font}: ${item.font}`).toBe(true)
        expect(item.text.trim(), t.font).not.toBe('')
        expect(item.x).toBeGreaterThanOrEqual(0)
        expect(item.x).toBeLessThanOrEqual(1)
        expect(item.y).toBeGreaterThanOrEqual(0)
        expect(item.y).toBeLessThanOrEqual(1)
      }
    }
  })

  it('there is at most one template per font', () => {
    expect(new Set(TEMPLATES.map((t) => t.font)).size).toBe(TEMPLATES.length)
  })
})
