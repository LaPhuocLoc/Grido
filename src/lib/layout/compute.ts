import type { Divider, LayoutNode, Rect } from './types'

export interface ComputedLayout {
  /** Theo thứ tự duyệt cây (trái→phải, trên→dưới): ô thứ i nhận ảnh thứ i. */
  cells: Rect[]
  dividers: Divider[]
}

/**
 * Tính toạ độ ô (px nguyên) trong `area`. Các mép được làm tròn theo toạ độ tuyệt đối
 * nên tổng luôn khớp đúng `area`, không bao giờ hở 1px hay tràn.
 */
export function computeLayout(root: LayoutNode, area: Rect, gap: number): ComputedLayout {
  const cells: Rect[] = []
  const dividers: Divider[] = []

  const walk = (node: LayoutNode, r: Rect, path: number[]) => {
    if (node.kind === 'cell') {
      cells.push(r)
      return
    }
    const horizontal = node.dir === 'h'
    const total = horizontal ? r.w : r.h
    const origin = horizontal ? r.x : r.y
    const n = node.children.length
    const span = Math.max(0, total - gap * (n - 1))
    const weightSum = node.weights.reduce((a, b) => a + b, 0)
    let cursor = origin
    node.children.forEach((child, i) => {
      const size = (span * node.weights[i]) / weightSum
      const from = Math.round(cursor)
      const to = i === n - 1 ? origin + total : Math.round(cursor + size)
      walk(child, horizontal ? { x: from, y: r.y, w: to - from, h: r.h } : { x: r.x, y: from, w: r.w, h: to - from }, [
        ...path,
        i,
      ])
      if (i < n - 1) {
        dividers.push({
          path,
          index: i,
          dir: node.dir,
          rect: horizontal ? { x: to, y: r.y, w: gap, h: r.h } : { x: r.x, y: to, w: r.w, h: gap },
          span,
          weightSum,
        })
      }
      cursor += size + gap
    })
  }

  walk(root, area, [])
  return { cells, dividers }
}

/** Mỗi phần kề đường chia giữ tối thiểu chừng này tổng kích thước hai phần. */
export const MIN_SHARE = 0.12

/** Trả về cây mới sau khi kéo đường chia `index` của node tại `path` đi `deltaWeight`. */
export function moveDivider(root: LayoutNode, path: number[], index: number, deltaWeight: number): LayoutNode {
  const clone = structuredClone(root)
  let node = clone
  for (const i of path) {
    if (node.kind !== 'split') return root
    node = node.children[i]
  }
  if (node.kind !== 'split') return root
  const a = node.weights[index]
  const b = node.weights[index + 1]
  const min = (a + b) * MIN_SHARE
  const nextA = Math.min(a + b - min, Math.max(min, a + deltaWeight))
  node.weights[index] = nextA
  node.weights[index + 1] = a + b - nextA
  return clone
}
