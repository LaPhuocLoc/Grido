// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewPhoto, StageResult } from '../shared/types'
import { disk, FakeDir, FakeFile, files, newSession, permissions, resetStorage } from './helpers/webFs'

vi.mock('../src/platform/web/storage', async () => (await import('./helpers/webFs')).storage)

type Library = Awaited<ReturnType<typeof import('../src/platform/web/library').createLibrary>>
let lib: Library
/** Thứ hộp thoại của trình duyệt sẽ trả về ở lần mở tiếp theo. */
const picker = { files: [] as FakeFile[], folder: null as FakeDir | null }

/** Mở lại app: thư viện đọc lại từ chỗ lưu của trang. */
async function open() {
  const { createLibrary } = await import('../src/platform/web/library')
  lib = await createLibrary()
}

const input = (token: string, preview = true): NewPhoto => ({
  token,
  width: 100,
  height: 50,
  sourceWidth: 200,
  sourceHeight: 100,
  preview: preview ? new ArrayBuffer(4) : null,
  thumb: new ArrayBuffer(2),
  thumbType: 'image/webp',
})

/** Đưa mọi ảnh vừa được nhận vào thư viện, như giao diện làm sau khi tạo xong bản xem trước. */
const addAll = async (staged: StageResult) => {
  for (const c of staged.candidates) await lib.library.add(input(c.token))
  return staged
}

const pickFolder = async (dir: FakeDir) => {
  picker.folder = dir
  return addAll(await lib.library.pickFolder!())
}
const pickFiles = async (...handles: FakeFile[]) => {
  picker.files = handles
  return addAll(await lib.library.pick())
}

beforeEach(async () => {
  resetStorage()
  vi.stubGlobal('showOpenFilePicker', async () => picker.files)
  vi.stubGlobal('showDirectoryPicker', async () => picker.folder)
  Object.assign(navigator, { storage: { persist: async () => true } })
  let n = 0
  URL.createObjectURL = () => `blob:test/${++n}`
  URL.revokeObjectURL = () => {}
  await open()
})

describe('adding photos', () => {
  it('takes every image in a folder, including subfolders, and skips other files', async () => {
    const trip = disk('trip')
    trip.file('b.jpg')
    trip.file('a.png')
    trip.file('notes.txt')
    trip.dir('day2').file('c.JPG')

    const staged = await pickFolder(trip)
    expect(staged.candidates.map((c) => c.name)).toEqual(['a', 'b', 'c'])
    const photos = await lib.library.list()
    expect(photos.map((p) => p.path).sort()).toEqual(['trip/a.png', 'trip/b.jpg', 'trip/day2/c.JPG'])
    expect(photos.every((p) => !p.missing && !p.locked && !p.stale)).toBe(true)
  })

  it('stops descending after four folder levels', async () => {
    const root = disk('deep')
    let dir = root
    for (let i = 1; i <= 5; i++) {
      dir.file(`level${i}.jpg`)
      dir = dir.dir(`d${i}`)
    }
    expect((await pickFolder(root)).candidates.map((c) => c.name).sort()).toEqual(['level1', 'level2', 'level3', 'level4'])
  })

  it('keeps no copy of an original that lives on disk', async () => {
    const trip = disk('trip')
    await pickFiles(trip.file('a.jpg'))
    expect(files.imports.size).toBe(0)
    expect([...files.cache.keys()].map((n) => n.replace(/^[0-9a-f-]{36}/, 'ID')).sort()).toEqual(['ID.preview.jpg', 'ID.thumb.webp'])
  })

  it('uses the original bytes as the preview when the file is already small', async () => {
    const trip = disk('trip')
    picker.files = [trip.file('small.png', 'tiny')]
    const { candidates } = await lib.library.pick()
    const photo = await lib.library.add(input(candidates[0].token, false))
    expect(await files.cache.get(`${photo.id}.preview.png`)!.text()).toBe('tiny')
  })

  it('skips a file that is already in the library, however it is picked again', async () => {
    const trip = disk('trip')
    const a = trip.file('a.jpg')
    await pickFiles(a)

    expect(await pickFiles(a)).toMatchObject({ candidates: [], duplicates: 1 })
    trip.file('b.jpg')
    expect(await pickFolder(trip)).toMatchObject({ duplicates: 1, candidates: [{ name: 'b' }] })
    expect(await lib.library.list()).toHaveLength(2)
  })

  it('treats an identical file in another folder as a different photo', async () => {
    const trip = disk('trip')
    await pickFiles(trip.file('a.jpg', 'same', 5))
    const copy = disk('backup').file('a.jpg', 'same', 5)
    expect(await pickFiles(copy)).toMatchObject({ duplicates: 0, candidates: [{ name: 'a' }] })
  })

  it('takes dropped folders and files in place, and keeps its own copy of images without a file on disk', async () => {
    const trip = disk('trip')
    trip.file('a.jpg')
    const single = disk('desktop').file('b.jpg')
    const pasted = new File(['x'], 'shot.png', { type: 'image/png' })
    const item = (handle: unknown, file: File | null) => ({ kind: 'file', getAsFileSystemHandle: async () => handle, getAsFile: () => file })
    const data = { items: [item(trip, null), item(single, null), item(null, pasted), { kind: 'string' }] } as unknown as DataTransfer

    const staged = await addAll(await lib.library.stageDrop(data))
    expect(staged.candidates.map((c) => c.name)).toEqual(['a', 'b', 'shot'])
    expect([...files.imports.keys()]).toHaveLength(1)
  })

  it('keeps the original of a pasted image and deletes it with the photo', async () => {
    const pasted = new File(['pixels'], 'shot.png', { type: 'image/png' })
    const { candidates } = await lib.library.stageFiles([pasted, new File(['x'], 'doc.pdf', { type: 'application/pdf' })])
    expect(candidates).toHaveLength(1)
    const photo = await lib.library.add(input(candidates[0].token))

    const sources = (await lib.images.cellSources(photo)) as File[]
    expect(await sources[0].text()).toBe('pixels')
    expect(sources).toHaveLength(2)

    await lib.library.remove([photo.id])
    expect(files.imports.size + files.cache.size).toBe(0)
  })
})

