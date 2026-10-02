import { MAX_TEXT_SIZE, MIN_TEXT_SIZE, normalizeText, type FontId, type TextItem } from './text'

/** Một dòng chữ của mẫu: như `TextItem` nhưng chưa có id / nhóm; trường nào bỏ trống thì lấy giá trị mặc định. */
export type TemplateItem = Partial<Omit<TextItem, 'id' | 'group'>> & Pick<TextItem, 'text' | 'x' | 'y' | 'size'>

/**
 * Mẫu chữ của một font: các dòng chữ đặt trên một khung tham chiếu tỉ lệ `aspect` (rộng / cao), cùng quy ước toạ độ
 * với khung ghép (x, y theo tỉ lệ khung; cỡ chữ theo % cạnh ngắn; bề rộng hộp theo tỉ lệ chiều rộng).
 */
export interface TextTemplate {
  font: FontId
  aspect: number
  /** Màu nền của ảnh mẫu gốc: dùng khi vẽ mẫu để so sánh, không chèn vào ảnh ghép. */
  bg: string
  items: TemplateItem[]
}

/** Khung tham chiếu chiếm tối đa bấy nhiêu chiều rộng / chiều cao khung ghép khi chèn mẫu. */
const FIT = { width: 0.8, height: 0.6 }

const round = (v: number, digits: number) => Number(v.toFixed(digits))

/** Khung tham chiếu của mẫu đặt giữa khung ghép `width` × `height` (px). */
export function templateFrame(aspect: number, width: number, height: number) {
  const w = Math.min(width * FIT.width, height * FIT.height * aspect)
  const h = w / aspect
  return { x: (width - w) / 2, y: (height - h) / 2, w, h }
}

/** Quy đổi các dòng chữ của mẫu sang toạ độ khung ghép `width` × `height`; chưa có id và nhóm. */
export function placeTemplate(template: TextTemplate, width: number, height: number): Omit<TextItem, 'id' | 'group'>[] {
  const frame = templateFrame(template.aspect, width, height)
  const scale = Math.min(frame.w, frame.h) / Math.min(width, height)
  return template.items.map((raw) => {
    const { id: _id, group: _group, ...item } = normalizeText({ id: '', ...raw })
    return {
      ...item,
      x: round((frame.x + item.x * frame.w) / width, 4),
      y: round((frame.y + item.y * frame.h) / height, 4),
      size: round(Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, item.size * scale)), 2),
      width: item.width === null ? null : round((item.width * frame.w) / width, 4),
    }
  })
}

/** Hình chữ nhật (px khung ghép) bao quanh một dòng chữ trên khung. */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Mỗi phía của khung tham chiếu chừa bấy nhiêu so với cạnh dài của vùng chữ khi lưu một nhóm thành mẫu. */
const CAPTURE_MARGIN = 0.12

/**
 * Ngược lại với `placeTemplate`: gói một nhóm chữ đang nằm trên khung ghép thành mẫu. Khung tham chiếu là vùng bao
 * quanh cả nhóm (`boxes`, cùng thứ tự với `items`) cộng thêm lề.
 */
export function captureTemplate(items: TextItem[], boxes: Box[], width: number, height: number, font: FontId, bg: string): TextTemplate {
  const left = Math.min(...boxes.map((b) => b.left))
  const top = Math.min(...boxes.map((b) => b.top))
  const right = Math.max(...boxes.map((b) => b.right))
  const bottom = Math.max(...boxes.map((b) => b.bottom))
  const margin = Math.max(right - left, bottom - top) * CAPTURE_MARGIN
  const frame = { x: left - margin, y: top - margin, w: right - left + margin * 2, h: bottom - top + margin * 2 }
  const scale = Math.min(width, height) / Math.min(frame.w, frame.h)
  const defaults = normalizeText({ id: '' }) as unknown as Record<string, unknown>
  return {
    font,
    aspect: round(frame.w / frame.h, 4),
    bg,
    items: items.map(({ id: _id, group: _group, ...item }) => {
      const placed: Record<string, unknown> = {
        ...item,
        x: round((item.x * width - frame.x) / frame.w, 4),
        y: round((item.y * height - frame.y) / frame.h, 4),
        size: round(item.size * scale, 2),
        width: item.width === null ? null : round((item.width * width) / frame.w, 4),
      }
      // File mẫu chỉ ghi những gì khác mặc định cho dễ đọc, dễ sửa tay.
      for (const key of Object.keys(placed))
        if (!['text', 'x', 'y', 'size'].includes(key) && JSON.stringify(placed[key]) === JSON.stringify(defaults[key])) delete placed[key]
      return placed as TemplateItem
    }),
  }
}
