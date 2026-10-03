/** Cửa ngõ của phần bố cục: giới hạn số ảnh và danh sách bố cục đã chọn lọc (xem `curate.ts`). */
export { curatedLayouts as getLayouts, defaultLayout, frameKey, layoutLook, suggestLayouts } from './curate'

/** Một ảnh ghép chứa tối đa bấy nhiêu ảnh. Thiết kế cũ có 11–12 ảnh vẫn mở và xuất được, chỉ không tạo mới được nữa. */
export const MAX_PHOTOS = 10
