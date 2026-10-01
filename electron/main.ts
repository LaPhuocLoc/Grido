import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { AppInfo, NewPhoto, ThemeSource } from '../shared/types'
import {
  addPhoto,
  dataDir,
  IMAGE_TYPES,
  listPhotos,
  loadLibrary,
  photoFile,
  removePhotos,
  stageBytes,
  stagePaths,
} from './library'
import { APP_ORIGIN, handleScheme, registerScheme } from './protocol'
import { asciiUserAgent } from './userAgent'
import { checkForUpdates, downloadUpdate, initUpdates, installUpdate, openDownloadPage, updateState } from './updates'

const DEV_URL = process.env.GRIDO_DEV_URL
const isMac = process.platform === 'darwin'
/** Phải khớp với chiều cao thanh tiêu đề trong giao diện (TopBar). */
const TITLEBAR_HEIGHT = 48
const CHROME = {
  light: { background: '#f7f7fb', bar: '#fdfdff', symbol: '#1b1b2b' },
  dark: { background: '#111218', bar: '#171922', symbol: '#eeeef6' },
}

interface WindowState {
  bounds?: { x?: number; y?: number; width: number; height: number }
  maximized?: boolean
  dark?: boolean
  exportDir?: string
}

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')
let state: WindowState = {}
function loadState() {
  try {
    state = JSON.parse(readFileSync(stateFile(), 'utf8')) as WindowState
  } catch {
    state = {}
  }
}
function saveState() {
  try {
    mkdirSync(path.dirname(stateFile()), { recursive: true })
    writeFileSync(stateFile(), JSON.stringify(state))
  } catch {
    // Không ghi được thì lần sau mở với kích thước mặc định.
  }
}

let win: BrowserWindow | null = null
/** Đường dẫn người dùng đã chọn trong hộp thoại lưu: chỉ những chỗ này mới được ghi file / mở trong trình quản lý file. */
const exportTargets = new Set<string>()

