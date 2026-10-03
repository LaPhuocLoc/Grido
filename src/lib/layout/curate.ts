import { computeLayout } from './compute'
import { countCells, formatLayout, parseLayout } from './dsl'
import { GENERATORS } from './generators'
import { HANDCRAFTED } from './handcrafted'
import type { LayoutDef, LayoutNode } from './types'

/**
 * Chọn bố cục "đẹp" thay vì bày ra mọi cách chia ô.
 *
 * Một bố cục đẹp khi từng ô có tỉ lệ của một tấm ảnh (khoảng 2:3 tới 16:9), các ô ăn nhịp với nhau (ít cỡ ô khác nhau,
 * không ô nào bé tí cạnh ô khổng lồ). Điều đó phụ thuộc khung: ba cột đứng đẹp trên khung ngang nhưng thành ba dải mảnh
 * trên khung dọc. Nên danh sách được dựng riêng cho từng tỉ lệ khung:
 *
 * 1. Sinh ứng viên. Họ chính là "xếp hàng": các hàng (hoặc cột) ảnh, độ cao mỗi hàng được tính sao cho các ô giữ đúng tỉ
 *    lệ đã định (`justify`), giống cách các app dàn album xếp ảnh dọc cạnh ảnh ngang. Họ phụ là các bố cục có ô chủ đạo
 *    lấy từ `generators.ts` và `handcrafted.ts`.
 * 2. Chấm điểm (`quality`), điểm thấp là đẹp.
 * 3. Lấy từ trên xuống, bỏ cái gần giống cái đã lấy, không để một kiểu chia chiếm hết danh sách.
 *
 * `suggestLayouts` làm cùng việc đó nhưng với tỉ lệ thật của những ảnh đang chọn: ô nào ôm sát ảnh nấy, ít bị cắt nhất.
 */

