// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { droppedFile, fakeBridge, photo } from './helpers/bridge'

// Tạo bản xem trước cần canvas + Web Worker thật; ở đây chỉ kiểm tra store nên thay bằng kết quả cố định.
vi.mock('../src/lib/imaging/tasks', () => ({
  POOL_SIZE: 2,
  prepareImport: async () => ({
    preview: new Blob(['p']),
    thumb: new Blob(['t'], { type: 'image/webp' }),
    width: 2560,
    height: 1707,
    sourceWidth: 6000,
    sourceHeight: 4000,
  }),
}))

type Store = typeof import('../src/store')
let mod: Store
let fake: ReturnType<typeof fakeBridge>
const get = () => mod.useStore.getState()
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

async function boot(photoIds: string[] = ids(14)) {
  fake = fakeBridge(photoIds.map((id) => photo(id)))
  window.grido = fake.bridge
  vi.resetModules()
  mod = await import('../src/store')
  await get().loadPhotos()
}

/** Các thao tác cách nhau đủ lâu để mỗi cái thành một bước undo riêng. */
const pause = () => vi.advanceTimersByTime(1000)

beforeEach(async () => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  await boot()
})
afterEach(() => vi.useRealTimers())

describe('choosing photos', () => {
  it('adds photos to the collage in click order and picks a layout for that many photos', () => {
    get().toggleSelect('p2')
    get().toggleSelect('p1')
    expect(get().selected).toEqual(['p2', 'p1'])
    expect(get().layoutId).toBe('H(*,*)')
    expect(get().tree).toEqual({ kind: 'split', dir: 'h', weights: [1, 1], children: [{ kind: 'cell' }, { kind: 'cell' }] })
  })

  it('removes a photo when it is clicked again and clears the collage when none are left', () => {
    get().toggleSelect('p1')
    get().toggleSelect('p1')
    expect(get()).toMatchObject({ selected: [], tree: null, layoutId: null })
  })

  it('refuses a 13th photo and says why', () => {
    ids(13).forEach((id) => get().toggleSelect(id))
    expect(get().selected).toEqual(ids(12))
    expect(get().toasts.map((t) => t.message)).toEqual(['Một ảnh ghép chứa tối đa 12 ảnh.'])
  })

  it('puts the clicked photo into the active cell instead of adding a cell', () => {
    ids(3).forEach((id) => get().toggleSelect(id))
    const layout = get().layoutId
    get().setActiveCell(1)
    get().toggleSelect('p9')
    expect(get().selected).toEqual(['p1', 'p9', 'p3'])
    expect(get().layoutId).toBe(layout)
  })

  it('swaps two cells when the clicked photo is already in another cell', () => {
    ids(3).forEach((id) => get().toggleSelect(id))
    const layout = get().layoutId
    get().setActiveCell(0)
    get().toggleSelect('p3')
    expect(get().selected).toEqual(['p3', 'p2', 'p1'])
    expect(get().layoutId).toBe(layout)
  })

  it('keeps a hand-tuned layout when photos are only reordered', () => {
    ids(2).forEach((id) => get().toggleSelect(id))
    const tuned = { kind: 'split' as const, dir: 'h' as const, weights: [1.4, 0.6], children: [{ kind: 'cell' as const }, { kind: 'cell' as const }] }
    get().setTree(tuned)
    get().swapCells(0, 1)
    expect(get().selected).toEqual(['p2', 'p1'])
    expect(get().tree).toEqual(tuned)
  })

  it('shuffle always changes the order', () => {
    ids(2).forEach((id) => get().toggleSelect(id))
    get().shuffle()
    expect(get().selected).toEqual(['p2', 'p1'])
  })
})

describe('removing photos from the library', () => {
  it('takes them out of the collage as well', async () => {
    ids(3).forEach((id) => get().toggleSelect(id))
    get().setAdjust('p2', { zoom: 2 })
    await get().deletePhotos(['p2'])
    expect(get().photos.map((p) => p.id)).not.toContain('p2')
    expect(get().selected).toEqual(['p1', 'p3'])
    expect(get().layoutId).toBe('H(*,*)')
    expect(get().adjust).toEqual({})
  })
})

describe('undo / redo', () => {
  it('steps back and forward through separate edits', () => {
    get().toggleSelect('p1')
    pause()
    get().toggleSelect('p2')
    pause()
    get().set({ gap: 5 })
    get().undo()
    expect(get()).toMatchObject({ gap: 1.2, selected: ['p1', 'p2'] })
    get().undo()
    expect(get().selected).toEqual(['p1'])
    get().redo()
    get().redo()
    expect(get()).toMatchObject({ gap: 5, selected: ['p1', 'p2'] })
  })

  it('folds a continuous slider drag into one step', () => {
    get().toggleSelect('p1')
    pause()
    for (const gap of [2, 3, 4]) {
      get().set({ gap })
      vi.advanceTimersByTime(50)
    }
    get().undo()
    expect(get().gap).toBe(1.2)
  })

  it('does not record changes that are not part of the collage', () => {
    get().toggleSelect('p1')
    pause()
    get().set({ exportQuality: 0.8, theme: 'dark' })
    get().setActiveCell(0)
    get().undo()
    expect(get().selected).toEqual([])
    expect(get().exportQuality).toBe(0.8)
  })

  it('skips states that used a photo which has since been removed', async () => {
    get().toggleSelect('p1')
    pause()
    get().toggleSelect('p2')
    pause()
    get().clearSelection()
    pause()
    get().toggleSelect('p3')
    pause()
    await get().deletePhotos(['p2'])
    get().undo() // về trạng thái rỗng (trước khi chọn p3)
    get().undo() // [p1, p2] không còn hợp lệ → nhảy về [p1]
    expect(get().selected).toEqual(['p1'])
  })

  it('clears redo history once a new edit is made', () => {
    get().toggleSelect('p1')
    pause()
    get().toggleSelect('p2')
    get().undo()
    pause()
    get().toggleSelect('p3')
    get().redo()
    expect(get().selected).toEqual(['p1', 'p3'])
  })
})

