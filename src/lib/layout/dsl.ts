import type { Dir, LayoutNode } from './types'

/**
 * DSL mô tả bố cục, ngắn gọn để khai báo hàng loạt:
 *   *            một ô ảnh
 *   H(a,b,c)     xếp ngang         V(a,b,c)   xếp dọc
 *   H3 / V3      viết tắt của H(*,*,*) / V(*,*,*)
 *   2:a          phần tử có trọng số 2 (mặc định 1)
 * Ví dụ: "H(2:*,V3)" = một ảnh lớn bên trái, cột 3 ảnh nhỏ bên phải.
 */
export function parseLayout(dsl: string): LayoutNode {
  let pos = 0
  const src = dsl.replace(/\s+/g, '')

  const fail = (): never => {
    throw new Error(`Bố cục không hợp lệ: "${dsl}" (vị trí ${pos})`)
  }
  const number = (): number | null => {
    const m = /^\d+(\.\d+)?/.exec(src.slice(pos))
    if (!m) return null
    pos += m[0].length
    return Number(m[0])
  }

  const node = (): LayoutNode => {
    const ch = src[pos++]
    if (ch === '*') return { kind: 'cell' }
    if (ch !== 'H' && ch !== 'V') fail()
    const dir: Dir = ch === 'H' ? 'h' : 'v'
    const short = number()
    if (short !== null) {
      if (short < 1 || !Number.isInteger(short)) fail()
      return {
        kind: 'split',
        dir,
        children: Array.from({ length: short }, () => ({ kind: 'cell' }) as LayoutNode),
        weights: Array(short).fill(1),
      }
    }
    if (src[pos++] !== '(') fail()
    const children: LayoutNode[] = []
    const weights: number[] = []
    for (;;) {
      const save = pos
      const w = number()
      if (w !== null && src[pos] === ':') pos++
      else pos = save
      weights.push(w !== null && pos !== save ? w : 1)
      children.push(node())
      const sep = src[pos++]
      if (sep === ')') break
      if (sep !== ',') fail()
    }
    return { kind: 'split', dir, children, weights }
  }

  const root = node()
  if (pos !== src.length) fail()
  return root
}

/** Số viết gọn tới 2 chữ số thập phân: 1.50 → "1.5", 2.00 → "2". */
const short = (v: number) => String(Math.round(v * 100) / 100)

/**
 * Viết một cây thành chuỗi DSL (ngược với `parseLayout`). Trọng số được quy về "phần nhỏ nhất = 1" và làm tròn 2 chữ số,
 * nên hai cây cùng hình luôn ra cùng một chuỗi.
 */
export function formatLayout(node: LayoutNode): string {
  if (node.kind === 'cell') return '*'
  const dir = node.dir === 'h' ? 'H' : 'V'
  const least = Math.min(...node.weights)
  const weights = node.weights.map((w) => short(w / least))
  if (node.children.every((c) => c.kind === 'cell') && weights.every((w) => w === '1')) return `${dir}${node.children.length}`
  return `${dir}(${node.children.map((c, i) => (weights[i] === '1' ? '' : `${weights[i]}:`) + formatLayout(c)).join(',')})`
}

export function countCells(node: LayoutNode): number {
  return node.kind === 'cell' ? 1 : node.children.reduce((sum, c) => sum + countCells(c), 0)
}
