import { computeLayout } from './compute'
import { countCells, parseLayout } from './dsl'
import { GENERATORS } from './generators'
import { HANDCRAFTED } from './handcrafted'
import type { LayoutDef } from './types'

export const MAX_PHOTOS = 12

/** Hai DSL khác nhau có thể cho ra cùng một hình — so bằng toạ độ ô trên khung chuẩn. */
function signature(dsl: string): string {
  const { cells } = computeLayout(parseLayout(dsl), { x: 0, y: 0, w: 1200, h: 1200 }, 0)
  return cells
    .map((c) => `${c.x},${c.y},${c.w},${c.h}`)
    .sort()
    .join('|')
}

const cache = new Map<number, LayoutDef[]>()

export function getLayouts(n: number): LayoutDef[] {
  let list = cache.get(n)
  if (!list) {
    const seen = new Set<string>()
    list = []
    const candidates = [
      ...GENERATORS.flatMap((g) => g.generate(n).map((dsl) => ({ dsl, category: g.category }))),
      ...HANDCRAFTED.filter((h) => countCells(parseLayout(h.dsl)) === n),
    ]
    for (const { dsl, category } of candidates) {
      const sig = signature(dsl)
      if (seen.has(sig)) continue
      seen.add(sig)
      list.push({ id: dsl, n, category })
    }
    cache.set(n, list)
  }
  return list
}

export function totalLayoutCount(): number {
  let total = 0
  for (let n = 1; n <= MAX_PHOTOS; n++) total += getLayouts(n).length
  return total
}
