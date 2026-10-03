import { create } from 'zustand'
import type { Photo } from '../../shared/types'
import { canvasSize, pctToPx, useStore, type ExportFormat, type ExportSharpen } from '../store'
import { desktop } from './desktop'
import { DEFAULT_ADJUST } from './geometry'
import { encodeCanvas } from './imaging/encode'
import { exportExif } from './imaging/exif'
import { renderCollage, type CollageSpec } from './imaging/exportCollage'
import { jpegSubsampling } from './imaging/metadata'

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

/**
 * Mức làm nét đầu ra → cường độ (xem `sharpen.ts`). "Cao" = 1 được dò khớp Output Sharpening: Screen · High của Lightroom;
 * "Thấp" / "Tiêu chuẩn" là ước lượng cho Low / Standard (chưa có cặp ảnh Lightroom ở hai mức này để đo).
 */
export const SHARPEN_AMOUNT: Record<ExportSharpen, number> = { off: 0, low: 0.4, standard: 0.7, high: 1 }

/**
 * Tiến độ xuất ảnh (0..1, null khi không xuất) và file vừa xuất gần nhất (bản web: để phần Xuất luôn cho biết ảnh nằm ở
 * đâu, xem lại được ngay).
 */
export const useExportProgress = create<{ progress: number | null; last: { file: string; folder: string; target: string } | null }>(() => ({
  progress: null,
  last: null,
}))

/**
 * Bản web: hộp nhắc cho phép đọc lại ảnh gốc / ghi vào thư mục xuất, hiện ngay trước khi xuất. Trình duyệt chỉ cho xin
 * quyền trong một cú bấm và mỗi cú bấm chỉ một hộp thoại, nên app hỏi bằng hộp của mình trước, rồi xin quyền trong cú
 * bấm "Cho phép" của hộp đó.
 */
export const useAccessPrompt = create<{ open: boolean }>(() => ({ open: false }))
let answerAccess: ((ok: boolean) => void) | null = null
/** Đã hỏi trong lần mở trang này: ảnh nào người dùng vẫn không cho đọc thì thôi, không hỏi lại mỗi lần xuất. */
let accessAsked = false

/** Người dùng bấm "Cho phép" trong hộp nhắc: xin quyền ghi thư mục xuất rồi quyền đọc mọi ảnh, trong cùng cú bấm đó. */
export async function allowAccess() {
  // Lần xin quyền đầu tiên của mỗi lần tải trang, Chrome gộp mọi file / thư mục app từng được cấp vào một hộp thoại.
  await desktop.exportFile.folder?.grant().catch(() => false)
  if (useStore.getState().photos.some((p) => p.locked)) await useStore.getState().grantAccess()
  closeAccess(true)
}
export function closeAccess(ok = false) {
  useAccessPrompt.setState({ open: false })
  answerAccess?.(ok)
  answerAccess = null
}
const askAccess = () =>
  new Promise<boolean>((resolve) => {
    answerAccess = resolve
    accessAsked = true
    useAccessPrompt.setState({ open: true })
  })

let busy = false