describe('reading originals', () => {
  it('exports from the original first, then the preview', async () => {
    const trip = disk('trip')
    await pickFiles(trip.file('a.jpg', 'original bytes'))
    const [photo] = await lib.library.list()
    const sources = (await lib.images.cellSources(photo)) as File[]
    expect(await sources[0].text()).toBe('original bytes')
    expect(sources[1].name).toMatch(/\.preview\.jpg$/)
  })

  it('locks photos in a new browser session and falls back to the preview', async () => {
    const trip = disk('trip')
    trip.file('a.jpg')
    trip.file('b.jpg')
    await pickFolder(trip)

    newSession()
    await open()
    const photos = await lib.library.list()
    expect(photos.map((p) => [p.missing, p.locked])).toEqual([[true, true], [true, true]])
    const sources = (await lib.images.cellSources(photos[0])) as File[]
    expect(sources.map((s) => s.name)).toEqual([expect.stringMatching(/\.preview\.jpg$/)])
  })

  it('asks once per folder to unlock every photo inside it', async () => {
    const trip = disk('trip')
    trip.file('a.jpg')
    trip.dir('day2').file('b.jpg')
    await pickFolder(trip)
    const loose = disk('desktop').file('c.jpg')
    await pickFiles(loose)

    newSession()
    await open()
    await lib.library.list()
    await lib.library.grantAccess!()
    expect(permissions.asked.sort()).toEqual(['c.jpg', 'trip'])
    expect((await lib.library.list()).every((p) => !p.locked && !p.missing)).toBe(true)
  })

  it('groups a file picked on its own under a folder that was already added', async () => {
    const trip = disk('trip')
    trip.file('a.jpg')
    await pickFolder(trip)
    await pickFiles(trip.file('late.jpg'))

    newSession()
    await open()
    await lib.library.list()
    await lib.library.grantAccess!()
    expect(permissions.asked).toEqual(['trip'])
  })

  it('stops asking when the user says no and leaves the photos locked', async () => {
    const trip = disk('trip')
    trip.file('a.jpg')
    await pickFolder(trip)
    await pickFiles(disk('desktop').file('b.jpg'))

    newSession()
    await open()
    await lib.library.list()
    permissions.answer = 'denied'
    await lib.library.grantAccess!()
    expect(permissions.asked).toHaveLength(1)
    expect((await lib.library.list()).every((p) => p.locked)).toBe(true)
  })

  it('reports a deleted original as missing, not locked', async () => {
    const trip = disk('trip')
    await pickFiles(trip.file('a.jpg'))
    trip.items.delete('a.jpg')
    expect(await lib.library.list()).toMatchObject([{ missing: true, locked: false }])
  })
})

