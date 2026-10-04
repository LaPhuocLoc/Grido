import type { CSSProperties } from 'react'
import { isSideways, type CellAdjust, type placeImage } from '../lib/geometry'

/** Kích thước + transform của thẻ img (trước khi xoay) sao cho vùng ảnh đã xoay nằm đúng `placed`. */
export function imageStyle(placed: ReturnType<typeof placeImage>, adjust: CellAdjust): CSSProperties {
  const w = isSideways(adjust) ? placed.dh : placed.dw
  const h = isSideways(adjust) ? placed.dw : placed.dh
  return {
    width: w,
    height: h,
    transform: `translate(${placed.left + (placed.dw - w) / 2}px, ${placed.top + (placed.dh - h) / 2}px) rotate(${adjust.rot}deg) scaleX(${adjust.flip ? -1 : 1})`,
  }
}