describe('saved layouts', () => {
  it('saves the tuned layout once and can re-apply it', () => {
    ids(2).forEach((id) => get().toggleSelect(id))
    const tuned = { kind: 'split' as const, dir: 'h' as const, weights: [1.5, 0.5], children: [{ kind: 'cell' as const }, { kind: 'cell' as const }] }
    get().setTree(tuned)
    expect(get().saveLayout()).toBe(true)
    expect(get().saveLayout()).toBe(false)
    expect(get().savedLayouts).toHaveLength(1)
    get().setLayout('V(*,*)')
    get().applySavedLayout(get().savedLayouts[0].id)
    expect(get().tree).toEqual(tuned)
  })
})

describe('text', () => {
  it('adds, edits and removes a caption', () => {
    get().toggleSelect('p1')
    get().addText()
    const id = get().texts[0].id
    expect(get()).toMatchObject({ activeText: id, tab: 'text', activeCell: null })
    get().updateText(id, { text: 'Đà Lạt 2026' })
    expect(get().texts[0].text).toBe('Đà Lạt 2026')
    get().removeText(id)
    expect(get()).toMatchObject({ texts: [], activeText: null })
  })
})

describe('importing photos', () => {
  it('adds dropped image files to the front of the library', async () => {
    await get().importFiles([droppedFile('D:\\shoot\\new1.jpg'), droppedFile('D:\\shoot\\new2.png', 'image/png')])
    expect(get().photos.slice(0, 2).map((p) => p.name).sort()).toEqual(['new1', 'new2'])
    expect(get().photos).toHaveLength(16)
    expect(get().imports).toEqual([])
  })

  it('tells the user when nothing dropped was an image', async () => {
    await get().importFiles([droppedFile('D:\\docs\\report.pdf', 'application/pdf')])
    expect(get().toasts.map((t) => t.kind)).toEqual(['error'])
    expect(get().photos).toHaveLength(14)
  })

  it('skips photos that are already in the library and says how many', async () => {
    await get().importFiles([droppedFile('C:\\photos\\p1.jpg'), droppedFile('D:\\shoot\\new.jpg')])
    expect(get().photos).toHaveLength(15)
    expect(get().toasts.map((t) => t.message)).toEqual(['1 ảnh đã có sẵn trong thư viện nên được bỏ qua.'])
  })

  it('keeps importing the rest when one file cannot be read, and shows that file as failed', async () => {
    fake.state.failAdd.add('D:\\shoot\\broken.jpg')
    await get().importFiles([droppedFile('D:\\shoot\\ok.jpg'), droppedFile('D:\\shoot\\broken.jpg')])
    expect(get().photos[0].name).toBe('ok')
    expect(get().photos).toHaveLength(15)
    expect(get().imports).toMatchObject([{ name: 'broken', status: 'error', error: 'Ổ đĩa đầy' }])
    get().dismissImport(get().imports[0].key)
    expect(get().imports).toEqual([])
  })

  it('stays silent when the file picker is cancelled', async () => {
    await get().pickPhotos()
    expect(get().toasts).toEqual([])
  })

  it('imports what the user chose in the file picker', async () => {
    fake.state.pickResult = ['E:\\card\\DSC001.JPG']
    await get().pickPhotos()
    expect(get().photos[0].name).toBe('DSC001')
  })
})

describe('reopening the app', () => {
  it('restores the collage in progress', async () => {
    ids(3).forEach((id) => get().toggleSelect(id))
    get().set({ gap: 4, bg: '#000000' })
    get().setAdjust('p2', { zoom: 2.5 })
    window.dispatchEvent(new Event('pagehide'))
    await boot()
    expect(get()).toMatchObject({ selected: ['p1', 'p2', 'p3'], gap: 4, bg: '#000000' })
    expect(get().adjust.p2.zoom).toBe(2.5)
    expect(get().tree).not.toBeNull()
  })

  it('drops photos that left the library while the app was closed and starts with empty undo history', async () => {
    ids(3).forEach((id) => get().toggleSelect(id))
    window.dispatchEvent(new Event('pagehide'))
    await boot(['p1', 'p3'])
    expect(get().selected).toEqual(['p1', 'p3'])
    expect(get().layoutId).toBe('H(*,*)')
    expect(get().past).toEqual([])
  })
})

describe('frame size', () => {
  it('uses the preset size', () => {
    expect(mod.canvasSize({ presetId: 'story', customW: 1, customH: 1 })).toEqual({ width: 1080, height: 1920 })
  })

  it('clamps a custom size that is still being typed', () => {
    expect(mod.canvasSize({ presetId: 'custom', customW: 10, customH: 99999 })).toEqual({ width: 200, height: 6000 })
    expect(mod.canvasSize({ presetId: 'custom', customW: Number.NaN, customH: 1500.6 })).toEqual({ width: 200, height: 1501 })
  })

  it('falls back to the custom size for a preset id that no longer exists', () => {
    expect(mod.canvasSize({ presetId: 'removed-preset', customW: 800, customH: 600 })).toEqual({ width: 800, height: 600 })
  })
})
