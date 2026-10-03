import { describe, expect, it } from 'vitest'
import { computeLayout, moveDivider } from '../src/lib/layout/compute'
import { justify, quality } from '../src/lib/layout/curate'
import { countCells, formatLayout, parseLayout } from '../src/lib/layout/dsl'
import { defaultLayout, getLayouts, layoutLook, MAX_PHOTOS, suggestLayouts } from '../src/lib/layout/registry'
import type { LayoutNode, Rect } from '../src/lib/layout/types'

const cell: LayoutNode = { kind: 'cell' }

describe('parseLayout', () => {
  it('parses nested splits with weights', () => {
    expect(parseLayout('H(2:*,V3)')).toEqual({
      kind: 'split',
      dir: 'h',
      weights: [2, 1],
      children: [cell, { kind: 'split', dir: 'v', weights: [1, 1, 1], children: [cell, cell, cell] }],
    })
  })

  it('ignores whitespace', () => {
    expect(parseLayout(' V( * , 3:* ) ')).toEqual({ kind: 'split', dir: 'v', weights: [1, 3], children: [cell, cell] })
  })

  it.each(['', 'X', 'H(', 'H(*', 'H(*,)', 'H0', 'H2.5', '**', 'H(*))'])('rejects malformed input %j with a layout error', (dsl) => {
    expect(() => parseLayout(dsl)).toThrow(/Bố cục không hợp lệ/)
  })
})

describe('computeLayout', () => {
  it('splits the area by weight and leaves the gap between cells', () => {
    const { cells, dividers } = computeLayout(parseLayout('H(*,*)'), { x: 0, y: 0, w: 100, h: 50 }, 10)
    expect(cells).toEqual([
      { x: 0, y: 0, w: 45, h: 50 },
      { x: 55, y: 0, w: 45, h: 50 },
    ])
    expect(dividers).toEqual([{ path: [], index: 0, dir: 'h', rect: { x: 45, y: 0, w: 10, h: 50 }, span: 90, weightSum: 2 }])
  })

  it('gives weighted children proportional sizes', () => {
    const { cells } = computeLayout(parseLayout('V(3:*,*)'), { x: 10, y: 20, w: 40, h: 80 }, 0)
    expect(cells).toEqual([
      { x: 10, y: 20, w: 40, h: 60 },
      { x: 10, y: 80, w: 40, h: 20 },
    ])
  })

  const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

  // Khung dẹt nhất (Instagram ngang) + khoảng cách lớn là trường hợp dễ sinh ô âm / chồng nhau nhất.
  it.each(Array.from({ length: MAX_PHOTOS + 2 }, (_, i) => i + 1))('every built-in layout for %i photos tiles a 1080×566 frame without overlap', (n) => {
    const area = { x: 20, y: 20, w: 1040, h: 526 }
    // Lấy bố cục của cả khung dọc lẫn khung ngang: chúng vẫn phải kín khi người dùng đổi sang khung dẹt nhất.
    const layouts = [...getLayouts(n, 1080 / 566), ...getLayouts(n, 0.8)]
    expect(layouts.length).toBeGreaterThan(0)
    for (const { id } of layouts) {
      const { cells } = computeLayout(parseLayout(id), area, 13)
      expect(cells, id).toHaveLength(n)
      for (const c of cells) {
        expect(c.w, id).toBeGreaterThan(0)
        expect(c.h, id).toBeGreaterThan(0)
        expect(c.x >= area.x && c.y >= area.y && c.x + c.w <= area.x + area.w && c.y + c.h <= area.y + area.h, id).toBe(true)
      }
      for (let i = 0; i < cells.length; i++)
        for (let j = i + 1; j < cells.length; j++) expect(overlap(cells[i], cells[j]), `${id} cells ${i},${j}`).toBe(false)
    }
  })
})

