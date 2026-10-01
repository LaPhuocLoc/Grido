import type { LayoutCategory } from './types'

/**
 * Các "họ" bố cục được sinh tự động theo số ảnh n. Mỗi generator trả về danh sách chuỗi DSL.
 * Muốn thêm cả một họ bố cục mới: viết thêm 1 generator và đăng ký vào GENERATORS ở cuối file.
 * Trùng lặp hình học giữa các generator được registry tự loại bỏ.
 */
export type Generator = (n: number) => string[]

const MAX_PER_GROUP = 4
const MAX_GROUPS = 4

const line = (dir: 'H' | 'V', count: number) => (count === 1 ? '*' : `${dir}${count}`)
const flip = (dir: 'H' | 'V') => (dir === 'H' ? 'V' : 'H')
const BOTH = ['H', 'V'] as const

/** Mọi cách tách n thành các nhóm có thứ tự, vd 5 → [2,3], [3,2], [1,2,2]… */
function compositions(n: number, maxPart: number, maxParts: number): number[][] {
  const out: number[][] = []
  const walk = (rest: number, acc: number[]) => {
    if (rest === 0) return void out.push(acc)
    if (acc.length === maxParts) return
    for (let p = 1; p <= Math.min(maxPart, rest); p++) walk(rest - p, [...acc, p])
  }
  walk(n, [])
  return out
}

const variance = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length
}

/** Lưới theo hàng / theo cột: mỗi hàng (cột) có số ảnh tuỳ ý. Bố cục cân đối xếp trước. */
const grids: Generator = (n) => {
  if (n === 1) return ['*']
  const groups = compositions(n, MAX_PER_GROUP, MAX_GROUPS)
    .filter((g) => g.length > 1)
    // Ưu tiên lưới gần vuông và đều nhau.
    .sort((a, b) => variance(a) + Math.abs(a.length - Math.sqrt(n)) - (variance(b) + Math.abs(b.length - Math.sqrt(n))))
  const out: string[] = []
  for (const g of groups) {
    for (const outer of BOTH) out.push(`${outer}(${g.map((c) => line(flip(outer), c)).join(',')})`)
  }
  // Dải một hàng / một cột để sau cùng: ít khi là lựa chọn mặc định đẹp.
  if (n <= MAX_PER_GROUP + 1) out.push(`H${n}`, `V${n}`)
  return out
}

/** Lưới 2 nhóm nhưng lệch tỉ lệ 2:1 hoặc 1:2. */
const weightedPairs: Generator = (n) => {
  const out: string[] = []
  for (const g of compositions(n, MAX_PER_GROUP, 2).filter((g) => g.length === 2)) {
    for (const outer of BOTH) {
      const [a, b] = g.map((c) => line(flip(outer), c))
      out.push(`${outer}(2:${a},${b})`, `${outer}(${a},2:${b})`)
    }
  }
  return out
}

/** Một ảnh lớn làm chủ đạo + dải ảnh nhỏ ở cạnh / hai bên / ôm góc. */
const heroes: Generator = (n) => {
  const rest = n - 1
  const out: string[] = []
  if (rest < 2) return out
  for (const outer of BOTH) {
    const inner = flip(outer)
    if (rest <= MAX_PER_GROUP) {
      out.push(`${outer}(2:*,${inner}${rest})`, `${outer}(${inner}${rest},2:*)`)
      out.push(`${outer}(3:*,${inner}${rest})`, `${outer}(${inner}${rest},3:*)`)
    }
    if (rest % 2 === 0 && rest / 2 <= MAX_PER_GROUP) {
      const half = line(inner, rest / 2)
      // Ảnh lớn ở giữa, hai dải hai bên.
      out.push(`${outer}(${half},2:*,${half})`)
      if (rest >= 4) out.push(`${outer}(2:*,${half},${half})`, `${outer}(${half},${half},2:*)`)
    }
    // Ảnh lớn ở góc, ảnh nhỏ ôm thành hình chữ L.
    for (let side = 1; side <= 3; side++) {
      const base = rest - side
      if (base < 2 || base > MAX_PER_GROUP) continue
      const sideStrip = line(inner, side)
      const baseStrip = line(outer, base)
      for (const heroFirst of [true, false]) {
        const top = heroFirst ? `${outer}(3:*,${sideStrip})` : `${outer}(${sideStrip},3:*)`
        out.push(`${inner}(3:${top},${baseStrip})`, `${inner}(${baseStrip},3:${top})`)
      }
    }
  }
  return out
}

/** Kiểu xếp gạch: các hàng 2 ảnh so le 2:1 / 1:2. */
const bricks: Generator = (n) => {
  const out: string[] = []
  if (n < 4) return out
  for (const outer of BOTH) {
    const inner = flip(outer)
    for (const startWide of [true, false]) {
      const rows: string[] = []
      let wide = startWide
      for (let left = n; left > 0; wide = !wide) {
        if (left === 1) {
          rows.push('*')
          left -= 1
        } else if (left === 3) {
          rows.push(`${inner}3`)
          left -= 3
        } else {
          rows.push(wide ? `${inner}(2:*,*)` : `${inner}(*,2:*)`)
          left -= 2
        }
      }
      if (rows.length <= 5) out.push(`${outer}(${rows.join(',')})`)
    }
  }
  return out
}

/** Xoắn ốc: mỗi lần chia đôi phần còn lại và đổi hướng. */
const spirals: Generator = (n) => {
  if (n < 3 || n > 6) return []
  const build = (left: number, dir: 'H' | 'V', cellFirst: boolean, alternate: boolean): string => {
    if (left === 1) return '*'
    const rest = build(left - 1, flip(dir), alternate ? !cellFirst : cellFirst, alternate)
    return cellFirst ? `${dir}(*,${rest})` : `${dir}(${rest},*)`
  }
  const out: string[] = []
  for (const dir of BOTH)
    for (const cellFirst of [true, false])
      for (const alternate of [false, true]) out.push(build(n, dir, cellFirst, alternate))
  return out
}

/** Chia đôi rồi mỗi nửa lại là một lưới con khác hướng. */
const quilts: Generator = (n) => {
  const out: string[] = []
  if (n < 5) return out
  for (const outer of BOTH) {
    const inner = flip(outer)
    for (let a = 2; a <= n - 3; a++) {
      const b = n - a
      if (a > MAX_PER_GROUP || b > 6 || b < 3) continue
      const bHalf = Math.ceil(b / 2)
      const grid = `${outer}(${line(inner, bHalf)},${line(inner, b - bHalf)})`
      out.push(`${outer}(${line(inner, a)},2:${grid})`, `${outer}(2:${grid},${line(inner, a)})`)
    }
  }
  return out
}

export const GENERATORS: { category: LayoutCategory; generate: Generator }[] = [
  { category: 'grid', generate: grids },
  { category: 'grid', generate: weightedPairs },
  { category: 'hero', generate: heroes },
  { category: 'mosaic', generate: bricks },
  { category: 'mosaic', generate: spirals },
  { category: 'mosaic', generate: quilts },
]
