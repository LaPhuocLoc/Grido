import type { Photo } from '../../../shared/types'
import { desktop } from '../desktop'
import type { CellAdjust } from '../geometry'
import { computeLayout } from '../layout/compute'
import type { LayoutNode } from '../layout/types'
import { drawText, type TextItem } from '../text'
import { renderCell } from './tasks'

export interface CollageCell {
  photo: Photo
  adjust: CellAdjust
}

export interface CollageSpec {
  width: number
  height: number
  bg: string
  /** Đơn vị px trên khung width×height. */
  margin: number
  gap: number
  radius: number
  tree: LayoutNode
  /** Theo thứ tự ô của `tree`; null = ô còn trống (chỉ thấy màu nền). */
  cells: (CollageCell | null)[]
  texts: TextItem[]
}

export function collageLayout(spec: Pick<CollageSpec, 'width' | 'height' | 'margin' | 'gap' | 'tree'>) {
  const m = spec.margin
  return computeLayout(spec.tree, { x: m, y: m, w: spec.width - 2 * m, h: spec.height - 2 * m }, spec.gap)
}

/**
 * Dựng ảnh ghép ở độ phân giải xuất. Từng ô được cắt + resize trong Web Worker từ file gốc trên đĩa;
 * ở đây chỉ dán kết quả lên canvas tại toạ độ nguyên (không nội suy thêm lần nào) rồi vẽ chữ.
 * `sharpen`: mức làm nét đầu ra (0 = tắt). `onPreview`: báo tên ảnh không đọc được file gốc, phải dựng từ bản xem trước
 * (cạnh dài 2560px) — kém nét hơn nếu ô lớn.
 */
export async function renderCollage(
  spec: CollageSpec,
  sharpen: number,
  onProgress?: (done: number, total: number) => void,
  onPreview?: (name: string) => void,
) {
  const { cells: rects } = collageLayout(spec)
  const canvas = document.createElement('canvas')
  canvas.width = spec.width
  canvas.height = spec.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = spec.bg
  ctx.fillRect(0, 0, spec.width, spec.height)

  let done = 0
  const total = Math.min(rects.length, spec.cells.length)
  await Promise.all(
    rects.slice(0, total).map(async (rect, i) => {
      const cell = spec.cells[i]
      // Ô trống: chỉ còn màu nền của khung.
      if (!cell || rect.w < 1 || rect.h < 1) return
      const { photo, adjust } = cell
      const raster = await renderCell({
        // File gốc trước; đã bị dời đi (hoặc chưa có quyền đọc) thì dùng thẳng bản xem trước.
        sources: await desktop.images.cellSources(photo),
        adjust,
        width: rect.w,
        height: rect.h,
        sharpen,
      }).catch(() => {
        throw new Error(`Không đọc được ảnh "${photo.name}".`)
      })
      if (raster.fromPreview) onPreview?.(photo.name)
      const image = new ImageData(raster.data as Uint8ClampedArray<ArrayBuffer>, rect.w, rect.h)
      const r = Math.min(spec.radius, rect.w / 2, rect.h / 2)
      if (r <= 0) ctx.putImageData(image, rect.x, rect.y)
      else {
        // Bo góc: phải vẽ qua drawImage để mép cong được khử răng cưa; vẫn 1:1 tại toạ độ nguyên.
        const bitmap = await createImageBitmap(image)
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(rect.x, rect.y, rect.w, rect.h, r)
        ctx.clip()
        ctx.drawImage(bitmap, rect.x, rect.y)
        ctx.restore()
        bitmap.close()
      }
      onProgress?.(++done, total)
    }),
  )
  const unit = Math.min(spec.width, spec.height) / 100
  for (const item of spec.texts)
    if (item.text.trim())
      await drawText(ctx, item, item.x * spec.width, item.y * spec.height, item.size * unit, item.width ? item.width * spec.width : null)
  return canvas
}