function createWindow() {
  const chrome = state.dark ? CHROME.dark : CHROME.light
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    ...state.bounds,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'Tiệm Ghép Ảnh',
    // Icon gắn thẳng vào cửa sổ: thanh taskbar hiện logo app kể cả khi chạy từ mã nguồn (electron.exe).
    icon: path.join(__dirname, '..', DEV_URL ? 'public' : 'dist', 'icon.png'),
    backgroundColor: chrome.background,
    // Không dùng khung cửa sổ mặc định: thanh trên cùng của giao diện là thanh tiêu đề,
    // hệ điều hành chỉ vẽ thêm cụm nút thu nhỏ / phóng to / đóng lên trên.
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: isMac ? false : { color: chrome.bar, symbolColor: chrome.symbol, height: TITLEBAR_HEIGHT },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })
  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => win?.show())

  const { webContents } = win
  // Kéo nhầm file ra ngoài vùng thả hay bấm link không được làm cửa sổ rời khỏi app.
  webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(DEV_URL ?? APP_ORIGIN)) e.preventDefault()
  })
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  void webContents.setVisualZoomLevelLimits(1, 1)
  if (!app.isPackaged)
    webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') webContents.toggleDevTools()
    })

  win.on('close', () => {
    if (!win) return
    state.maximized = win.isMaximized()
    if (!state.maximized && !win.isMinimized()) state.bounds = win.getBounds()
    saveState()
  })
  win.on('closed', () => (win = null))

  void win.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`)
}

function registerIpc() {
  ipcMain.handle('library:list', () => listPhotos())
  ipcMain.handle('library:pick', async () => {
    if (!win) return { candidates: [], duplicates: 0 }
    const result = await dialog.showOpenDialog(win, {
      title: 'Thêm ảnh vào thư viện',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Ảnh', extensions: Object.keys(IMAGE_TYPES) }],
    })
    return stagePaths(result.filePaths)
  })
  ipcMain.handle('library:stage', (_e, paths: string[]) => stagePaths(paths))
  ipcMain.handle('library:stageBytes', (_e, name: string, bytes: ArrayBuffer) => stageBytes(name, bytes))
  ipcMain.handle('library:add', (_e, photo: NewPhoto) => addPhoto(photo))
  ipcMain.handle('library:remove', (_e, ids: string[]) => removePhotos(ids))
  ipcMain.handle('library:reveal', (_e, id: string) => {
    const file = photoFile(id, 'original')
    if (file) shell.showItemInFolder(file)
  })

  ipcMain.handle('export:pick', async (_e, name: string) => {
    if (!win) return null
    const ext = path.extname(name).slice(1)
    const result = await dialog.showSaveDialog(win, {
      title: 'Xuất ảnh ghép',
      defaultPath: path.join(state.exportDir ?? app.getPath('pictures'), path.basename(name)),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    })
    if (result.canceled || !result.filePath) return null
    state.exportDir = path.dirname(result.filePath)
    saveState()
    exportTargets.add(result.filePath)
    return result.filePath
  })
  ipcMain.handle('export:write', async (_e, file: string, bytes: ArrayBuffer) => {
    if (!exportTargets.has(file)) throw new Error('Chưa chọn nơi lưu file.')
    await fs.writeFile(file, Buffer.from(bytes))
  })
  ipcMain.handle('export:reveal', (_e, file: string) => {
    if (exportTargets.has(file)) shell.showItemInFolder(file)
  })

  ipcMain.handle('app:info', (): AppInfo => ({ version: app.getVersion(), dataDir: dataDir() }))
  ipcMain.handle('app:openDataDir', async () => {
    await fs.mkdir(dataDir(), { recursive: true })
    await shell.openPath(dataDir())
  })
  ipcMain.on('app:theme', (_e, source: ThemeSource, dark: boolean) => {
    // Hộp thoại và menu của hệ điều hành đổi màu theo giao diện app.
    nativeTheme.themeSource = source
    state.dark = dark
    const chrome = dark ? CHROME.dark : CHROME.light
    win?.setBackgroundColor(chrome.background)
    if (!isMac) win?.setTitleBarOverlay({ color: chrome.bar, symbolColor: chrome.symbol, height: TITLEBAR_HEIGHT })
  })

  initUpdates((next) => win?.webContents.send('updates:state', next))
  ipcMain.handle('updates:state', () => updateState())
  ipcMain.handle('updates:check', () => checkForUpdates())
  ipcMain.handle('updates:download', () => downloadUpdate())
  ipcMain.handle('updates:install', () => installUpdate())
  ipcMain.handle('updates:openDownloadPage', () => openDownloadPage())
}

registerScheme()

// App từng tên là Grido: giữ nguyên thư mục dữ liệu cũ để thư viện, thiết kế và cài đặt không mất khi đổi tên.
// Phải đặt trước khi xin single-instance lock vì lock nằm trong thư mục này.
app.setPath('userData', path.join(app.getPath('appData'), 'Grido'))
// Tên app có dấu không được lọt vào header HTTP (xem userAgent.ts). Đặt trước khi tạo cửa sổ đầu tiên.
app.userAgentFallback = asciiUserAgent(app.userAgentFallback, app.getVersion())

// Trùng appId của bộ cài để Windows gộp cửa sổ với shortcut đã ghim và dùng đúng icon.
// Bản chạy từ mã nguồn dùng id riêng: nếu trùng, taskbar lấy icon từ shortcut của bản đã cài (có thể là logo cũ)
// thay vì icon của cửa sổ.
app.setAppUserModelId(app.isPackaged ? 'app.grido.desktop' : 'app.grido.desktop.dev')
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  void app.whenReady().then(() => {
    loadState()
    loadLibrary()
    handleScheme(path.join(__dirname, '..', 'dist'))
    registerIpc()
    // Windows / Linux: không có thanh menu. macOS bắt buộc có menu ứng dụng để các phím tắt hệ thống hoạt động.
    Menu.setApplicationMenu(
      isMac ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null,
    )
    createWindow()
    app.on('activate', () => {
      if (!win) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (!isMac) app.quit()
  })
}
