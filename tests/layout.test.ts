import { describe, expect, it } from 'vitest'
import { computeLayout, moveDivider } from '../src/lib/layout/compute'
import { countCells, parseLayout } from '../src/lib/layout/dsl'
import { getLayouts, MAX_PHOTOS } from '../src/lib/layout/registry'
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
  it.each(Array.from({ length: MAX_PHOTOS }, (_, i) => i + 1))('every built-in layout for %i photos tiles a 1080×566 frame without overlap', (n) => {
    const area = { x: 20, y: 20, w: 1040, h: 526 }
    const layouts = getLayouts(n)
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

describe('layout registry', () => {
  it('offers exactly one layout for a single photo', () => {
    expect(getLayouts(1).map((l) => l.id)).toEqual(['*'])
  })

  it('lists no two layouts with the same shape', () => {
    for (let n = 1; n <= MAX_PHOTOS; n++) {
      const shapes = getLayouts(n).map((l) =>
        computeLayout(parseLayout(l.id), { x: 0, y: 0, w: 1200, h: 1200 }, 0)
          .cells.map((c) => `${c.x},${c.y},${c.w},${c.h}`)
          .sort()
          .join('|'),
      )
      expect(new Set(shapes).size, `n=${n}`).toBe(shapes.length)
      for (const l of getLayouts(n)) expect(countCells(parseLayout(l.id)), l.id).toBe(n)
    }
  })
})
