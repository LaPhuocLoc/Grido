import { app, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/types'

/**
 * Cập nhật qua GitHub Releases (electron-updater). Không tự tải: thấy bản mới thì báo cho giao diện, người dùng
 * đồng ý mới tải về; tải xong giao diện gọi cài đặt, app tự cài rồi mở lại. Nếu người dùng thoát app trước lúc đó
 * thì bản đã tải được cài khi thoát. Repo phát hành lấy từ `build.publish` trong package.json.
 */

/** Trang để tải bộ cài thủ công khi không tự cài được (vd. bản macOS chưa ký số, bản Linux không chạy từ AppImage). */
const DOWNLOAD_PAGE = 'https://github.com/LaPhuocLoc/Grido/releases/latest'

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
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }))
  autoUpdater.on('update-not-available', () => set({ status: 'latest' }))
  autoUpdater.on('update-available', (info) => set({ status: 'available', version: info.version }))
  autoUpdater.on('download-progress', (progress) => {
    if (state.status === 'downloading') set({ ...state, percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }))
  autoUpdater.on('error', () =>
    set(
      // Hỏng ở khâu tải / cài (mất mạng giữa chừng, bản chưa ký số…): vẫn còn đường tải bộ cài về cài tay.
      state.status === 'downloading' || state.status === 'ready'
        ? { status: 'error', message: `Không tự cài được bản ${state.version}. Bạn có thể tải bộ cài về và cài thủ công.`, manual: true }
        : { status: 'error', message: 'Không kiểm tra được bản cập nhật. Kiểm tra kết nối mạng rồi thử lại.', manual: false },
    ),
  )
}

export async function checkForUpdates(): Promise<void> {
  if (['unsupported', 'checking', 'available', 'downloading', 'ready'].includes(state.status)) return
  // Lỗi đã được báo qua sự kiện 'error' ở trên.
  await autoUpdater.checkForUpdates().catch(() => {})
}

/** Người dùng đã đồng ý cập nhật: tải bản mới về. */
export async function downloadUpdate(): Promise<void> {
  if (state.status !== 'available') return
  set({ status: 'downloading', version: state.version, percent: 0 })
  await autoUpdater.downloadUpdate().catch(() => {})
}

/** Thoát app, cài bản vừa tải (không hiện trình cài đặt) rồi mở lại. */
export function installUpdate() {
  if (state.status === 'ready') autoUpdater.quitAndInstall(true, true)
}

export const openDownloadPage = () => shell.openExternal(DOWNLOAD_PAGE)
