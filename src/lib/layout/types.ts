/**
 * Bố cục là một cây chia ô:
 *  - `cell`: một ô chứa ảnh.
 *  - `split`: chia vùng thành các phần con theo `dir` ('h' = xếp ngang cạnh nhau, 'v' = xếp dọc chồng lên nhau),
 *    kích thước mỗi phần tỉ lệ theo `weights`.
 * Mô hình cây cho phép kéo đường chia để resize ô mà bố cục vẫn luôn kín, không hở, không chồng.
 */
export type Dir = 'h' | 'v'

export type LayoutNode = { kind: 'cell' } | { kind: 'split'; dir: Dir; children: LayoutNode[]; weights: number[] }

export type LayoutCategory = 'grid' | 'hero' | 'mosaic'

export interface LayoutDef {
  /** Chính là chuỗi DSL chuẩn hoá — ổn định, dùng làm id lưu trữ được. */
  id: string
  /** Số ô ảnh. */
  n: number
  category: LayoutCategory
  /** Dáng của bố cục (xem `layoutShape`): các bố cục chỉ khác nhau ở tỉ lệ ô thì cùng dáng. */
  shape: string
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Đường chia giữa phần con `index` và `index + 1` của node tại `path`. */
export interface Divider {
  path: number[]
  index: number
  dir: Dir
  rect: Rect
  /** Số px mà tổng `weightSum` chiếm — để đổi quãng kéo chuột (px) ra weight. */
  span: number
  weightSum: number
}
