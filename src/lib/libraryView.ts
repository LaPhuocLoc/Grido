import type { Photo } from '../../shared/types'
import { plain } from './fontSearch'

/**
 * Chuỗi để tìm một ảnh: tên file, thư mục, máy, ống kính, giả lập phim, ngày chụp (gõ "2026-03-28", "28/03/2026" hay
 * "03/2026" đều ra), không phân biệt dấu.
 */
function haystack(p: Photo): string {
  const e = p.exif
  const date = e?.takenAt?.match(/^(\d{4})-(\d\d)-(\d\d)/)
  const dates = date ? `${date[1]}-${date[2]}-${date[3]} ${date[3]}/${date[2]}/${date[1]} ${date[2]}/${date[1]}` : ''
  return plain([p.name, p.path, e?.make, e?.model, e?.lens, e?.filmSimulation, dates].filter(Boolean).join(' '))
}

/** Ảnh khớp mọi từ trong `query` (giữ nguyên thứ tự). Từ khoá rỗng = mọi ảnh. */
export function searchPhotos(photos: Photo[], query: string): Photo[] {
  const words = plain(query).split(/\s+/).filter(Boolean)
  if (!words.length) return photos
  return photos.filter((p) => {
    const text = haystack(p)
    return words.every((w) => text.includes(w))
  })
}

export interface Row {
  /** Vị trí ảnh đầu hàng trong danh sách. */
  start: number
  count: number
  height: number
}

// Ảnh toàn cảnh rất dài / rất cao vẫn hiện được trọn trong một ô không quá dẹt.
const MIN_ASPECT = 0.5
const MAX_ASPECT = 2.6

/**
 * Xếp ảnh thành từng hàng cao bằng nhau, giữ đúng tỉ lệ từng ảnh (không cắt), mỗi hàng vừa khít bề rộng `width` — như
 * lưới ảnh của Google Photos / Lightroom. Hàng cuối chưa đủ ảnh thì giữ chiều cao `target`, không kéo giãn.
 */
export function justify(aspects: number[], width: number, target: number, gap: number): Row[] {
  const rows: Row[] = []
  let start = 0
  let sum = 0
  for (let i = 0; i < aspects.length; i++) {
    sum += Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspects[i] || 1))
    const count = i - start + 1
    if (sum * target + gap * (count - 1) >= width) {
      rows.push({ start, count, height: (width - gap * (count - 1)) / sum })
      start = i + 1
      sum = 0
    }
  }
  if (start < aspects.length) rows.push({ start, count: aspects.length - start, height: target })
  return rows
}

/** Tỉ lệ khung hiển thị của ảnh trong lưới (đã giới hạn như `justify`). */
export const tileAspect = (aspect: number) => Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect || 1))
