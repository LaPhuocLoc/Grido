import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Thư viện chạy trên ổ đĩa thật trong thư mục tạm; chỉ thay chỗ Electron cho biết thư mục dữ liệu.
let root: string
vi.mock('electron', () => ({ app: { getPath: () => path.join(root, 'userData') } }))

type Library = typeof import('../electron/library')
let lib: Library
let photos: string

const meta = { width: 100, height: 50, sourceWidth: 4000, sourceHeight: 2000, thumbType: 'image/webp' }
const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

async function fresh(): Promise<Library> {
  vi.resetModules()
  const mod = await import('../electron/library')
  mod.loadLibrary()
  return mod
}

async function add(file: string) {
  const { candidates } = await lib.stagePaths([file])
  return lib.addPhoto({ token: candidates[0].token, ...meta, preview: bytes('preview'), thumb: bytes('thumb') })
}

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'grido-test-'))
  photos = path.join(root, 'photos')
  mkdirSync(path.join(photos, 'trip', 'day1'), { recursive: true })
  writeFileSync(path.join(photos, 'a.jpg'), 'AAAA')
  writeFileSync(path.join(photos, 'notes.txt'), 'not an image')
  writeFileSync(path.join(photos, 'trip', 'b.PNG'), 'BB')
  writeFileSync(path.join(photos, 'trip', 'day1', 'c.webp'), 'C')
  lib = await fresh()
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('staging files', () => {
  it('finds images inside dropped folders and skips other files', async () => {
    const { candidates, duplicates } = await lib.stagePaths([photos])
    expect(candidates.map((c) => c.name).sort()).toEqual(['a', 'b', 'c'])
    expect(duplicates).toBe(0)
  })

  it('counts photos already in the library as duplicates instead of staging them again', async () => {
    await add(path.join(photos, 'a.jpg'))
    const { candidates, duplicates } = await lib.stagePaths([photos])
    expect(candidates.map((c) => c.name).sort()).toEqual(['b', 'c'])
    expect(duplicates).toBe(1)
  })

  it('stages the same file only once when it is dropped twice in one go', async () => {
    const file = path.join(photos, 'a.jpg')
    const { candidates, duplicates } = await lib.stagePaths([file, file])
    expect(candidates).toHaveLength(1)
    expect(duplicates).toBe(1)
  })

  it('returns nothing for a path that does not exist', async () => {
    expect(await lib.stagePaths([path.join(photos, 'missing.jpg')])).toEqual({ candidates: [], duplicates: 0 })
  })

  it('keeps pasted images inside its own imports folder whatever the file name says', async () => {
    const { candidates } = await lib.stageBytes('..\\..\\evil/../x.png', bytes('pasted'))
    const staged = lib.stagedPath(candidates[0].token)!
    expect(path.dirname(staged)).toBe(path.join(lib.dataDir(), 'imports'))
    expect(path.extname(staged)).toBe('.png')
  })
})

