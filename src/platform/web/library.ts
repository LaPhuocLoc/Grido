import type { ImportCandidate, NewPhoto, Photo, StageResult } from '../../../shared/types'
import type { Platform } from '../types'
import { askRead, canRead, children, droppedHandle, isAbort, isDirectory, isFile, openFiles, openFolder } from './fs'
import { deleteFile, getAll, listFiles, put, readFile, removeKeys, writeFile } from './storage'

/**
 * Thư viện ảnh của bản web.
 *
 * Cùng nguyên lý với bản desktop: file gốc được dùng tại chỗ, không sao chép. Thư viện chỉ giữ file handle (quyền đọc do
 * người dùng cấp cho trình duyệt), kèm bản xem trước và thumbnail trong bộ nhớ riêng của trang. Không có gì rời khỏi máy.
 *
 * Trình duyệt chỉ nhớ quyền đọc trong một phiên (trừ khi người dùng chọn "cho phép mỗi lần truy cập"), nên sau khi mở lại
 * ảnh có thể ở trạng thái `locked`: vẫn dàn trang và xuất được bằng bản xem trước, tới khi người dùng bấm cho phép lại.
 */

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp']
const TYPE_EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }
const MAX_FOLDER_DEPTH = 4
/** Số file được kiểm tra cùng lúc khi mở thư viện. */
const CHECK_POOL = 32

export interface Entry extends Omit<Photo, 'missing' | 'locked' | 'stale' | 'path'> {
  /** Tên file kèm đuôi. */
  fileName: string
  lastModified: number
  /** Thứ tự trong thư viện, lớn hơn = mới hơn. */
  order: number
  previewExt: string
  thumbExt: string
  /**
   * File gốc trên đĩa. Không có handle thì hoặc là ảnh dán từ clipboard (có `originalExt`, bản gốc do app tự giữ trong
   * `imports/`), hoặc là ảnh khôi phục từ file sao lưu đang chờ người dùng thêm lại file gốc để nối.
   */
  handle?: FileSystemFileHandle
  /** Đuôi file gốc do app tự giữ. */
  originalExt?: string
  /** Thư mục người dùng đã cấp quyền mà file nằm trong đó: xin lại quyền một lần cho cả thư mục. */
  rootId?: string
  /** Đường dẫn tính từ thư mục ấy. */
  relPath?: string
  /** Chưa có bản xem trước + thumbnail (ảnh khôi phục từ file sao lưu): dựng ngay khi đọc được file gốc. */
  needsCache?: boolean
}

/** Phần của một ảnh được ghi vào file sao lưu: đủ để nhận ra lại file gốc, không có handle và không có ảnh. */
export type BackupPhoto = Omit<Entry, 'handle' | 'rootId' | 'relPath' | 'originalExt' | 'needsCache' | 'previewExt' | 'thumbExt'>

interface Root {
  id: string
  name: string
  handle: FileSystemDirectoryHandle
}

type Access = 'ok' | 'locked' | 'missing'

interface Found {
  handle: FileSystemFileHandle
  rootId?: string
  relPath?: string
}

interface Staged extends Partial<Found> {
  file: File
}

const extOf = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase()
const baseOf = (name: string) => (name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name)
const isImageName = (name: string) => IMAGE_EXTS.includes(extOf(name))
const sameFile = (a: { name: string; size: number; lastModified: number }, e: Entry) =>
  e.fileName === a.name && e.size === a.size && e.lastModified === a.lastModified

