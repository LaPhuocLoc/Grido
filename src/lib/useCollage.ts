import { create } from 'zustand'
import type { Photo } from '../../shared/types'
import { canvasSize, pctToPx, useStore, type ExportFormat, type ExportSharpen } from '../store'
import { desktop } from './desktop'
import { DEFAULT_ADJUST } from './geometry'
import { encodeCanvas } from './imaging/encode'
import { renderCollage, type CollageSpec } from './imaging/exportCollage'

type StoreState = ReturnType<typeof useStore.getState>
export type SpecSource = Pick<
  StoreState,
  'tree' | 'photos' | 'selected' | 'adjust' | 'texts' | 'bg' | 'margin' | 'gap' | 'radius' | 'presetId' | 'customW' | 'customH'
>

/** Dựng thông số ảnh ghép ở hệ số `scale` (1 = kích thước khung gốc). Null nếu chưa chọn ảnh. */
export function buildSpec(s: SpecSource, scale = 1): CollageSpec | null {
  if (!s.tree) return null
  const base = canvasSize(s)
  const width = Math.round(base.width * scale)
  const height = Math.round(base.height * scale)
  const byId = new Map(s.photos.map((p) => [p.id, p]))
  const cells = s.selected
    .map((id) => byId.get(id))
    .filter((p): p is Photo => !!p)
    // Gộp với mặc định để bản nháp lưu từ phiên bản cũ (thiếu trường mới) vẫn dùng được.
    .map((photo) => ({ photo, adjust: { ...DEFAULT_ADJUST, ...s.adjust[photo.id] } }))
  return {
    width,
    height,
    bg: s.bg,
    margin: pctToPx(s.margin, width, height),
    gap: pctToPx(s.gap, width, height),
    radius: pctToPx(s.radius, width, height),
    tree: s.tree,
    cells,
    texts: s.texts,
  }
}

const EXT: Record<ExportFormat, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** Mức làm nét đầu ra → cường độ unsharp mask. "Chuẩn" tương đương Sharpen for Screen: Standard của Lightroom. */
export const SHARPEN_AMOUNT: Record<ExportSharpen, number> = { off: 0, low: 0.3, standard: 0.55, high: 0.9 }

/** Tiến độ xuất ảnh (0..1), null khi không xuất. */
export const useExportProgress = create<{ progress: number | null }>(() => ({ progress: null }))

/** Dựng ảnh ghép ở độ phân giải xuất rồi lưu ra file do người dùng chọn. */
export async function exportToFile() {
  const s = useStore.getState()
  if (useExportProgress.getState().progress !== null) return
  // File xuất đúng bằng kích thước khung (1×).
  const spec = buildSpec(s)
  if (!spec) return s.toast('Chọn ít nhất một ảnh để ghép đã nhé.')
  useExportProgress.setState({ progress: 0 })
  try {
    // Hỏi nơi lưu trước: người dùng huỷ thì khỏi tốn công dựng ảnh.
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
    const target = await desktop.exportFile.pick(`tiem-ghep-anh-${stamp}.${EXT[s.exportFormat]}`)
    if (!target) return
    const canvas = await renderCollage(spec, SHARPEN_AMOUNT[s.exportSharpen], (done, total) =>
      useExportProgress.setState({ progress: (done / total) * 0.8 }),
    )
    useExportProgress.setState({ progress: 0.85 })
    const bytes = await encodeCanvas(canvas, s.exportFormat, s.exportQuality)
    canvas.width = canvas.height = 0
    useExportProgress.setState({ progress: 0.97 })
    await desktop.exportFile.write(target, bytes.buffer as ArrayBuffer)
    s.toast(
      `Đã xuất ảnh ${spec.width} × ${spec.height}px (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`,
      'success',
      // Trình duyệt không mở được trình quản lý file.
      desktop.features.reveal ? { label: 'Mở thư mục', run: () => void desktop.exportFile.reveal(target) } : undefined,
    )
  } catch (err) {
    s.toast((err as Error).message || 'Xuất ảnh thất bại, thử lại nhé.', 'error')
  } finally {
    useExportProgress.setState({ progress: null })
  }
}