/** Một ô, tính theo phần của khung (0…1). */
interface Box {
  w: number
  h: number
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

/* ───────────── Chấm điểm ───────────── */

/** Ô đẹp nằm trong khoảng ảnh dọc 2:3 tới ảnh ngang 16:9; ra ngoài khoảng này bị phạt nặng dần. */
const SLIM = 2 / 3
const WIDE = 16 / 9
/** Những tỉ lệ ảnh quen mắt. Ô lệch khỏi chúng một chút chỉ bị phạt nhẹ. */
const FAMILIAR = [2 / 3, 3 / 4, 4 / 5, 1, 5 / 4, 4 / 3, 3 / 2, 16 / 9]

function shapeCost(aspect: number): number {
  const out = aspect < SLIM ? Math.log(SLIM / aspect) : aspect > WIDE ? Math.log(aspect / WIDE) : 0
  let off = Infinity
  for (const f of FAMILIAR) off = Math.min(off, Math.abs(Math.log(aspect / f)))
  return out * out * 14 + off * 0.6
}

/** Điểm của một bố cục gồm các ô `boxes` trên khung có tỉ lệ rộng/cao `frame`. Càng thấp càng đẹp. */
export function quality(boxes: readonly Box[], frame: number, nested = false): number {
  const short = Math.min(frame, 1)
  let total = 0
  let worst = 0
  let minArea = Infinity
  let maxArea = 0
  let minSide = Infinity
  const sizes = new Set<string>()
  for (const b of boxes) {
    const w = b.w * frame
    const cost = shapeCost(w / b.h)
    total += cost
    worst = Math.max(worst, cost)
    minArea = Math.min(minArea, w * b.h)
    maxArea = Math.max(maxArea, w * b.h)
    minSide = Math.min(minSide, Math.min(w, b.h) / short)
    sizes.add(`${Math.round(b.w * 25)},${Math.round(b.h * 25)}`)
  }
  return (
    total / boxes.length +
    worst * 0.5 +
    // Nhiều cỡ ô khác nhau thì rối mắt.
    Math.max(0, sizes.size - 2) * 0.1 +
    // Ô lớn nhất gấp quá 4 lần ô nhỏ nhất thì mất cân đối.
    Math.max(0, Math.log(maxArea / minArea) - Math.log(4)) * 0.25 +
    // Ô có cạnh ngắn hơn một phần năm cạnh ngắn của khung thì ảnh bên trong bé tới mức không xem được.
    Math.max(0, 0.21 - minSide) * 6 +
    (nested ? 0.08 : 0)
  )
}

/* ───────────── Canh tỉ lệ ô ───────────── */

/**
 * Đặt lại trọng số của cây sao cho ô thứ i có đúng tỉ lệ rộng/cao `aspects[i]`. Trả về cây mới và tỉ lệ của cả khối khi
 * mọi ô đúng tỉ lệ; khung có tỉ lệ khác thì các ô lệch đi đúng bằng mức chênh đó.
 */
export function justify(root: LayoutNode, aspects: readonly number[]): { tree: LayoutNode; aspect: number } {
  let next = 0
  const walk = (node: LayoutNode): { tree: LayoutNode; aspect: number } => {
    if (node.kind === 'cell') return { tree: node, aspect: aspects[next++] ?? 1 }
    const kids = node.children.map(walk)
    // Xếp ngang: các phần cùng chiều cao nên bề rộng tỉ lệ theo tỉ lệ từng phần. Xếp dọc thì ngược lại.
    const weights = kids.map((k) => (node.dir === 'h' ? k.aspect : 1 / k.aspect))
    const total = sum(weights)
    return { tree: { ...node, children: kids.map((k) => k.tree), weights }, aspect: node.dir === 'h' ? total : 1 / total }
  }
  return walk(root)
}

const transpose = (node: LayoutNode): LayoutNode =>
  node.kind === 'cell' ? node : { ...node, dir: node.dir === 'h' ? 'v' : 'h', children: node.children.map(transpose) }

const depth = (node: LayoutNode): number => (node.kind === 'cell' ? 0 : 1 + Math.max(...node.children.map(depth)))

/** Làm tròn trọng số qua chuỗi DSL, để cây và id luôn khớp nhau. */
const settle = (tree: LayoutNode): { id: string; tree: LayoutNode } => {
  const id = formatLayout(tree)
  return { id, tree: parseLayout(id) }
}

/** Các ô của cây trên khung tỉ lệ `frame`, tính theo phần của khung. */
function boxesOf(tree: LayoutNode, frame: number): Box[] {
  const w = Math.round(1200 * Math.sqrt(frame))
  const h = Math.round(1200 / Math.sqrt(frame))
  return computeLayout(tree, { x: 0, y: 0, w, h }, 0).cells.map((c) => ({ w: c.w / w, h: c.h / h }))
}

/**
 * "Dáng nhìn" của một bố cục trên khung `frame`. Hai bố cục có các đường chia lệch nhau dưới chừng 7% khung thì cùng dáng
 * nhìn: trên thumbnail không phân biệt nổi. Cũng dùng để biết ô nào trong danh sách đang nằm trên khung.
 */
export function layoutLook(tree: LayoutNode, frame: number): string {
  const w = Math.round(1200 * Math.sqrt(frame))
  const h = Math.round(1200 / Math.sqrt(frame))
  const step = (v: number, size: number) => Math.round((v / size) * 14)
  return computeLayout(tree, { x: 0, y: 0, w, h }, 0)
    .cells.map((c) => `${step(c.x, w)},${step(c.y, h)},${step(c.x + c.w, w)},${step(c.y + c.h, h)}`)
    .sort()
    .join('|')
}

/* ───────────── Ứng viên: xếp hàng ───────────── */

/** Mọi cách tách n ảnh thành các hàng, vd 5 → [2,3], [3,2], [1,2,2]… */
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

const MAX_PER_ROW = 4
const rowLimit = (n: number) => (n > 8 ? 5 : 4)

/**
 * Các kiểu hàng: mỗi số là bề rộng tương đối của tỉ lệ ô (1 = ô chuẩn, 2 = ô ngang gấp đôi, như ảnh ngang cạnh ảnh dọc).
 * Hàng một ô có thêm 3, để ra được ảnh lớn nằm ngang trên một hàng ba ảnh.
 */
const ROW_STYLES: { ratios: number[]; mixed: boolean }[][] = [
  [],
  [1, 1.5, 2, 3].map((r) => ({ ratios: [r], mixed: false })),
  [
    { ratios: [1, 1], mixed: false },
    { ratios: [1.5, 1.5], mixed: false },
    { ratios: [2, 2], mixed: false },
    { ratios: [1, 2], mixed: true },
    { ratios: [2, 1], mixed: true },
  ],
  [
    { ratios: [1, 1, 1], mixed: false },
    { ratios: [1.5, 1.5, 1.5], mixed: false },
    { ratios: [1, 1, 2], mixed: true },
    { ratios: [2, 1, 1], mixed: true },
    { ratios: [1, 2, 1], mixed: true },
  ],
  [
    { ratios: [1, 1, 1, 1], mixed: false },
    { ratios: [1.5, 1.5, 1.5, 1.5], mixed: false },
  ],
]

interface Candidate {
  cost: number
  /** Kiểu chia (số ảnh từng hàng, không kể thứ tự): để một kiểu không chiếm hết danh sách. */
  family: string
  /** Kiểu chia kể cả thứ tự hàng. */
  variant: string
  build: () => LayoutNode
}

const row = (ratios: readonly number[]): LayoutNode =>
  ratios.length === 1 ? { kind: 'cell' } : { kind: 'split', dir: 'h', children: ratios.map(() => ({ kind: 'cell' })), weights: [...ratios] }

/** Cây của các hàng `rows` (mỗi hàng là tỉ lệ từng ô), độ cao hàng canh theo tỉ lệ ô. */
function stack(rows: readonly (readonly number[])[], columns: boolean): LayoutNode {
  const tree: LayoutNode =
    rows.length === 1 ? row(rows[0]) : { kind: 'split', dir: 'v', children: rows.map(row), weights: rows.map((r) => 1 / sum(r)) }
  return columns ? transpose(tree) : tree
}

/** Các ô của một bố cục xếp hàng, tính thẳng bằng số học (không dựng cây): có hàng trăm nghìn tổ hợp cần chấm. */
function stackBoxes(rows: readonly (readonly number[])[], columns: boolean): Box[] {
  const heights = rows.map((r) => 1 / sum(r))
  const total = sum(heights)
  const out: Box[] = []
  rows.forEach((r, i) => {
    const width = sum(r)
    for (const ratio of r) {
      const along = ratio / width
      const across = heights[i] / total
      out.push(columns ? { w: across, h: along } : { w: along, h: across })
    }
  })
  return out
}

function stackCandidates(n: number, frame: number, ceiling: number): Candidate[] {
  const out: Candidate[] = []
  for (const parts of compositions(n, MAX_PER_ROW, rowLimit(n))) {
    const family = [...parts].sort().join()
    const variant = parts.join()
    const rows: number[][] = []
    // Năm hàng thì đã đủ rối: không thêm hàng phá cách nữa (cũng để khỏi phải chấm quá nhiều tổ hợp).
    const plain = parts.length > 4
    const walk = (i: number, mixedUsed: boolean, least: number) => {
      if (i === parts.length) {
        // Nhân mọi tỉ lệ với cùng một số thì ra đúng bố cục cũ: chỉ giữ bản có ô chuẩn.
        if (least !== 1) return
        for (const columns of [false, true]) {
          const cost = quality(stackBoxes(rows, columns), frame)
          if (cost > ceiling) continue
          const frozen = rows.map((r) => [...r])
          const side = columns ? 'c' : 'r'
          // Bản có hàng phá cách được tính riêng, để nó không bị các bản đều đặn của cùng kiểu chia chiếm hết chỗ.
          out.push({ cost, family: `${side}${family}`, variant: `${side}${variant}${mixedUsed ? '~' : ''}`, build: () => stack(frozen, columns) })
        }
        return
      }
      for (const style of ROW_STYLES[parts[i]]) {
        // Chỉ một hàng được phá cách (ô to ô nhỏ); nhiều hơn thì bố cục thành lộn xộn.
        if (style.mixed && (mixedUsed || plain)) continue
        rows.push(style.ratios)
        walk(i + 1, mixedUsed || style.mixed, Math.min(least, ...style.ratios))
        rows.pop()
      }
    }
    walk(0, false, Infinity)
  }
  return out
}

/* ───────────── Ứng viên: có ô chủ đạo ───────────── */

/** Cấu trúc các bố cục khai báo sẵn cho n ảnh (ảnh lớn + dải ảnh nhỏ, ôm góc, xoắn ốc…). */
const structures = new Map<number, LayoutNode[]>()
function structuresFor(n: number): LayoutNode[] {
  let list = structures.get(n)
  if (!list) {
    const dsls = [...GENERATORS.flatMap((g) => g.generate(n)), ...HANDCRAFTED.map((h) => h.dsl)]
    list = dsls.map(parseLayout).filter((tree) => countCells(tree) === n && depth(tree) > 2)
    structures.set(n, list)
  }
  return list
}

function nestedCandidates(n: number, frame: number, ceiling: number): Candidate[] {
  const out: Candidate[] = []
  const ones = Array<number>(n).fill(1)
  for (const designed of structuresFor(n)) {
    // Bản nguyên gốc, và bản canh lại cho mọi ô cùng một tỉ lệ.
    for (const tree of [designed, justify(designed, ones).tree]) {
      const cost = quality(boxesOf(tree, frame), frame, true)
      if (cost <= ceiling) out.push({ cost, family: 'x', variant: `x${formatLayout(designed)}`, build: () => tree })
    }
  }
  return out
}

/* ───────────── Danh sách cho một khung ───────────── */

/** Danh sách dài nhất. */
const MOST = 24
/** Cố lấy đủ chừng này lựa chọn trong số những bố cục khá trở lên, dù chúng kém bố cục đẹp nhất nhiều. */
const FEWEST = 6
/** Khung quá dị (ảnh bìa siêu dẹt, mười ảnh trên khung story) có thể không còn bố cục nào khá: vẫn phải có vài lựa chọn. */
const FLOOR = 3
/** Chỉ lấy những bố cục kém bố cục đẹp nhất không quá mức này. */
const SPREAD = 0.55
/** Một kiểu chia hàng (không kể thứ tự) góp tối đa bấy nhiêu bố cục; kể cả thứ tự thì ít hơn. */
const PER_FAMILY = 5
const PER_VARIANT = 2
/** Bố cục có ô chủ đạo: tối đa chừng này, để danh sách vẫn chủ yếu là các kiểu xếp hàng sạch sẽ. */
const MOST_NESTED = 6

function pick(candidates: Candidate[], frame: number, most: number, fewest: number, spread: number): LayoutDef[] {
  candidates.sort((a, b) => a.cost - b.cost)
  const out: LayoutDef[] = []
  const looks = new Set<string>()
  const used = new Map<string, number>()
  const best = candidates[0]?.cost ?? 0
  for (const c of candidates) {
    if (out.length >= most) break
    if (out.length >= fewest && c.cost > best + spread) break
    const family = used.get(c.family) ?? 0
    const variant = used.get(c.variant) ?? 0
    if (c.family === 'x' ? family >= MOST_NESTED || variant >= 1 : family >= PER_FAMILY || variant >= PER_VARIANT) continue
    const { id, tree } = settle(c.build())
    const look = layoutLook(tree, frame)
    if (looks.has(look)) continue
    looks.add(look)
    used.set(c.family, family + 1)
    used.set(c.variant, variant + 1)
    out.push({ id, n: countCells(tree) })
  }
  return out
}

/** Tỉ lệ khung dùng để chọn bố cục: kẹp lại và làm tròn, để khung 1080×1350 và 1081×1350 dùng chung một danh sách. */
export const frameKey = (frame: number) => Math.round(Math.min(3, Math.max(0.33, frame)) * 20) / 20

const curated = new Map<string, LayoutDef[]>()

/** Các bố cục đẹp cho n ảnh trên khung có tỉ lệ rộng/cao `frame`, đẹp nhất đứng trước. */
export function curatedLayouts(n: number, frame: number): LayoutDef[] {
  const key = `${n}@${frameKey(frame)}`
  let list = curated.get(key)
  if (!list) {
    const f = frameKey(frame)
    if (n === 1) list = [{ id: '*', n: 1 }]
    else {
      // Chỉ xét những bố cục khá trở lên; khung quá dị không còn mấy cái thì mới xét hết.
      list = pick([...stackCandidates(n, f, 1.6), ...nestedCandidates(n, f, 1.6)], f, MOST, FEWEST, SPREAD)
      if (list.length < FLOOR) list = pick([...stackCandidates(n, f, Infinity), ...nestedCandidates(n, f, Infinity)], f, FLOOR, FLOOR, Infinity)
    }
    curated.set(key, list)
  }
  return list
}

/* ───────────── Gợi ý theo ảnh đang chọn ───────────── */

/** Ảnh toàn cảnh siêu dài cũng chỉ được coi là 2:1 (hoặc 1:2), kẻo cả bố cục bị kéo theo một tấm. */
const clampAspect = (a: number) => Math.min(2, Math.max(0.5, a))

/**
 * Các bố cục ôm sát nhất những ảnh đang chọn: `aspects[i]` là tỉ lệ rộng/cao của ảnh ở ô thứ i (null = ô trống). Ảnh giữ
 * nguyên thứ tự; mỗi bố cục được canh để ô nào có tỉ lệ của ảnh nấy, rồi xếp hạng theo mức ảnh bị cắt trên khung `frame`.
 */
export function suggestLayouts(aspects: readonly (number | null)[], frame: number, limit = 4): LayoutDef[] {
  const n = aspects.length
  const known = aspects.filter((a): a is number => a !== null).map(clampAspect)
  if (n < 2 || !known.length) return []
  const f = frameKey(frame)
  // Ô trống lấy tỉ lệ "ở giữa" của các ảnh đã có.
  const filler = Math.exp(sum(known.map(Math.log)) / known.length)
  const want = aspects.map((a) => (a === null ? filler : clampAspect(a)))

  // `extra`: điểm cộng thêm cho kiểu bố cục khó đọc hơn.
  const shapes: { tree: LayoutNode; family: string; variant: string; extra: number }[] = []
  for (const parts of compositions(n, MAX_PER_ROW, rowLimit(n))) {
    const rows = parts.map((k) => Array<number>(k).fill(1))
    const family = [...parts].sort().join()
    for (const columns of [false, true])
      shapes.push({ tree: stack(rows, columns), family: `${columns ? 'c' : 'r'}${family}`, variant: `${columns ? 'c' : 'r'}${parts.join()}`, extra: columns ? 0.1 : 0 })
  }
  for (const tree of structuresFor(n)) shapes.push({ tree, family: 'x', variant: `x${formatLayout(tree)}`, extra: 0.3 })

  const candidates: Candidate[] = shapes.map(({ tree, family, variant, extra }) => {
    const fitted = justify(tree, want).tree
    const boxes = boxesOf(fitted, f)
    // Mức cắt ảnh: ô lệch tỉ lệ ảnh bao nhiêu thì ảnh mất bấy nhiêu.
    let crop = 0
    boxes.forEach((b, i) => {
      if (aspects[i] !== null) crop += Math.abs(Math.log((b.w * f) / b.h / want[i]))
    })
    // Lệch dưới chừng 15% thì mắt không nhận ra, không tính. Xếp theo hàng đọc ảnh đúng thứ tự trái sang phải, trên xuống
    // dưới, nên được ưu tiên hơn xếp theo cột, rồi mới tới bố cục lồng nhau.
    const cut = Math.max(0, crop / known.length - 0.15)
    // Các ô chênh cỡ nhau nhiều (cột hai ảnh to cạnh cột bốn ảnh bé) thì kém cân đối.
    const areas = boxes.map((b) => Math.log(b.w * b.h))
    const mean = sum(areas) / n
    const uneven = Math.sqrt(sum(areas.map((a) => (a - mean) ** 2)) / n)
    return { cost: cut * 3 + uneven * 0.6 + quality(boxes, f) + extra, family, variant, build: () => fitted }
  })
  return pick(candidates, f, limit, Math.min(2, limit), 0.5)
}

/** Bố cục dùng khi vừa chọn ảnh: gợi ý ôm ảnh nhất; chưa có ảnh nào thì là bố cục đẹp nhất của khung. */
export function defaultLayout(aspects: readonly (number | null)[], frame: number): string {
  return (suggestLayouts(aspects, frame, 1)[0] ?? curatedLayouts(aspects.length, frame)[0]).id
}
