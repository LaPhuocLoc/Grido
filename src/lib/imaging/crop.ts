import { clamp, isSideways, placeImage, type CellAdjust } from '../geometry'
import type { Rect } from '../layout/types'

/** Vùng ảnh (px nguyên, tính trên ảnh đã lật + xoay) sẽ hiện trong ô — khớp chính xác với preview. */
export function sourceCrop(iw: number, ih: number, rect: Pick<Rect, 'w' | 'h'>, adj: CellAdjust) {
  const ow = isSideways(adj) ? ih : iw
  const oh = isSideways(adj) ? iw : ih
  const p = placeImage(iw, ih, rect.w, rect.h, adj)
  // Phần thừa chưa tới 1px ở đầu ra (vd. ảnh 3:2 vào khung 2048×1365) thì co giãn cho vừa như Lightroom, không cắt mất
  // một hàng ảnh gốc (cắt làm lưới lấy mẫu lệch nửa pixel so với bản Lightroom).
  const sw = p.dw - rect.w < 1 ? ow : clamp(Math.round(rect.w / p.scale), 1, ow)
  const sh = p.dh - rect.h < 1 ? oh : clamp(Math.round(rect.h / p.scale), 1, oh)
  return {
    sx: clamp(Math.round(-p.left / p.scale), 0, ow - sw),
    sy: clamp(Math.round(-p.top / p.scale), 0, oh - sh),
    sw,
    sh,
  }
}
