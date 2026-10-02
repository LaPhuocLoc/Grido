/**
 * Mọi việc nặng về ảnh chạy ở đây, ngoài luồng giao diện: đọc file, giải mã, cắt, resize Lanczos3, làm nét, mã hoá.
 * Luồng giao diện chỉ gửi yêu cầu và nhận kết quả nên không bao giờ bị khựng, kể cả với file 40–60MP.
 */
import type { CellAdjust } from '../geometry'
import { sourceCrop } from './crop'
import { resample, type Raster } from './resample'
import { sharpen } from './sharpen'

/** Nguồn ảnh: địa chỉ để fetch (bản desktop) hoặc chính file / blob (bản web, đọc thẳng từ đĩa qua file handle). */
export type ImageSource = string | Blob

export type ImagingRequest =
  | { kind: 'prepare'; source: ImageSource }
  | { kind: 'cell'; sources: ImageSource[]; adjust: CellAdjust; width: number; height: number; sharpen: number }
  | { kind: 'jpeg'; bitmap: ImageBitmap; quality: number }

export interface PreparedImport {
  /** Bản xem trước; null nếu file gốc đã đủ nhỏ để dùng luôn làm bản xem trước. */
  preview: Blob | null
  thumb: Blob
  width: number
  height: number
  /** Kích thước file gốc sau khi áp hướng xoay EXIF. */
  sourceWidth: number
  sourceHeight: number
}

export type ImagingResult = PreparedImport | { buffer: ArrayBuffer }
export type ImagingResponse = { id: number; result: ImagingResult } | { id: number; error: string }

const THUMB_EDGE = 480
/**
 * Cạnh dài của bản xem trước. File gốc nằm nguyên trên đĩa và được dùng khi xuất ảnh;
 * bản này chỉ để dàn trang cho mượt (không phải giải mã file 40–60MP mỗi lần vẽ).
 */
const PREVIEW_EDGE = 2560
// q=0.92: gần như không phân biệt được với bản gốc, nhưng nhẹ hơn nhiều so với 1.0.
const PREVIEW_JPEG_QUALITY = 0.92
// Ảnh vốn đã nhỏ hơn giới hạn thì dùng nguyên byte gốc (không nén lại lần hai) nếu không quá nặng.
const KEEP_ORIGINAL_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const KEEP_ORIGINAL_MAX_BYTES = 5 * 1024 * 1024

// Ma trận xoay bội số 90° viết bằng số nguyên để phép xoay chính xác tuyệt đối từng pixel.
const ROTATIONS: Record<number, [number, number, number, number]> = {
  0: [1, 0, 0, 1],
  90: [0, 1, -1, 0],
  180: [-1, 0, 0, -1],
  270: [0, -1, 1, 0],
}

async function read(source: ImageSource): Promise<Blob> {
  if (typeof source !== 'string') return source
  const res = await fetch(source)
  if (!res.ok) throw new Error('Không đọc được file này')
  return res.blob()
}

async function load(source: ImageSource): Promise<{ blob: Blob; bitmap: ImageBitmap }> {
  const blob = await read(source)
  try {
    // Áp dụng luôn hướng xoay EXIF và chuyển về sRGB.
    return { blob, bitmap: await createImageBitmap(blob, { imageOrientation: 'from-image', premultiplyAlpha: 'none' }) }
  } catch {
    throw new Error('Không đọc được định dạng ảnh này')
  }
}

/**
 * Lấy pixel thô của một vùng ảnh ở đúng độ phân giải gốc (không nội suy).
 * Toạ độ vùng cắt tính trên ảnh SAU khi đã lật ngang (`flip`) rồi xoay `rot` độ.
 */
function readPixels(bitmap: ImageBitmap, sx = 0, sy = 0, sw?: number, sh?: number, rot = 0, flip = false): Raster {
  const sideways = rot % 180 !== 0
  const ow = sideways ? bitmap.height : bitmap.width
  const oh = sideways ? bitmap.width : bitmap.height
  sw ??= ow
  sh ??= oh
  const canvas = new OffscreenCanvas(sw, sh)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = false
  ctx.translate(ow / 2 - sx, oh / 2 - sy)
  ctx.transform(...(ROTATIONS[rot] ?? ROTATIONS[0]), 0, 0)
  if (flip) ctx.scale(-1, 1)
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
  return { data: ctx.getImageData(0, 0, sw, sh).data, width: sw, height: sh }
}