describe('adding photos', () => {
  it('records the original in place and reports its real size on disk', async () => {
    const photo = await add(path.join(photos, 'a.jpg'))
    expect(photo).toMatchObject({ name: 'a', path: path.join(photos, 'a.jpg'), size: 4, missing: false, ...{ width: 100, height: 50, sourceWidth: 4000, sourceHeight: 2000 } })
    expect((await lib.listPhotos()).map((p) => p.id)).toEqual([photo.id])
    expect(lib.photoFile(photo.id, 'original')).toBe(path.join(photos, 'a.jpg'))
  })

  it('lists the newest photo first', async () => {
    const a = await add(path.join(photos, 'a.jpg'))
    const b = await add(path.join(photos, 'trip', 'b.PNG'))
    expect((await lib.listPhotos()).map((p) => p.id)).toEqual([b.id, a.id])
  })

  it('uses a copy of the original as preview when none is supplied', async () => {
    const { candidates } = await lib.stagePaths([path.join(photos, 'trip', 'b.PNG')])
    const photo = await lib.addPhoto({ token: candidates[0].token, ...meta, preview: null, thumb: bytes('thumb') })
    const preview = lib.photoFile(photo.id, 'preview')!
    expect(preview.startsWith(lib.dataDir())).toBe(true)
    expect(path.extname(preview)).toBe('.png')
    expect(existsSync(preview)).toBe(true)
  })

  it('refuses a token that was never staged', async () => {
    await expect(lib.addPhoto({ token: 'nope', ...meta, preview: null, thumb: bytes('t') })).rejects.toThrow()
  })

  it('refuses to add the same staged file twice', async () => {
    const { candidates } = await lib.stagePaths([path.join(photos, 'a.jpg')])
    const input = { token: candidates[0].token, ...meta, preview: bytes('p'), thumb: bytes('t') }
    await lib.addPhoto(input)
    await expect(lib.addPhoto(input)).rejects.toThrow()
    expect(await lib.listPhotos()).toHaveLength(1)
  })

  it('still has the library after the app restarts', async () => {
    const photo = await add(path.join(photos, 'a.jpg'))
    lib = await fresh()
    expect(await lib.listPhotos()).toEqual([photo])
    expect(existsSync(lib.photoFile(photo.id, 'thumb')!)).toBe(true)
  })

  it('flags a photo whose original has gone away', async () => {
    const photo = await add(path.join(photos, 'a.jpg'))
    rmSync(path.join(photos, 'a.jpg'))
    expect(await lib.listPhotos()).toEqual([{ ...photo, missing: true }])
  })

  it('keeps every photo when several are added at the same time', async () => {
    const { candidates } = await lib.stagePaths([photos])
    await Promise.all(candidates.map((c) => lib.addPhoto({ token: c.token, ...meta, preview: bytes('p'), thumb: bytes('t') })))
    lib = await fresh()
    expect(await lib.listPhotos()).toHaveLength(3)
  })
})

describe('removing photos', () => {
  it('deletes its cache files but never the user’s original', async () => {
    const photo = await add(path.join(photos, 'a.jpg'))
    const cached = [lib.photoFile(photo.id, 'preview')!, lib.photoFile(photo.id, 'thumb')!]
    expect(await lib.removePhotos([photo.id, 'unknown-id'])).toEqual([photo.id])
    expect(await lib.listPhotos()).toEqual([])
    expect(cached.map((f) => existsSync(f))).toEqual([false, false])
    expect(existsSync(path.join(photos, 'a.jpg'))).toBe(true)
  })

  it('deletes the copy it made of a pasted image', async () => {
    const { candidates } = await lib.stageBytes('shot.png', bytes('pasted'))
    const photo = await lib.addPhoto({ token: candidates[0].token, ...meta, preview: bytes('p'), thumb: bytes('t') })
    await lib.removePhotos([photo.id])
    expect(readdirSync(path.join(lib.dataDir(), 'imports'))).toEqual([])
  })
})

describe('a damaged library index', () => {
  it.each([
    ['truncated JSON', '[{"id":"x"'],
    ['a JSON object instead of a list', '{"oops":true}'],
    ['a list with junk entries', '[null, 3, {"id":"only-id"}]'],
  ])('opens as an empty library when the index is %s', async (_label, content) => {
    mkdirSync(lib.dataDir(), { recursive: true })
    writeFileSync(path.join(lib.dataDir(), 'index.json'), content)
    lib = await fresh()
    expect(await lib.listPhotos()).toEqual([])
  })

  it('keeps the damaged index aside instead of overwriting it', async () => {
    mkdirSync(lib.dataDir(), { recursive: true })
    writeFileSync(path.join(lib.dataDir(), 'index.json'), '[{"id":"x"')
    lib = await fresh()
    await add(path.join(photos, 'a.jpg'))
    expect(readdirSync(lib.dataDir()).some((f) => f.startsWith('index.damaged'))).toBe(true)
  })
})
