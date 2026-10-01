export type Rotation = 0 | 90 | 180 | 270

/** Tinh chỉnh của một ảnh trong ô: zoom ≥ 1, tâm crop (0..1 theo phần ảnh bị tràn), lật ngang, xoay bội số 90°. */
export interface CellAdjust {
  zoom: number
  cx: number
  cy: number
  flip: boolean
  rot: Rotation
}

export const DEFAULT_ADJUST: CellAdjust = { zoom: 1, cx: 0.5, cy: 0.5, flip: false, rot: 0 }
export const MAX_ZOOM = 4

export const isSideways = (adj: CellAdjust) => (adj.rot ?? 0) % 180 !== 0

export interface Placement {
  /** Kích thước ảnh (sau khi xoay) khi scale để phủ kín ô — đơn vị: px của ô. */
  dw: number
  dh: number
  /** Vị trí góc trên-trái ảnh so với ô (≤ 0). */
  left: number
  top: number
  /** px ô trên mỗi px ảnh gốc. > 1 nghĩa là ảnh đang bị phóng to quá độ phân giải gốc. */
  scale: number
}

/**
 * Đặt ảnh iw×ih (kích thước gốc, chưa xoay) phủ kín ô cw×ch kiểu object-fit: cover, rồi áp zoom + tâm crop.
 * Dùng chung cho preview và export nên hai bên luôn khớp nhau.
 */
export function placeImage(iw: number, ih: number, cw: number, ch: number, adj: CellAdjust): Placement {
  const ow = isSideways(adj) ? ih : iw
  const oh = isSideways(adj) ? iw : ih
  const scale = Math.max(cw / ow, ch / oh) * adj.zoom
  const dw = ow * scale
  const dh = oh * scale
  return { dw, dh, left: -(dw - cw) * adj.cx, top: -(dh - ch) * adj.cy, scale }
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
