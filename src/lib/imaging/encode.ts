import { pngWithSrgb, withIccFrom } from './metadata'
import { encodeJpeg } from './tasks'

function canvasBytes(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject) : reject(new Error('Không mã hoá được ảnh'))),
      type,
      quality,
    ),
  )
}

let profileSource: Promise<Uint8Array> | undefined
/** Một JPEG tí hon do Chromium mã hoá: nó mang sẵn hồ sơ màu sRGB chuẩn để chép sang file xuất. */
function srgbProfileSource(): Promise<Uint8Array> {
  if (!profileSource) {
    const canvas = Object.assign(document.createElement('canvas'), { width: 2, height: 2 })
    // Phải vẽ thật: canvas chưa từng có nội dung được mã hoá theo đường tắt, không kèm hồ sơ màu.
    canvas.getContext('2d')!.fillRect(0, 0, 2, 2)
    profileSource = canvasBytes(canvas, 'image/jpeg', 0.5)
  }
  return profileSource
}

/**
 * Mã hoá ảnh ghép thành file.
 *  - JPEG: MozJPEG, màu 4:4:4, gắn hồ sơ màu sRGB — ngang với "Export" của Lightroom / "Save for Web" của Photoshop.
 *  - PNG: không mất dữ liệu, gắn nhãn sRGB.
 *  - WebP: bộ mã hoá của Chromium.
 */
export async function encodeCanvas(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Uint8Array> {
  if (type === 'image/png') return pngWithSrgb(await canvasBytes(canvas, type))
  if (type !== 'image/jpeg') return canvasBytes(canvas, type, quality)
  try {
    return withIccFrom(await srgbProfileSource(), await encodeJpeg(canvas, quality))
  } catch {
    // Ảnh quá lớn so với bộ nhớ của WebAssembly → dùng bộ mã hoá có sẵn (màu 4:2:0) thay vì báo lỗi.
    return canvasBytes(canvas, type, quality)
  }
}