describe('originals that change', () => {
  it('flags a photo whose file was edited and rebuilds its preview', async () => {
    const trip = disk('trip')
    const a = trip.file('a.jpg', 'v1', 1000)
    await pickFiles(a)
    expect((await lib.library.list())[0].stale).toBe(false)

    a.rewrite('version two', 2000)
    const [photo] = await lib.library.list()
    expect(photo.stale).toBe(true)

    const next = await lib.library.refresh!(photo.id, { ...input(''), width: 300, sourceWidth: 900 })
    expect(next).toMatchObject({ stale: false, width: 300, sourceWidth: 900, size: 'version two'.length })
    expect((await lib.library.list())[0].stale).toBe(false)
    expect(files.cache.size).toBe(2)
  })

  it('reconnects a moved file to its photo instead of adding a second one', async () => {
    const trip = disk('trip')
    await pickFiles(trip.file('a.jpg', 'pixels', 1234))
    const [before] = await lib.library.list()

    const moved = await trip.move('a.jpg', disk('archive'))
    expect((await lib.library.list())[0].missing).toBe(true)

    expect(await pickFiles(moved)).toMatchObject({ candidates: [], duplicates: 0, relinked: 1 })
    const photos = await lib.library.list()
    expect(photos).toHaveLength(1)
    expect(photos[0]).toMatchObject({ id: before.id, missing: false, stale: false })
  })
})

describe('backup and restore', () => {
  it('lists photos with a file on disk, without handles, and leaves pasted images out', async () => {
    const trip = disk('trip')
    await pickFiles(trip.file('a.jpg'))
    const { candidates } = await lib.library.stageFiles([new File(['x'], 'shot.png', { type: 'image/png' })])
    await lib.library.add(input(candidates[0].token))

    const backup = lib.backupPhotos()
    expect(backup).toHaveLength(1)
    expect(backup[0]).toMatchObject({ fileName: 'a.jpg', size: 5, lastModified: 1000 })
    expect(Object.keys(backup[0])).not.toContain('handle')
    expect(() => JSON.stringify(backup)).not.toThrow()
  })

  it('restores photos under the same ids, waiting for their files, then reconnects them', async () => {
    const trip = disk('trip')
    trip.file('a.jpg')
    trip.file('b.jpg')
    await pickFolder(trip)
    const ids = (await lib.library.list()).map((p) => p.id)
    const backup = JSON.parse(JSON.stringify(lib.backupPhotos()))

    // Trình duyệt khác / dữ liệu duyệt web đã bị xoá.
    resetStorage()
    await open()
    expect(await lib.restorePhotos(backup)).toBe(2)
    expect(await lib.restorePhotos(backup)).toBe(0)
    let photos = await lib.library.list()
    expect(photos.map((p) => p.id)).toEqual(ids)
    expect(photos.every((p) => p.missing && !p.locked)).toBe(true)

    permissions.granted.add(trip)
    expect(await pickFolder(trip)).toMatchObject({ candidates: [], relinked: 2 })
    photos = await lib.library.list()
    expect(photos.map((p) => p.id)).toEqual(ids)
    // Chưa có bản xem trước: phải dựng lại từ file gốc.
    expect(photos.every((p) => !p.missing && p.stale)).toBe(true)

    await lib.library.refresh!(ids[0], input(''))
    expect((await lib.library.list()).map((p) => p.stale)).toEqual([false, true])
  })

  it('ignores entries that are not photos', async () => {
    expect(await lib.restorePhotos([null, {}, { id: 1 }] as never)).toBe(0)
  })
})

describe('housekeeping', () => {
  it('removes leftover files that no photo uses and keeps the rest', async () => {
    const trip = disk('trip')
    await pickFiles(trip.file('a.jpg'))
    files.cache.set('orphan.preview.jpg', new File(['x'], 'orphan'))
    files.imports.set('orphan.png', new File(['x'], 'orphan'))

    expect(await lib.cleanup()).toBe(2)
    expect(files.cache.size).toBe(2)
    expect(await lib.cleanup()).toBe(0)
  })

  it('forgets a folder once its last photo is removed, so it is not asked about again', async () => {
    const trip = disk('trip')
    trip.file('a.jpg')
    await pickFolder(trip)
    const [photo] = await lib.library.list()
    await lib.library.remove([photo.id])

    newSession()
    await open()
    await lib.library.list()
    await lib.library.grantAccess!()
    expect(permissions.asked).toEqual([])
  })

  it('hands out an image address once the cached file is read, and tells subscribers', async () => {
    const trip = disk('trip')
    await pickFiles(trip.file('a.jpg'))
    const [photo] = await lib.library.list()
    const notified = vi.fn()
    lib.images.subscribe(notified)

    expect(lib.images.url(photo.id, 'thumb')).toBe('')
    await vi.waitFor(() => expect(notified).toHaveBeenCalled())
    expect(lib.images.url(photo.id, 'thumb')).toMatch(/^blob:/)
    expect(lib.images.version()).toBe(1)
  })
})
