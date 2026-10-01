import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '../shared/types'

// Bản thế của electron-updater: phát đúng những sự kiện mà bản thật phát, do test điều khiển.
class FakeUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  checks = 0
  installs = 0
  checkResult: () => Promise<unknown> = async () => null
  checkForUpdates() {
    this.checks++
    return this.checkResult()
  }
  quitAndInstall() {
    this.installs++
  }
}

const env = { packaged: true, updater: new FakeUpdater() }
vi.mock('electron', () => ({ app: { get isPackaged() { return env.packaged } } }))
vi.mock('electron-updater', () => ({ get autoUpdater() { return env.updater } }))

let updates: typeof import('../electron/updates')
let seen: UpdateState[]

async function start(packaged = true) {
  env.packaged = packaged
  env.updater = new FakeUpdater()
  vi.resetModules()
  updates = await import('../electron/updates')
  seen = []
  updates.initUpdates((state) => seen.push(state))
}

beforeEach(() => start())

describe('auto update', () => {
  it('downloads a new version in the background and installs it when the app quits', () => {
    expect([env.updater.autoDownload, env.updater.autoInstallOnAppQuit]).toEqual([true, true])
  })

  it('reports each step from finding an update to being ready to install', async () => {
    await updates.checkForUpdates()
    env.updater.emit('checking-for-update')
    env.updater.emit('update-available', { version: '1.2.0' })
    env.updater.emit('download-progress', { percent: 41.7 })
    env.updater.emit('update-downloaded', { version: '1.2.0' })
    expect(seen).toEqual([
      { status: 'checking' },
      { status: 'downloading', version: '1.2.0', percent: 0 },
      { status: 'downloading', version: '1.2.0', percent: 42 },
      { status: 'ready', version: '1.2.0' },
    ])
    expect(updates.updateState()).toEqual({ status: 'ready', version: '1.2.0' })
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
    expect(updates.updateState()).toEqual({ status: 'error', message: 'Không kiểm tra được bản cập nhật. Kiểm tra kết nối mạng rồi thử lại.' })
    await updates.checkForUpdates()
    expect(env.updater.checks).toBe(2)
  })

  it('does not start a second check while one is downloading or already downloaded', async () => {
    await updates.checkForUpdates()
    env.updater.emit('update-available', { version: '1.2.0' })
    await updates.checkForUpdates()
    env.updater.emit('update-downloaded', { version: '1.2.0' })
    await updates.checkForUpdates()
    expect(env.updater.checks).toBe(1)
  })

  it('restarts into the new version only once it has been downloaded', async () => {
    updates.installUpdate()
    expect(env.updater.installs).toBe(0)
    env.updater.emit('update-available', { version: '1.2.0' })
    env.updater.emit('update-downloaded', { version: '1.2.0' })
    updates.installUpdate()
    expect(env.updater.installs).toBe(1)
  })

  it('stays off when running from source', async () => {
    await start(false)
    await updates.checkForUpdates()
    expect(updates.updateState()).toEqual({ status: 'unsupported' })
    expect(env.updater.checks).toBe(0)
  })
})
