import type { CellAdjust } from '../geometry'
import type { ImagingRequest, ImagingResponse, ImagingResult, PreparedImport } from './imaging.worker'
import type { Raster } from './resample'

// Pool Web Worker nhỏ: việc nặng về ảnh không chặn giao diện và tận dụng nhiều nhân CPU.
// Tối đa 3 worker: mỗi file 45MP giải mã ra đã ~180MB nên không mở đồng loạt quá nhiều.

interface Job {
  request: ImagingRequest
  transfer: Transferable[]
  resolve: (r: ImagingResult) => void
  reject: (e: Error) => void
}

export const POOL_SIZE = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1))
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
export const prepareImport = (url: string) => submit<PreparedImport>({ kind: 'prepare', url })

export interface CellJob {
  /** Nguồn ảnh theo thứ tự ưu tiên (file gốc, rồi bản xem trước). */
  urls: string[]
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