/** Mã hoá raster; JPEG/WebP không có alpha đẹp nên trải nền trắng bên dưới để vùng trong suốt không thành đen. */
function encode(raster: Raster, type: string, quality: number): Promise<Blob> {
  const pixels = new OffscreenCanvas(raster.width, raster.height)
  pixels.getContext('2d')!.putImageData(new ImageData(raster.data as Uint8ClampedArray<ArrayBuffer>, raster.width, raster.height), 0, 0)
  const flat = new OffscreenCanvas(raster.width, raster.height)
  const ctx = flat.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, raster.width, raster.height)
  ctx.drawImage(pixels, 0, 0)
  return flat.convertToBlob({ type, quality })
}

async function prepare(source: ImageSource): Promise<PreparedImport> {
  const { blob, bitmap } = await load(source)
  const sourceWidth = bitmap.width
  const sourceHeight = bitmap.height
  const scale = Math.min(1, PREVIEW_EDGE / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const full = readPixels(bitmap)
  bitmap.close()
  const main = scale < 1 ? resample(full, width, height) : full

  const keepOriginal = scale === 1 && KEEP_ORIGINAL_TYPES.includes(blob.type) && blob.size <= KEEP_ORIGINAL_MAX_BYTES
  const preview = keepOriginal ? null : await encode(main, 'image/jpeg', PREVIEW_JPEG_QUALITY)

  const tScale = Math.min(1, THUMB_EDGE / Math.max(width, height))
  const thumbRaster = resample(main, Math.max(1, Math.round(width * tScale)), Math.max(1, Math.round(height * tScale)))
  const thumb = await encode(thumbRaster, 'image/webp', 0.82)
  return { preview, thumb, width, height, sourceWidth, sourceHeight }
}

async function cell(req: Extract<ImagingRequest, { kind: 'cell' }>): Promise<{ buffer: ArrayBuffer }> {
  let failure: unknown
  // Thử lần lượt: file gốc trước, không đọc được (đã bị dời đi, quá lớn so với sức máy) thì dùng bản xem trước.
  for (const source of req.sources) {
    try {
      const { bitmap } = await load(source)
      try {
        const { sx, sy, sw, sh } = sourceCrop(bitmap.width, bitmap.height, { w: req.width, h: req.height }, req.adjust)
        // Cắt ở độ phân giải gốc rồi mới resize MỘT lần duy nhất về đúng kích thước ô → không mất nét do resize nhiều lần.
        const crop = readPixels(bitmap, sx, sy, sw, sh, req.adjust.rot ?? 0, req.adjust.flip)
        const sized = resample(crop, req.width, req.height)
        // Chỉ làm nét khi thu nhỏ; ảnh bị phóng to mà làm nét thì chỉ lộ thêm răng cưa.
        const out = sw >= req.width && sh >= req.height ? sharpen(sized, req.sharpen) : sized
        return { buffer: out.data.buffer as ArrayBuffer }
      } finally {
        bitmap.close()
      }
    } catch (err) {
      failure = err
    }
  }
  throw failure
}

async function jpeg(req: Extract<ImagingRequest, { kind: 'jpeg' }>): Promise<{ buffer: ArrayBuffer }> {
  // MozJPEG (WebAssembly) chỉ nạp khi xuất JPEG.
  const { default: encodeJpeg } = await import('@jsquash/jpeg/encode')
  // Đọc pixel ở đây chứ không phải ở luồng giao diện: với ảnh vài chục MP bước này mất cả trăm mili-giây.
  const canvas = new OffscreenCanvas(req.bitmap.width, req.bitmap.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(req.bitmap, 0, 0)
  req.bitmap.close()
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const buffer = await encodeJpeg(image, {
    quality: req.quality,
    // 4:4:4: màu giữ nguyên độ phân giải như Photoshop / Lightroom ở mức chất lượng cao
    // (bộ mã hoá có sẵn của Chromium luôn giảm màu còn 1/4, làm nhoè mép màu đỏ / xanh).
    auto_subsample: false,
    chroma_subsample: 1,
    // Baseline + bảng Huffman tối ưu: nhanh gấp đôi progressive, file chỉ nặng hơn ~2%, chất lượng y hệt.
    progressive: false,
  })
  return { buffer }
}

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = async (e: MessageEvent<ImagingRequest & { id: number }>) => {
  const { id, ...req } = e.data
  try {
    const result = req.kind === 'prepare' ? await prepare(req.source) : req.kind === 'cell' ? await cell(req) : await jpeg(req)
    ctx.postMessage({ id, result } satisfies ImagingResponse, 'buffer' in result ? [result.buffer] : [])
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies ImagingResponse)
  }
}
