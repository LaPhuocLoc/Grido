import { clamp, isSideways, placeImage, type CellAdjust } from '../geometry'
import type { Rect } from '../layout/types'

/** Vùng ảnh (px nguyên, tính trên ảnh đã lật + xoay) sẽ hiện trong ô — khớp chính xác với preview. */
export function sourceCrop(iw: number, ih: number, rect: Pick<Rect, 'w' | 'h'>, adj: CellAdjust) {
  const ow = isSideways(adj) ? ih : iw
  const oh = isSideways(adj) ? iw : ih
  const p = placeImage(iw, ih, rect.w, rect.h, adj)
  const sw = clamp(Math.round(rect.w / p.scale), 1, ow)
  const sh = clamp(Math.round(rect.h / p.scale), 1, oh)
  return {
    sx: clamp(Math.round(-p.left / p.scale), 0, ow - sw),
    sy: clamp(Math.round(-p.top / p.scale), 0, oh - sh),
    sw,
    sh,
  }
}
