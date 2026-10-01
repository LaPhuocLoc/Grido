import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '../shared/types'

// Bản thế của electron-updater: phát đúng những sự kiện mà bản thật phát, do test điều khiển.
class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = false
  checks = 0
  downloads = 0
  installs: [boolean | undefined, boolean | undefined][] = []
  checkResult: () => Promise<unknown> = async () => null
  downloadResult: () => Promise<unknown> = async () => []
  checkForUpdates() {
    this.checks++
    return this.checkResult()
  }
  downloadUpdate() {
    this.downloads++
    return this.downloadResult()
  }
  quitAndInstall(silent?: boolean, runAfter?: boolean) {
    this.installs.push([silent, runAfter])
  }
}

const env = { packaged: true, updater: new FakeUpdater(), opened: [] as string[] }
vi.mock('electron', () => ({
  app: { get isPackaged() { return env.packaged } },
  shell: { openExternal: async (url: string) => void env.opened.push(url) },
}))
vi.mock('electron-updater', () => ({ get autoUpdater() { return env.updater } }))

let updates: typeof import('../electron/updates')
let seen: UpdateState[]

async function start(packaged = true) {
  env.packaged = packaged
  env.updater = new FakeUpdater()
  env.opened = []
  vi.resetModules()
  updates = await import('../electron/updates')
  seen = []
  updates.initUpdates((state) => seen.push(state))
}

/** Đưa app tới trạng thái "đã tìm thấy bản mới, đang chờ người dùng đồng ý". */
async function findUpdate(version = '1.3.0') {
  await updates.checkForUpdates()
  env.updater.emit('checking-for-update')
  env.updater.emit('update-available', { version })
}

beforeEach(() => start())

describe('auto update', () => {
  it('never downloads on its own: the user has to agree first', () => {
    expect(env.updater.autoDownload).toBe(false)
  })

  it('still installs an already downloaded update when the app quits', () => {
    expect(env.updater.autoInstallOnAppQuit).toBe(true)
  })

  it('finds a new version and waits for the user instead of downloading', async () => {
    await findUpdate()
    expect(seen).toEqual([{ status: 'checking' }, { status: 'available', version: '1.3.0' }])
    expect(env.updater.downloads).toBe(0)
  })

  it('downloads once the user agrees and reports progress until it is ready', async () => {
    await findUpdate()
    await updates.downloadUpdate()
    env.updater.emit('download-progress', { percent: 41.7 })
    env.updater.emit('update-downloaded', { version: '1.3.0' })
    expect(env.updater.downloads).toBe(1)
    expect(seen.slice(2)).toEqual([
      { status: 'downloading', version: '1.3.0', percent: 0 },
      { status: 'downloading', version: '1.3.0', percent: 42 },
      { status: 'ready', version: '1.3.0' },
    ])
  })

  it('does nothing when asked to download before an update was found, or twice', async () => {
    await updates.downloadUpdate()
    expect(env.updater.downloads).toBe(0)
    await findUpdate()
    await updates.downloadUpdate()
    await updates.downloadUpdate()
    expect(env.updater.downloads).toBe(1)
  })

  it('says so when the app is already up to date', async () => {
    await updates.checkForUpdates()
    env.updater.emit('checking-for-update')
    env.updater.emit('update-not-available', { version: '1.0.0' })
    expect(updates.updateState()).toEqual({ status: 'latest' })
  })

  it('turns a failed check into an error the user can read, and allows another try', async () => {
    env.updater.checkResult = async () => {
      env.updater.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'))
      throw new Error('net::ERR_INTERNET_DISCONNECTED')
    }
    await updates.checkForUpdates()
    expect(updates.updateState()).toEqual({
      status: 'error',
      message: 'Không kiểm tra được bản cập nhật. Kiểm tra kết nối mạng rồi thử lại.',
      manual: false,
    })
    await updates.checkForUpdates()
    expect(env.updater.checks).toBe(2)
  })

  it('offers a manual download when the update cannot be downloaded or installed', async () => {
    await findUpdate()
    env.updater.downloadResult = async () => {
      env.updater.emit('error', new Error('Could not get code signature for running application'))
      throw new Error('Could not get code signature for running application')
    }
    await updates.downloadUpdate()
    expect(updates.updateState()).toEqual({
      status: 'error',
      message: 'Không tự cài được bản 1.3.0. Bạn có thể tải bộ cài về và cài thủ công.',
      manual: true,
    })
  })

  it('opens the download page of the latest release for a manual install', async () => {
    await updates.openDownloadPage()
    expect(env.opened).toEqual(['https://github.com/LaPhuocLoc/Grido/releases/latest'])
  })

  it('does not start a second check while an update is waiting, downloading or downloaded', async () => {
    await findUpdate()
    await updates.checkForUpdates()
    await updates.downloadUpdate()
    await updates.checkForUpdates()
    env.updater.emit('update-downloaded', { version: '1.3.0' })
    await updates.checkForUpdates()
    expect(env.updater.checks).toBe(1)
  })

  it('installs silently and reopens the app, but only once the download has finished', async () => {
    updates.installUpdate()
    await findUpdate()
    updates.installUpdate()
    await updates.downloadUpdate()
    updates.installUpdate()
    expect(env.updater.installs).toEqual([])
    env.updater.emit('update-downloaded', { version: '1.3.0' })
    updates.installUpdate()
    expect(env.updater.installs).toEqual([[true, true]])
  })

  it('stays off when running from source', async () => {
    await start(false)
    await updates.checkForUpdates()
    await updates.downloadUpdate()
    expect(updates.updateState()).toEqual({ status: 'unsupported' })
    expect([env.updater.checks, env.updater.downloads]).toEqual([0, 0])
  })
})
