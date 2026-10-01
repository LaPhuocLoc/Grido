import { clamp } from './geometry'

/** Mức zoom của khung làm việc, tính theo mức "vừa khung" (1 = vừa khít vùng nhìn). */
export const MIN_VIEW_ZOOM = 0.25
export const MAX_VIEW_ZOOM = 3
/** Khung được kéo lố ra ngoài mép vùng nhìn thêm bấy nhiêu px, để thấy rõ đã tới mép. */
const PAN_MARGIN = 24

export const clampViewZoom = (zoom: number) => clamp(zoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM)

/** Ctrl + lăn chuột: lăn lên phóng to, lăn xuống thu nhỏ; gần mức vừa khung thì hít về đúng mức đó. */
export function zoomByWheel(zoom: number, deltaY: number): number {
  const next = clampViewZoom(zoom * Math.exp(-deltaY * 0.0015))
  return Math.abs(next - 1) < 0.03 ? 1 : next
}

/** Khoảng tối đa (px) được dời khung về mỗi phía theo một chiều; 0 khi khung nằm gọn trong vùng nhìn. */
export const panLimit = (content: number, viewport: number) => (content > viewport ? (content - viewport) / 2 + PAN_MARGIN : 0)

export function clampPan(pan: number, content: number, viewport: number): number {
  const limit = panLimit(content, viewport)
  return clamp(pan, -limit, limit)
}
