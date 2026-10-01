import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/types'

/**
 * Tự cập nhật qua GitHub Releases (electron-updater): thấy bản mới thì tải về ở nền, tải xong thì báo cho giao diện;
 * người dùng bấm "Khởi động lại để cập nhật", hoặc cứ dùng tiếp và bản mới tự cài khi thoát app.
 * Repo phát hành lấy từ `build.publish` trong package.json.
 */

let state: UpdateState = { status: 'idle' }
let notify: (state: UpdateState) => void = () => {}

function set(next: UpdateState) {
  state = next
  notify(next)
}

export const updateState = () => state

export function initUpdates(onChange: (state: UpdateState) => void) {
  notify = onChange
  // Bản chạy từ mã nguồn không có gì để cập nhật.
  if (!app.isPackaged) {
    state = { status: 'unsupported' }
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }))
  autoUpdater.on('update-not-available', () => set({ status: 'latest' }))
  autoUpdater.on('update-available', (info) => set({ status: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('download-progress', (progress) => {
    if (state.status === 'downloading') set({ ...state, percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }))
  autoUpdater.on('error', () =>
    set({
      status: 'error',
      message:
        state.status === 'downloading'
          ? 'Tải bản cập nhật thất bại. Kiểm tra kết nối mạng rồi thử lại.'
          : 'Không kiểm tra được bản cập nhật. Kiểm tra kết nối mạng rồi thử lại.',
    }),
  )
}

export async function checkForUpdates(): Promise<void> {
  if (state.status === 'unsupported' || state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') return
  // Lỗi đã được báo qua sự kiện 'error' ở trên.
  await autoUpdater.checkForUpdates().catch(() => {})
}

/** Thoát app, cài bản vừa tải rồi mở lại. */
export function installUpdate() {
  if (state.status === 'ready') autoUpdater.quitAndInstall()
}
