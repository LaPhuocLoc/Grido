import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ImportCandidate, NewPhoto, Photo, StageResult } from '../shared/types'

/**
 * Thư viện ảnh trên đĩa.
 *
 * File gốc được dùng tại chỗ (không sao chép): thư viện chỉ ghi lại đường dẫn, kèm một bản xem trước và
 * thumbnail trong thư mục dữ liệu của app để dàn trang cho mượt. Xoá ảnh khỏi thư viện không đụng tới file gốc.
 */

interface Entry extends Omit<Photo, 'missing'> {
  previewExt: string
  thumbExt: string
  /** File gốc do app tự lưu (ảnh dán từ clipboard) → xoá cùng lúc với ảnh. */
  managed: boolean
}

export const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  bmp: 'image/bmp',
}
const TYPE_EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }
const MAX_FOLDER_DEPTH = 4

const extOf = (file: string) => path.extname(file).slice(1).toLowerCase()
// Windows và macOS không phân biệt hoa thường trong đường dẫn.
const pathKey = (file: string) => (process.platform === 'linux' ? path.normalize(file) : path.normalize(file).toLowerCase())

export const dataDir = () => path.join(app.getPath('userData'), 'library')
const indexFile = () => path.join(dataDir(), 'index.json')
const cacheDir = () => path.join(dataDir(), 'cache')
const importsDir = () => path.join(dataDir(), 'imports')

let entries: Entry[] = []
const staged = new Map<string, { path: string; managed: boolean }>()

const isEntry = (e: unknown): e is Entry => {
  const o = e as Partial<Entry> | null
  return !!o && typeof o.id === 'string' && typeof o.path === 'string' && typeof o.previewExt === 'string' && typeof o.thumbExt === 'string'
}

export function loadLibrary() {
  entries = []
  if (!existsSync(indexFile())) return
  try {
    const parsed: unknown = JSON.parse(readFileSync(indexFile(), 'utf8'))
    if (!Array.isArray(parsed)) throw new Error('not a list')
    entries = parsed.filter(isEntry)
    if (entries.length === parsed.length) return
  } catch {
    // rơi xuống dưới
  }
  // File chỉ mục hỏng: mở thư viện với phần còn đọc được, nhưng giữ lại bản hỏng để còn cứu được dữ liệu.
  try {
    renameSync(indexFile(), path.join(dataDir(), `index.damaged-${Date.now()}.json`))
  } catch {
    // Không đổi tên được thì thôi; lần ghi tới sẽ thay file.
  }
}

let saving: Promise<void> = Promise.resolve()
/** Ghi nối tiếp nhau và ghi qua file tạm để mất điện giữa chừng không làm hỏng thư viện. */
function save(): Promise<void> {
  saving = saving
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(dataDir(), { recursive: true })
      const tmp = `${indexFile()}.tmp`
      await fs.writeFile(tmp, JSON.stringify(entries))
      await fs.rename(tmp, indexFile())
    })
  return saving
}

async function toPhoto({ previewExt: _p, thumbExt: _t, managed: _m, ...photo }: Entry): Promise<Photo> {
  const found = await fs.access(photo.path).then(
    () => true,
    () => false,
  )
  return { ...photo, missing: !found }
}

/** Kiểm tra file gốc của mọi ảnh cùng lúc, không chặn main process (thư viện vài nghìn ảnh, ổ mạng chậm…). */
export const listPhotos = (): Promise<Photo[]> => Promise.all(entries.map(toPhoto))

async function collect(target: string, depth: number, out: string[]) {
  const stat = await fs.stat(target).catch(() => null)
  if (!stat) return
  if (stat.isFile()) {
    if (extOf(target) in IMAGE_TYPES) out.push(target)
  } else if (stat.isDirectory() && depth < MAX_FOLDER_DEPTH) {
    for (const name of (await fs.readdir(target)).sort()) await collect(path.join(target, name), depth + 1, out)
  }
}

function stage(file: string, managed: boolean): ImportCandidate {
  const token = randomUUID()
  staged.set(token, { path: file, managed })
  return { token, name: path.basename(file, path.extname(file)) }
}

/** Nhận file / thư mục theo đường dẫn; bỏ qua file không phải ảnh và ảnh đã có trong thư viện. */
export async function stagePaths(paths: string[]): Promise<StageResult> {
  const files: string[] = []
  for (const p of paths) await collect(p, 0, files)
  const known = new Set(entries.map((e) => pathKey(e.path)))
  const candidates: ImportCandidate[] = []
  let duplicates = 0
  for (const file of files) {
    const key = pathKey(file)
    if (known.has(key)) duplicates++
    else {
      known.add(key)
      candidates.push(stage(file, false))
    }
  }
  return { candidates, duplicates }
}

export async function stageBytes(name: string, bytes: ArrayBuffer): Promise<StageResult> {
  const ext = extOf(name) in IMAGE_TYPES ? extOf(name) : 'png'
  const base = path.basename(name, path.extname(name)).replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Ảnh dán'
  await fs.mkdir(importsDir(), { recursive: true })
  const file = path.join(importsDir(), `${base}-${Date.now().toString(36)}.${ext}`)
  await fs.writeFile(file, Buffer.from(bytes))
  return { candidates: [stage(file, true)], duplicates: 0 }
}

export const stagedPath = (token: string) => staged.get(token)?.path

export async function addPhoto(input: NewPhoto): Promise<Photo> {
  const source = staged.get(input.token)
  if (!source) throw new Error('Ảnh này không còn trong hàng chờ nhập.')
  staged.delete(input.token)
  const id = randomUUID()
  const previewExt = input.preview ? 'jpg' : extOf(source.path)
  const thumbExt = TYPE_EXT[input.thumbType] ?? 'jpg'
  await fs.mkdir(cacheDir(), { recursive: true })
  const preview = path.join(cacheDir(), `${id}.preview.${previewExt}`)
  if (input.preview) await fs.writeFile(preview, Buffer.from(input.preview))
  else await fs.copyFile(source.path, preview)
  await fs.writeFile(path.join(cacheDir(), `${id}.thumb.${thumbExt}`), Buffer.from(input.thumb))
  const entry: Entry = {
    id,
    name: path.basename(source.path, path.extname(source.path)),
    path: source.path,
    managed: source.managed,
    width: input.width,
    height: input.height,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    size: (await fs.stat(source.path)).size,
    createdAt: Date.now(),
    previewExt,
    thumbExt,
  }
  entries.unshift(entry)
  await save()
  return toPhoto(entry)
}

const cacheFiles = (e: Entry) => ({
  preview: path.join(cacheDir(), `${e.id}.preview.${e.previewExt}`),
  thumb: path.join(cacheDir(), `${e.id}.thumb.${e.thumbExt}`),
})

export async function removePhotos(ids: string[]): Promise<string[]> {
  const drop = new Set(ids)
  const removed = entries.filter((e) => drop.has(e.id))
  entries = entries.filter((e) => !drop.has(e.id))
  await save()
  for (const e of removed) {
    const { preview, thumb } = cacheFiles(e)
    // Chỉ xoá file do app tự tạo; file gốc của người dùng luôn được giữ nguyên.
    for (const file of e.managed ? [preview, thumb, e.path] : [preview, thumb]) await fs.rm(file, { force: true })
  }
  return removed.map((e) => e.id)
}

export function photoFile(id: string, kind: string): string | undefined {
  const entry = entries.find((e) => e.id === id)
  if (!entry) return undefined
  if (kind === 'original') return entry.path
  if (kind === 'preview' || kind === 'thumb') return cacheFiles(entry)[kind]
  return undefined
}