describe('moveDivider', () => {
  it('moves weight from one side to the other', () => {
    const next = moveDivider(parseLayout('H(*,*)'), [], 0, 0.5)
    expect(next.kind === 'split' && next.weights).toEqual([1.5, 0.5])
  })

  it('never shrinks a side below 12% of the pair', () => {
    const next = moveDivider(parseLayout('H(*,*)'), [], 0, 5)
    expect(next.kind === 'split' && next.weights).toEqual([1.76, 0.24])
  })

  it('leaves the original tree untouched', () => {
    const tree = parseLayout('H(*,V(*,*))')
    moveDivider(tree, [1], 0, 0.3)
    expect(tree).toEqual(parseLayout('H(*,V(*,*))'))
  })
})

describe('formatLayout', () => {
  it('writes a tree back as the DSL it was parsed from', () => {
    for (const dsl of ['*', 'H2', 'V(2:*,H3)', 'H(V2,1.5:V(*,2:*))']) expect(formatLayout(parseLayout(dsl))).toBe(dsl)
  })

  it('scales weights so the smallest part is 1 and rounds them, so equal shapes get equal ids', () => {
    expect(formatLayout(parseLayout('H(4:*,2:*)'))).toBe('H(2:*,*)')
    expect(formatLayout(parseLayout('H(*,*)'))).toBe('H2')
    expect(formatLayout({ kind: 'split', dir: 'v', weights: [1 / 3, 1 / 2], children: [cell, cell] })).toBe('V(*,1.5:*)')
  })
})

describe('justify', () => {
  it('sizes every cell to the aspect ratio asked for', () => {
    // Hàng trên hai ảnh dọc 3:4, hàng dưới một ảnh ngang 3:2: khối tự nhiên rộng 1.5, cao 2.
    const { tree, aspect } = justify(parseLayout('V(H2,*)'), [0.75, 0.75, 1.5])
    expect(aspect).toBeCloseTo(0.75)
    const { cells } = computeLayout(tree, { x: 0, y: 0, w: 1500, h: 2000 }, 0)
    expect(cells.map((c) => c.w / c.h)).toEqual([0.75, 0.75, 1.5])
  })
})

describe('layouts offered for a frame', () => {
  const frames = [9 / 16, 0.8, 1, 1.5, 1.91]
  const aspectsOf = (id: string, frame: number) =>
    computeLayout(parseLayout(id), { x: 0, y: 0, w: Math.round(1200 * frame), h: 1200 }, 0).cells.map((c) => c.w / c.h)

  it('offers exactly one layout for a single photo', () => {
    expect(getLayouts(1, 0.8).map((l) => l.id)).toEqual(['*'])
  })

  it('gives a short list of layouts for every photo count and frame, the plain grid first where there is one', () => {
    for (const frame of frames)
      for (let n = 2; n <= MAX_PHOTOS; n++) {
        const list = getLayouts(n, frame)
        expect(list.length, `${n}@${frame}`).toBeGreaterThanOrEqual(3)
        expect(list.length, `${n}@${frame}`).toBeLessThanOrEqual(24)
        for (const l of list) expect(countCells(parseLayout(l.id)), l.id).toBe(n)
      }
    expect(getLayouts(4, 1)[0].id).toBe('V(H2,H2)')
    expect(getLayouts(6, 0.8)[0].id).toBe('V(H2,H2,H2)')
    expect(getLayouts(6, 1.5)[0].id).toBe('H(V2,V2,V2)')
  })

  it('never offers slivers: every cell keeps a shape a photo can live in', () => {
    for (const frame of [0.8, 1, 1.5])
      for (let n = 2; n <= MAX_PHOTOS; n++)
        for (const l of getLayouts(n, frame))
          for (const a of aspectsOf(l.id, frame)) {
            // Hai ảnh đứng cạnh nhau trên khung 4:5 (ô 2:5) là ô hẹp nhất còn được giữ.
            expect(a, `${l.id}@${frame}`).toBeGreaterThan(0.39)
            expect(a, `${l.id}@${frame}`).toBeLessThan(2.6)
          }
  })

  it('offers different layouts for a portrait frame than for a landscape one', () => {
    const portrait = getLayouts(3, 0.8).map((l) => l.id)
    const landscape = getLayouts(3, 1.91).map((l) => l.id)
    // Ba cột đứng chỉ đẹp trên khung ngang dẹt; trên khung dọc 4:5 mỗi cột là một dải mảnh.
    expect(landscape).toContain('H3')
    expect(portrait).not.toContain('H3')
    expect(portrait).toContain('V(*,H2)')
  })

  it('does not list two layouts that look the same in the thumbnail', () => {
    for (const frame of frames)
      for (let n = 2; n <= MAX_PHOTOS; n++) {
        const looks = getLayouts(n, frame).map((l) => layoutLook(parseLayout(l.id), frame))
        expect(new Set(looks).size, `${n}@${frame}`).toBe(looks.length)
      }
  })

  it('includes rows of unequal cells, like a portrait next to a landscape photo', () => {
    // Bố cục 6 ảnh người dùng đưa làm mẫu: ba hàng hai ảnh, hàng cuối một ô hẹp cạnh một ô rộng gấp đôi.
    expect(getLayouts(6, 0.8).some((l) => /H\(\*,2:\*\)|H\(2:\*,\*\)/.test(l.id) && l.id.startsWith('V('))).toBe(true)
  })

  it('still builds layouts for old designs with 11 or 12 photos', () => {
    expect(getLayouts(12, 0.8).length).toBeGreaterThan(0)
  })

  it('scores a layout of photo-shaped cells better than one of slivers', () => {
    const boxes = (id: string, frame: number) =>
      computeLayout(parseLayout(id), { x: 0, y: 0, w: 1000, h: 1000 }, 0).cells.map((c) => ({ w: c.w / 1000, h: c.h / 1000 }))
    expect(quality(boxes('V3', 0.8), 0.8)).toBeGreaterThan(quality(boxes('V(2:*,H2)', 0.8), 0.8))
    expect(quality(boxes('H3', 0.8), 0.8)).toBeGreaterThan(quality(boxes('H3', 1.5), 1.5))
  })
})