/** Dựng ảnh ghép ở độ phân giải xuất rồi lưu ra file. */
export async function exportToFile() {
  const s = useStore.getState()
  if (busy || useExportProgress.getState().progress !== null) return
  // File xuất đúng bằng kích thước khung (1×).
  const spec = buildSpec(s)
  if (!spec) return s.toast('Chọn ít nhất một ảnh để ghép đã nhé.')
  busy = true
  try {
    // Xuất một ảnh: đặt tên theo ảnh đó để dễ nhận ra; ảnh ghép thì theo thời điểm xuất.
    const photos = new Set(spec.cells.map((c) => c.photo.id))
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
    const fileName = `${photos.size === 1 ? spec.cells[0].photo.name : `tiem-ghep-anh-${stamp}`}.${EXT[s.exportFormat]}`

    // Bản web: lưu thẳng vào thư mục người dùng chọn một lần. Hỏi nơi lưu / quyền trước: người dùng huỷ thì khỏi tốn công dựng ảnh.
    const folder = desktop.exportFile.folder
    let folderName: string | null = null
    if (folder) {
      let current = await folder.current()
      if (!current) {
        const chosen = await folder.choose()
        if (!chosen) return
        current = { name: chosen, ready: true }
      }
      if (!current.ready || (!accessAsked && useStore.getState().photos.some((p) => p.locked))) {
        if (!(await askAccess())) return
        current = await folder.current()
        if (!current?.ready) return s.toast(`Trình duyệt chưa cho lưu vào thư mục "${current?.name ?? ''}". Bấm Xuất lại rồi chọn "Cho phép".`, 'error')
      }
      folderName = current.name
    }
    const target = await desktop.exportFile.pick(fileName)
    if (!target) return
    useExportProgress.setState({ progress: 0 })
    // Ảnh vừa được cho phép đọc thì danh sách ảnh đã đổi: dựng lại thông số để ô đó đọc từ file gốc.
    const fresh = buildSpec(useStore.getState()) ?? spec
    const fromPreview: string[] = []
    const canvas = await renderCollage(
      fresh,
      SHARPEN_AMOUNT[s.exportSharpen],
      (done, total) => useExportProgress.setState({ progress: (done / total) * 0.8 }),
      (name) => fromPreview.push(name),
    )
    useExportProgress.setState({ progress: 0.85 })
    // Xuất một ảnh: kèm EXIF của ảnh đó như Lightroom. Ảnh ghép nhiều ảnh: chỉ ghi kích thước, giờ xuất, không gian màu.
    const exif = exportExif(photos.size === 1 ? fresh.cells[0].photo.exifData : undefined, fresh.width, fresh.height)
    const bytes = await encodeCanvas(canvas, s.exportFormat, s.exportQuality, exif)
    canvas.width = canvas.height = 0
    useExportProgress.setState({ progress: 0.97 })
    await desktop.exportFile.write(target, bytes.buffer as ArrayBuffer)
    const mb = `${(bytes.length / 1024 / 1024).toFixed(1)} MB`
    const view = desktop.exportFile.view
    if (folderName !== null && view) {
      // Trình duyệt không mở được trình quản lý file: nói rõ tên file + thư mục, và cho xem ngay ảnh vừa lưu.
      const file = target.slice(target.indexOf(':') + 1)
      useExportProgress.setState({ last: { file, folder: folderName, target } })
      s.toast(`Đã lưu "${file}" (${spec.width} × ${spec.height}px, ${mb}) vào thư mục "${folderName}".`, 'success', {
        label: 'Xem ảnh',
        run: () => void view(target),
      })
    } else
      s.toast(
        `Đã xuất ảnh ${spec.width} × ${spec.height}px (${mb})`,
        'success',
        desktop.features.reveal ? { label: 'Mở thư mục', run: () => void desktop.exportFile.reveal(target) } : undefined,
      )
    // Hai trường hợp chất lượng bị hạ vì máy không đủ sức: phải nói ra, không để người dùng tưởng ảnh vẫn chuẩn.
    if (fromPreview.length)
      s.toast(
        `${fromPreview.length === 1 ? `Ảnh "${fromPreview[0]}"` : `${fromPreview.length} ảnh`} không đọc được file gốc nên được ` +
          'xuất từ bản xem trước (cạnh dài 2560px), có thể kém nét. Kiểm tra file gốc rồi xuất lại nhé.',
        'error',
      )
    const chroma = s.exportFormat === 'image/jpeg' ? jpegSubsampling(bytes) : null
    if (chroma && chroma !== '4:4:4')
      s.toast('Ảnh quá lớn so với bộ nhớ nên màu được nén 4:2:0 (mép màu đậm hơi nhoè). Giảm kích thước khung để giữ màu đầy đủ.', 'error')
  } catch (err) {
    s.toast((err as Error).message || 'Xuất ảnh thất bại, thử lại nhé.', 'error')
  } finally {
    busy = false
    useExportProgress.setState({ progress: null })
  }
}