export async function createLibrary() {
  let entries = (await getAll<Entry>('photos')).sort((a, b) => b.order - a.order)
  let roots = await getAll<Root>('roots')
  const access = new Map<string, Access>()
  /** Ảnh có file gốc đọc được nhưng bản xem trước không còn khớp (file đã bị sửa, hoặc chưa từng có bản xem trước). */
  const stale = new Set<string>()
  const staged = new Map<string, Staged>()
  let seq = 0

  const byId = (id: string) => entries.find((e) => e.id === id)
  const cacheName = (e: Entry, kind: 'thumb' | 'preview') => `${e.id}.${kind}.${kind === 'thumb' ? e.thumbExt : e.previewExt}`

  async function check(entry: Entry): Promise<Access> {
    stale.delete(entry.id)
    if (entry.originalExt) return 'ok'
    if (!entry.handle) return 'missing'
    try {
      if (!(await canRead(entry.handle))) return 'locked'
      const file = await entry.handle.getFile()
      if (entry.needsCache || file.size !== entry.size || file.lastModified !== entry.lastModified) stale.add(entry.id)
      return 'ok'
    } catch (err) {
      return err instanceof DOMException && err.name === 'NotAllowedError' ? 'locked' : 'missing'
    }
  }

  function toPhoto(entry: Entry): Photo {
    const state = access.get(entry.id) ?? 'ok'
    const { fileName, lastModified: _m, order: _o, previewExt: _p, thumbExt: _t, handle: _h, originalExt: _e, needsCache: _n, rootId, relPath, ...photo } = entry
    const root = rootId ? roots.find((r) => r.id === rootId) : undefined
    return {
      ...photo,
      path: root && relPath ? `${root.name}/${relPath}` : fileName,
      missing: state !== 'ok',
      locked: state === 'locked',
      stale: stale.has(entry.id),
    }
  }

  async function list(): Promise<Photo[]> {
    const queue = [...entries]
    const work = async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) access.set(entry.id, await check(entry))
    }
    await Promise.all(Array.from({ length: CHECK_POOL }, work))
    return entries.map(toPhoto)
  }

  // ---- Nhận file ----------------------------------------------------------------------------------------------------

  function stage(item: Staged): ImportCandidate {
    const token = crypto.randomUUID()
    staged.set(token, item)
    return { token, name: baseOf(item.file.name) }
  }

  /** Thư mục vừa được chọn / thả vào đã nằm trong (hoặc chính là) một thư mục đã biết thì dùng lại quyền của thư mục ấy. */
  async function rootFor(dir: FileSystemDirectoryHandle): Promise<{ root: Root; prefix: string }> {
    for (const root of roots) {
      if (await root.handle.isSameEntry(dir).catch(() => false)) return { root, prefix: '' }
      const inside = await root.handle.resolve(dir).catch(() => null)
      if (inside) return { root, prefix: `${inside.join('/')}/` }
    }
    const root: Root = { id: crypto.randomUUID(), name: dir.name, handle: dir }
    await put('roots', root)
    roots.push(root)
    return { root, prefix: '' }
  }

  async function walk(dir: FileSystemDirectoryHandle, depth: number, rootId: string, prefix: string, out: Found[]) {
    if (depth >= MAX_FOLDER_DEPTH) return
    const items: [string, FileSystemHandle][] = []
    for await (const item of children(dir)) items.push(item)
    for (const [name, handle] of items.sort((a, b) => a[0].localeCompare(b[0]))) {
      if (isFile(handle)) {
        if (isImageName(name)) out.push({ handle, rootId, relPath: prefix + name })
      } else if (isDirectory(handle)) await walk(handle, depth + 1, rootId, `${prefix}${name}/`, out)
    }
  }

  async function folderFiles(dir: FileSystemDirectoryHandle): Promise<Found[]> {
    const { root, prefix } = await rootFor(dir)
    const out: Found[] = []
    await walk(dir, 0, root.id, prefix, out)
    return out
  }

  /** File lẻ nằm trong một thư mục đã biết thì gắn vào thư mục ấy, để sau này xin lại quyền một lần cho cả thư mục. */
  async function place(handle: FileSystemFileHandle): Promise<Found> {
    for (const root of roots) {
      const inside = await root.handle.resolve(handle).catch(() => null)
      if (inside) return { handle, rootId: root.id, relPath: inside.join('/') }
    }
    return { handle }
  }

  /**
   * Bỏ qua file không phải ảnh và ảnh đã có trong thư viện (cùng một file trên đĩa). File trùng tên + dung lượng + ngày sửa
   * với một ảnh đang mất file gốc (đã dời chỗ, hoặc khôi phục từ file sao lưu) thì nối lại vào ảnh đó thay vì thêm ảnh mới,
   * để thiết kế và album đang dùng ảnh ấy vẫn còn nguyên.
   */
  async function stageFound(found: Found[]): Promise<StageResult> {
    const candidates: ImportCandidate[] = []
    const accepted: Staged[] = []
    let duplicates = 0
    let relinked = 0
    for (const item of found) {
      if (!isImageName(item.handle.name)) continue
      const file = await item.handle.getFile().catch(() => null)
      if (!file) continue

      const lost = entries.find((e) => sameFile(file, e) && !e.originalExt && (!e.handle || access.get(e.id) === 'missing'))
      if (lost) {
        lost.handle = item.handle
        lost.rootId = item.rootId
        lost.relPath = item.relPath
        await put('photos', lost)
        access.set(lost.id, 'ok')
        if (lost.needsCache) stale.add(lost.id)
        relinked++
        continue
      }

      // Web không lộ đường dẫn tuyệt đối: lọc nhanh theo tên + dung lượng + ngày sửa, rồi hỏi trình duyệt có đúng là một file không.
      const twins = [
        ...entries.filter((e) => e.handle && sameFile(file, e)).map((e) => e.handle!),
        ...accepted.filter((s) => s.file.name === file.name && s.file.size === file.size && s.file.lastModified === file.lastModified).map((s) => s.handle!),
      ]
      let duplicate = false
      for (const twin of twins) if (await twin.isSameEntry(item.handle).catch(() => true)) duplicate = true
      if (duplicate) {
        duplicates++
        continue
      }
      const next: Staged = { ...item, file }
      accepted.push(next)
      candidates.push(stage(next))
    }
    return { candidates, duplicates, relinked }
  }

  /** Ảnh không có file trên đĩa (dán từ clipboard, kéo từ trang web khác): app tự giữ một bản. */
  function stageLoose(files: File[]): StageResult {
    return { candidates: files.filter((f) => f.type.startsWith('image/')).map((file) => stage({ file })), duplicates: 0 }
  }

  async function pick(): Promise<StageResult> {
    let handles: FileSystemFileHandle[]
    try {
      handles = await openFiles([{ description: 'Ảnh', accept: { 'image/*': IMAGE_EXTS.map((e) => `.${e}`) } }])
    } catch (err) {
      if (isAbort(err)) return { candidates: [], duplicates: 0 }
      throw err
    }
    return stageFound(await Promise.all(handles.map(place)))
  }

  async function pickFolder(): Promise<StageResult> {
    let dir: FileSystemDirectoryHandle
    try {
      dir = await openFolder()
    } catch (err) {
      if (isAbort(err)) return { candidates: [], duplicates: 0 }
      throw err
    }
    return stageFound(await folderFiles(dir))
  }

  async function stageDrop(data: DataTransfer): Promise<StageResult> {
    // Phải lấy hết handle và file trước `await` đầu tiên: ra khỏi sự kiện drop là DataTransfer trống trơn.
    const dropped = [...data.items].filter((item) => item.kind === 'file').map((item) => ({ handle: droppedHandle(item), file: item.getAsFile() }))
    const found: Found[] = []
    const loose: File[] = []
    let refused = 0
    for (const item of dropped) {
      const handle = await item.handle.catch(() => null)
      if (handle && isDirectory(handle)) found.push(...(await folderFiles(handle)))
      else if (handle && isFile(handle)) found.push(await place(handle))
      else if (item.file?.type.startsWith('image/')) loose.push(item.file)
      // Không có handle mà cũng không phải ảnh: thư mục bị trình duyệt từ chối (Desktop, Tài liệu, Tải xuống, thư mục hệ thống).
      else refused++
    }
    const fromDisk = await stageFound(found)
    const result = { ...fromDisk, candidates: [...fromDisk.candidates, ...stageLoose(loose).candidates] }
    if (refused && !result.candidates.length && !result.duplicates && !result.relinked)
      throw new Error('Trình duyệt không cho trang đọc nguyên thư mục này (Desktop, Tài liệu, Tải xuống và thư mục hệ thống). Hãy thả một thư mục con, hoặc chọn các ảnh bên trong.')
    return result
  }

  // ---- Thêm / xoá ---------------------------------------------------------------------------------------------------

  async function add(input: NewPhoto): Promise<Photo> {
    const source = staged.get(input.token)
    if (!source) throw new Error('Ảnh này không còn trong hàng chờ nhập.')
    staged.delete(input.token)
    const { file, handle, rootId, relPath } = source
    const id = crypto.randomUUID()
    const ext = isImageName(file.name) ? extOf(file.name) : (TYPE_EXT[file.type] ?? 'png')
    const now = Date.now()
    const entry: Entry = {
      id,
      name: baseOf(file.name) || 'Ảnh dán',
      fileName: file.name,
      width: input.width,
      height: input.height,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      size: file.size,
      lastModified: file.lastModified,
      createdAt: now,
      order: now * 1000 + (seq++ % 1000),
      previewExt: input.preview ? 'jpg' : ext,
      thumbExt: TYPE_EXT[input.thumbType] ?? 'jpg',
      ...(handle ? { handle, rootId, relPath } : { originalExt: ext }),
    }
    // File gốc đủ nhỏ thì dùng luôn byte gốc làm bản xem trước (không nén lại lần hai).
    await writeFile('cache', cacheName(entry, 'preview'), input.preview ?? file)
    await writeFile('cache', cacheName(entry, 'thumb'), input.thumb)
    if (!handle) await writeFile('imports', `${id}.${ext}`, file)
    await put('photos', entry)
    entries.unshift(entry)
    access.set(id, 'ok')
    // Xin trình duyệt đừng tự dọn dữ liệu của trang khi đĩa đầy. Được hay không cũng không ảnh hưởng tới việc đang làm.
    void navigator.storage.persist?.().catch(() => {})
    return toPhoto(entry)
  }

  /** File gốc đã đổi (hoặc ảnh vừa được nối lại): thay bản xem trước + thumbnail bằng bản mới dựng từ file gốc. */
  async function refresh(id: string, input: Omit<NewPhoto, 'token'>): Promise<Photo> {
    const entry = byId(id)
    const file = await entry?.handle?.getFile()
    if (!entry || !file) throw new Error('Không đọc được file gốc của ảnh này.')
    const old = [cacheName(entry, 'preview'), cacheName(entry, 'thumb')]
    Object.assign(entry, {
      width: input.width,
      height: input.height,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      size: file.size,
      lastModified: file.lastModified,
      previewExt: input.preview ? 'jpg' : extOf(file.name),
      thumbExt: TYPE_EXT[input.thumbType] ?? 'jpg',
    })
    delete entry.needsCache
    await writeFile('cache', cacheName(entry, 'preview'), input.preview ?? file)
    await writeFile('cache', cacheName(entry, 'thumb'), input.thumb)
    for (const name of old) if (name !== cacheName(entry, 'preview') && name !== cacheName(entry, 'thumb')) await deleteFile('cache', name)
    await put('photos', entry)
    stale.delete(id)
    forgetUrls(id)
    notify()
    return toPhoto(entry)
  }

  async function remove(ids: string[]): Promise<string[]> {
    const drop = new Set(ids)
    const removed = entries.filter((e) => drop.has(e.id))
    entries = entries.filter((e) => !drop.has(e.id))
    await removeKeys('photos', removed.map((e) => e.id))
    for (const e of removed) {
      // Chỉ xoá file do app tự tạo; file gốc của người dùng luôn được giữ nguyên.
      await deleteFile('cache', cacheName(e, 'preview'))
      await deleteFile('cache', cacheName(e, 'thumb'))
      if (e.originalExt) await deleteFile('imports', `${e.id}.${e.originalExt}`)
      forgetUrls(e.id)
      access.delete(e.id)
      stale.delete(e.id)
    }
    // Thư mục không còn ảnh nào trong thư viện thì thôi giữ quyền của nó.
    const unused = roots.filter((r) => !entries.some((e) => e.rootId === r.id))
    if (unused.length) {
      roots = roots.filter((r) => !unused.includes(r))
      await removeKeys('roots', unused.map((r) => r.id))
    }
    return removed.map((e) => e.id)
  }

  async function grantAccess(): Promise<void> {
    // Một thư mục = một lần hỏi cho mọi ảnh bên trong; file lẻ thì hỏi từng file.
    const targets = new Map<string, FileSystemHandle>()
    for (const e of entries) {
      if (access.get(e.id) !== 'locked' || !e.handle) continue
      const root = e.rootId ? roots.find((r) => r.id === e.rootId) : undefined
      targets.set(root ? `root:${root.id}` : `file:${e.id}`, root?.handle ?? e.handle)
    }
    for (const handle of targets.values()) {
      try {
        if (await canRead(handle)) continue
        // Người dùng từ chối, hoặc trình duyệt không cho hỏi tiếp trong cùng một lần bấm: dừng, phần còn lại để lần bấm sau.
        if (!(await askRead(handle))) break
      } catch {
        break
      }
    }
  }

  // ---- Sao lưu ------------------------------------------------------------------------------------------------------

  /** Danh mục thư viện để ghi vào file sao lưu. Ảnh dán từ clipboard không có file gốc ngoài trình duyệt nên không đưa vào. */
  const backupPhotos = (): BackupPhoto[] =>
    entries
      .filter((e) => !e.originalExt)
      .map(({ handle: _h, rootId: _r, relPath: _p, originalExt: _e, needsCache: _n, previewExt: _pe, thumbExt: _te, ...rest }) => rest)

  /** Đưa ảnh từ file sao lưu vào thư viện, chờ người dùng thêm lại file gốc để nối. Ảnh đã có sẵn thì giữ nguyên. Trả về số ảnh thêm vào. */
  async function restorePhotos(photos: BackupPhoto[]): Promise<number> {
    let added = 0
    for (const photo of photos) {
      if (typeof photo?.id !== 'string' || typeof photo.fileName !== 'string' || byId(photo.id)) continue
      const entry: Entry = { ...photo, previewExt: 'jpg', thumbExt: 'webp', needsCache: true }
      await put('photos', entry)
      entries.push(entry)
      added++
    }
    entries.sort((a, b) => b.order - a.order)
    return added
  }

  /** Xoá file trong bộ nhớ của trang mà không ảnh nào trong thư viện dùng tới (sót lại sau lần nhập / xoá bị ngắt giữa chừng). */
  async function cleanup(): Promise<number> {
    const keep = {
      cache: new Set(entries.flatMap((e) => [cacheName(e, 'preview'), cacheName(e, 'thumb')])),
      imports: new Set(entries.filter((e) => e.originalExt).map((e) => `${e.id}.${e.originalExt}`)),
    }
    let removed = 0
    for (const dir of ['cache', 'imports'] as const) {
      for (const name of await listFiles(dir)) {
        if (keep[dir].has(name)) continue
        await deleteFile(dir, name)
        removed++
      }
    }
    return removed
  }

  // ---- Địa chỉ ảnh --------------------------------------------------------------------------------------------------

  const urls = new Map<string, string>()
  const loading = new Set<string>()
  const listeners = new Set<() => void>()
  let version = 0
  let scheduled = false

  /** Gom nhiều địa chỉ vừa sẵn sàng thành một lần báo, để giao diện không vẽ lại hàng nghìn lần khi mở thư viện lớn. */
  function notify() {
    if (scheduled) return
    scheduled = true
    setTimeout(() => {
      scheduled = false
      version++
      for (const listener of listeners) listener()
    })
  }

  function forgetUrls(id: string) {
    for (const kind of ['thumb', 'preview'] as const) {
      const url = urls.get(`${id}/${kind}`)
      if (url) URL.revokeObjectURL(url)
      urls.delete(`${id}/${kind}`)
    }
  }

  async function resolveUrl(id: string, kind: 'thumb' | 'preview', key: string) {
    const entry = byId(id)
    // File cache nằm trên đĩa (OPFS) nên địa chỉ blob chỉ là một tham chiếu, không nạp ảnh vào RAM.
    const file = entry && (await readFile('cache', cacheName(entry, kind)).catch(() => null))
    urls.set(key, file ? URL.createObjectURL(file) : '')
    loading.delete(key)
    notify()
  }

  function url(id: string, kind: 'thumb' | 'preview'): string {
    const key = `${id}/${kind}`
    const ready = urls.get(key)
    if (ready !== undefined) return ready
    if (!loading.has(key)) {
      loading.add(key)
      void resolveUrl(id, kind, key)
    }
    return ''
  }

  const library: Platform['library'] = {
    list,
    pick,
    pickFolder,
    stageFiles: async (files) => stageLoose(files),
    stageDrop,
    add,
    remove,
    reveal: async () => {},
    grantAccess,
    refresh,
  }

  const images: Platform['images'] = {
    url,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    version: () => version,
    importSource: async (token) => {
      const source = staged.get(token)
      if (!source) throw new Error('Ảnh này không còn trong hàng chờ nhập.')
      return source.file
    },
    cellSources: async (photo) => {
      const entry = byId(photo.id)
      if (!entry) return []
      const sources: Blob[] = []
      const original = entry.originalExt
        ? await readFile('imports', `${entry.id}.${entry.originalExt}`).catch(() => null)
        : access.get(entry.id) === 'ok' && (await entry.handle?.getFile().catch(() => null))
      if (original) sources.push(original)
      const preview = await readFile('cache', cacheName(entry, 'preview')).catch(() => null)
      if (preview) sources.push(preview)
      return sources
    },
  }

  return { library, images, backupPhotos, restorePhotos, cleanup, count: () => entries.length }
}
