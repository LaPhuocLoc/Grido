import type { CellAdjust } from '../geometry'
import type { ImageSource, ImagingRequest, ImagingResponse, ImagingResult, PreparedImport } from './imaging.worker'
import type { Raster } from './resample'

// Pool Web Worker nhỏ: việc nặng về ảnh không chặn giao diện và tận dụng nhiều nhân CPU.
// Số worker theo sức máy: mỗi file 45MP đang xử lý chiếm ~360MB (ảnh đã giải mã + pixel thô) nên không mở đồng loạt quá nhiều.

interface Job {
  request: ImagingRequest
  transfer: Transferable[]
  resolve: (r: ImagingResult) => void
  reject: (e: Error) => void
}

// Máy ít RAM (trình duyệt báo ≤ 4 GB) chỉ chạy một worker, kẻo vài ảnh lớn giải mã cùng lúc làm tab bị trình duyệt đóng.
// Máy từ 8 GB trở lên được mở nhiều worker hơn, vẫn chừa lại hai nhân cho giao diện và phần còn lại của trình duyệt.
export function poolSize(memory: number, cores: number): number {
  if (memory <= 4) return 1
  const few = Math.min(3, cores - 1)
  const many = Math.min(memory >= 16 ? 8 : 6, cores - 2)
  return Math.max(1, few, memory >= 8 ? many : 0)
}

export const POOL_SIZE = poolSize((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8, navigator.hardwareConcurrency || 4)
const idle: Worker[] = []
const queue: Job[] = []
let spawned = 0
let nextId = 1

function run(worker: Worker, job: Job) {
  const next = () => {
    const waiting = queue.shift()
    if (waiting) run(worker, waiting)
    else idle.push(worker)
  }
  worker.onmessage = (e: MessageEvent<ImagingResponse>) => {
    if ('error' in e.data) job.reject(new Error(e.data.error))
    else job.resolve(e.data.result)
    next()
  }
  worker.onerror = (e) => {
    job.reject(new Error(e.message || 'Xử lý ảnh thất bại'))
    next()
  }
  worker.postMessage({ id: nextId++, ...job.request }, job.transfer)
}

function submit<T extends ImagingResult>(request: ImagingRequest, transfer: Transferable[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    const job: Job = { request, transfer, resolve: resolve as (r: ImagingResult) => void, reject }
    const worker = idle.pop()
    if (worker) run(worker, job)
    else if (spawned < POOL_SIZE) {
      spawned++
      run(new Worker(new URL('./imaging.worker.ts', import.meta.url), { type: 'module' }), job)
    } else queue.push(job)
  })
}

/** Tạo bản xem trước (cạnh dài tối đa 2560px) và thumbnail cho thư viện. Không đụng tới file gốc. */
export const prepareImport = (source: ImageSource) => submit<PreparedImport>({ kind: 'prepare', source })

export interface CellJob {
  /** Nguồn ảnh theo thứ tự ưu tiên (file gốc, rồi bản xem trước). */
  sources: ImageSource[]
  adjust: CellAdjust
  width: number
  height: number
  sharpen: number
}

/** Dựng một ô ảnh ở đúng kích thước pixel đầu ra. */
export async function renderCell(job: CellJob): Promise<Raster> {
  const { buffer } = await submit<{ buffer: ArrayBuffer }>({ kind: 'cell', ...job })
  return { data: new Uint8ClampedArray(buffer), width: job.width, height: job.height }
}

/** Mã hoá JPEG bằng MozJPEG, lấy mẫu màu 4:4:4. `quality` 0..1. */
export async function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(canvas)
  const out = await submit<{ buffer: ArrayBuffer }>({ kind: 'jpeg', bitmap, quality: Math.round(quality * 100) }, [bitmap])
  return new Uint8Array(out.buffer)
}
