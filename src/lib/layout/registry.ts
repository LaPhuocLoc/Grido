import { computeLayout } from './compute'
import { countCells, parseLayout } from './dsl'
import { GENERATORS } from './generators'
import { HANDCRAFTED } from './handcrafted'
import type { LayoutDef, LayoutNode } from './types'

export const MAX_PHOTOS = 12

/** Hai cây khác nhau có thể cho ra cùng một hình — so bằng toạ độ ô trên khung chuẩn. */
function signature(tree: LayoutNode): string {
  const { cells } = computeLayout(tree, { x: 0, y: 0, w: 1200, h: 1200 }, 0)
  return cells
    .map((c) => `${c.x},${c.y},${c.w},${c.h}`)
    .sort()
    .join('|')
}

const evened = (node: LayoutNode): LayoutNode =>
  node.kind === 'cell' ? node : { ...node, weights: node.weights.map(() => 1), children: node.children.map(evened) }

/**
 * "Dáng" của một bố cục: hình nó tạo ra khi mọi đường chia được trả về chia đều. Hai bố cục cùng dáng chỉ khác nhau ở tỉ
 * lệ các ô, thứ người dùng tự kéo đường viền là ra, nên danh sách chọn bố cục chỉ hiện mỗi dáng một lần.
 */
export const layoutShape = (tree: LayoutNode): string => signature(evened(tree))

const cache = new Map<number, LayoutDef[]>()

/** Mọi bố cục cho n ảnh, kể cả các biến thể chỉ khác tỉ lệ ô (nút "Bố cục ngẫu nhiên" rút trong danh sách này). */
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
      const tree = parseLayout(dsl)
      const sig = signature(tree)
      if (seen.has(sig)) continue
      seen.add(sig)
      list.push({ id: dsl, n, category, shape: layoutShape(tree) })
    }
    cache.set(n, list)
  }
  return list
}

const shapes = new Map<number, LayoutDef[]>()

/** Các bố cục thật sự khác nhau cho n ảnh: mỗi dáng một đại diện, là bố cục đứng trước nhất trong `getLayouts`. */
export function getLayoutShapes(n: number): LayoutDef[] {
  let list = shapes.get(n)
  if (!list) {
    const seen = new Set<string>()
    list = getLayouts(n).filter((l) => !seen.has(l.shape) && seen.add(l.shape))
    shapes.set(n, list)
  }
  return list
}

/** Tổng số dáng bố cục cho mọi số ảnh: con số dùng khi giới thiệu app. */
export function totalLayoutCount(): number {
  let total = 0
  for (let n = 1; n <= MAX_PHOTOS; n++) total += getLayoutShapes(n).length
  return total
}