describe('layouts suggested for the chosen photos', () => {
  const P = 0.75
  const L = 1.5

  it('suggests nothing without photos, or for a single photo', () => {
    expect(suggestLayouts([null, null, null], 0.8)).toEqual([])
    expect(suggestLayouts([L], 0.8)).toEqual([])
  })

  it('keeps the photos in order and gives each cell the shape of its photo', () => {
    // Hai ảnh dọc rồi một ảnh ngang trên khung dọc: hai ảnh dọc cạnh nhau, ảnh ngang nằm dưới.
    expect(suggestLayouts([P, P, L], 0.8)[0].id).toBe('V(H2,*)')
    // Bốn ảnh ngang trên khung ngang: lưới 2×2.
    expect(suggestLayouts([L, L, L, L], 1.5)[0].id).toBe('V(H2,H2)')
  })

  it('finds the three-row layout for two portraits, two landscapes, then a portrait and a landscape', () => {
    const ids = suggestLayouts([P, P, L, L, P, L], 0.8).map((l) => l.id)
    const rows = ids.find((id) => /^V\([^()]*H2,[^()]*H2,[^()]*H\(\*,2:\*\)\)$/.test(id))
    expect(rows, ids.join('  ')).toBeDefined()
    // Hàng ảnh dọc cao hơn hàng ảnh ngang.
    const { cells } = computeLayout(parseLayout(rows!), { x: 0, y: 0, w: 800, h: 1000 }, 0)
    expect(cells[0].h).toBeGreaterThan(cells[2].h)
  })

  it('gives empty cells a neutral shape and still fits the photos that are there', () => {
    const list = suggestLayouts([L, null, null, null], 0.8)
    expect(list.length).toBeGreaterThan(0)
    for (const l of list) expect(countCells(parseLayout(l.id))).toBe(4)
  })

  it('uses the best suggestion as the default layout, or the best layout of the frame when there is no photo', () => {
    expect(defaultLayout([P, P, L], 0.8)).toBe('V(H2,*)')
    expect(defaultLayout([null, null, null, null], 1)).toBe(getLayouts(4, 1)[0].id)
    expect(defaultLayout([L], 1)).toBe('*')
  })
})
