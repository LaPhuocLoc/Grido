import type { UpdateState } from '../../../shared/types'
import type { Platform } from '../types'
import { hasFileAccess, isAbort, openOne, saveFile } from './fs'
import { createLibrary, type BackupPhoto } from './library'

declare const __APP_VERSION__: string
declare const __BUILD_ID__: string

const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const BACKUP_TYPES = [{ description: 'Bản sao lưu Tiệm Ghép Ảnh', accept: { 'application/json': ['.json'] } }]

/** File sao lưu: thiết kế, album, cài đặt và danh mục thư viện. Không chứa ảnh; ảnh vẫn là file gốc trên máy người dùng. */
interface Backup {
  app: 'tiem-ghep-anh'
  version: 1
  createdAt: string
  state: unknown
  photos: BackupPhoto[]
}

/** Trình duyệt có đủ những thứ bản web cần: đọc file tại chỗ, bộ nhớ riêng của trang, xử lý ảnh trong worker, khoá một tab. */
export const isSupported = () =>
  hasFileAccess() && 'locks' in navigator && 'indexedDB' in window && typeof navigator.storage?.getDirectory === 'function' && 'OffscreenCanvas' in window

/** Bản web: mọi thứ nằm trong trình duyệt của người dùng, không có máy chủ nào nhận ảnh. */
export async function createWebPlatform(): Promise<Platform> {
  const { library, images, backupPhotos, restorePhotos, cleanup, count } = await createLibrary()

  // Nơi lưu người dùng vừa chọn trong hộp thoại của trình duyệt: chỉ những chỗ này mới được ghi.
  const targets = new Map<string, FileSystemFileHandle>()
  let targetSeq = 0

  return {
    platform: 'web',
    features: { reveal: false, dataDir: false, installer: false },
    library,
    images,
    data: {
      usage: async () => {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate()
        return { used: usage, quota, persisted: await navigator.storage.persisted(), photos: count() }
      },
      backup: async (state) => {
        const backup: Backup = { app: 'tiem-ghep-anh', version: 1, createdAt: new Date().toISOString(), state, photos: backupPhotos() }
        try {
          const handle = await saveFile(`tiem-ghep-anh-sao-luu-${backup.createdAt.slice(0, 10)}.json`, BACKUP_TYPES, 'backup')
          const out = await handle.createWritable()
          await out.write(JSON.stringify(backup))
          await out.close()
          return true
        } catch (err) {
          if (isAbort(err)) return false
          throw err
        }
      },
      restore: async () => {
        let text: string
        try {
          text = await (await (await openOne(BACKUP_TYPES, 'backup')).getFile()).text()
        } catch (err) {
          if (isAbort(err)) return null
          throw err
        }
        let backup: Partial<Backup>
        try {
          backup = JSON.parse(text) as Partial<Backup>
        } catch {
          backup = {}
        }
        if (backup.app !== 'tiem-ghep-anh' || !backup.state || typeof backup.state !== 'object' || !Array.isArray(backup.photos))
          throw new Error('File này không phải bản sao lưu của Tiệm Ghép Ảnh.')
        return { state: backup.state, photos: await restorePhotos(backup.photos) }
      },
      cleanup,
    },
    exportFile: {
      pick: async (name) => {
        const ext = name.slice(name.lastIndexOf('.') + 1)
        try {
          const handle = await saveFile(name, [{ description: ext.toUpperCase(), accept: { [MIME[ext] ?? 'application/octet-stream']: [`.${ext}`] } }])
          const token = `${++targetSeq}:${handle.name}`
          targets.set(token, handle)
          return token
        } catch (err) {
          if (isAbort(err)) return null
          throw err
        }
      },
      write: async (token, bytes) => {
        const handle = targets.get(token)
        if (!handle) throw new Error('Chưa chọn nơi lưu file.')
        const out = await handle.createWritable()
        await out.write(bytes)
        await out.close()
      },
      reveal: async () => {},
    },
    app: {
      info: async () => ({ version: __APP_VERSION__, dataDir: '' }),
      setTheme: () => {},
      openDataDir: async () => {},
    },
    updates: createUpdates(),
  }
}

/** Việc chỉ trang web mới phải lo: đóng / tải lại tab giữa chừng, và file của bản dựng cũ biến mất sau khi có bản mới. */
export function guardPage(busy: () => boolean) {
  // Đang nhập hoặc xuất ảnh mà đóng tab thì hỏi lại. (Bản nháp thì luôn được tự lưu.)
  window.addEventListener('beforeunload', (e) => {
    if (busy()) e.preventDefault()
  })
  // Tab mở từ trước khi có bản mới sẽ không tải được các phần nạp sau của bản cũ: tải lại trang, một lần thôi để khỏi lặp.
  window.addEventListener('vite:preloadError', () => {
    if (sessionStorage.getItem('reloaded-for-update')) return
    sessionStorage.setItem('reloaded-for-update', '1')
    location.reload()
  })
}

/**
 * "Cập nhật" của bản web: so mã bản dựng đang chạy với `/version.json` trên máy chủ. Có bản mới thì báo cho giao diện như
 * bản desktop; người dùng đồng ý thì tải lại trang.
 */
function createUpdates(): Platform['updates'] {
  // Chạy từ mã nguồn (vite dev) không có version.json.
  let state: UpdateState = import.meta.env.DEV ? { status: 'unsupported' } : { status: 'idle' }
  const listeners = new Set<(state: UpdateState) => void>()
  const set = (next: UpdateState) => {
    state = next
    for (const listener of listeners) listener(next)
  }

  return {
    check: async () => {
      if (state.status !== 'idle' && state.status !== 'latest' && state.status !== 'error') return
      set({ status: 'checking' })
      try {
        const res = await fetch('/version.json', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const latest = (await res.json()) as { version: string; build: string }
        set(latest.build === __BUILD_ID__ ? { status: 'latest' } : { status: 'available', version: latest.version })
      } catch {
        set({ status: 'error', message: 'Không kiểm tra được bản cập nhật. Kiểm tra kết nối mạng rồi thử lại.', manual: false })
      }
    },
    download: async () => {
      // Không có gì phải tải về trước: tải lại trang là có bản mới.
      if (state.status === 'available') set({ status: 'ready', version: state.version })
    },
    install: async () => {
      if (state.status === 'ready') location.reload()
    },
    openDownloadPage: async () => {},
    onState: (listener) => {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
  }
}
