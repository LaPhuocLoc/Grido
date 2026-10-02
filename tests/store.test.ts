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

describe('removing a photo from the collage', () => {
  it('takes the photo in the selected cell out of the collage but keeps it in the library', () => {
    ids(3).forEach((id) => get().toggleSelect(id))
    get().setActiveCell(1)
    get().removeActiveCell()
    expect(get().selected).toEqual(['p1', 'p3'])
    expect(get().activeCell).toBeNull()
    expect(get().photos).toHaveLength(14)
  })

  it('does nothing when no cell is selected', () => {
    ids(2).forEach((id) => get().toggleSelect(id))
    get().removeActiveCell()
    expect(get().selected).toEqual(['p1', 'p2'])
  })
})

describe('sidebar', () => {
  it('remembers that it is collapsed the next time the app opens', async () => {
    expect(get()).toMatchObject({ leftCollapsed: false })
    get().set({ leftCollapsed: true })
    vi.advanceTimersByTime(1000)
    await boot()
    expect(get()).toMatchObject({ leftCollapsed: true })
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

  it('opens a new caption straight in typing mode, centred and unrotated', () => {
    get().toggleSelect('p1')
    get().addText()
    const item = get().texts[0]
    expect(get().editingText).toBe(item.id)
    expect(item).toMatchObject({ x: 0.5, y: 0.5, italic: false, underline: false, strike: false, align: 'center', rotation: 0, width: null })
  })

  it('leaves typing mode when the caption is deselected, removed or another one is picked', () => {
    get().toggleSelect('p1')
    get().addText()
    get().setActiveText(null)
    expect(get().editingText).toBeNull()

    get().addText()
    const [first, second] = get().texts
    get().setActiveText(first.id)
    expect(get().editingText).toBeNull()

    get().setEditingText(second.id)
    expect(get()).toMatchObject({ activeText: second.id, editingText: second.id })
    get().removeText(second.id)
    expect(get().editingText).toBeNull()
  })

  it('duplicates a caption next to the original and selects the copy', () => {
    get().toggleSelect('p1')
    get().addText()
    const original = get().texts[0]
    get().updateText(original.id, { text: 'Gió Mây', italic: true, rotation: 15 })
    get().duplicateText(original.id)
    const [, copy] = get().texts
    expect(get().texts).toHaveLength(2)
    expect(copy).toMatchObject({ text: 'Gió Mây', italic: true, rotation: 15 })
    expect(copy.id).not.toBe(original.id)
    expect(copy.x).toBeGreaterThan(original.x)
    expect(copy.y).toBeGreaterThan(original.y)
    expect(get()).toMatchObject({ activeText: copy.id, editingText: null })
  })

  it('upgrades captions from a draft saved before the style fields existed', async () => {
    const old = { id: 't1', text: 'Đà Lạt', x: 0.5, y: 0.5, size: 8, color: '#ffffff', font: 'round', bold: true, shadow: true }
    localStorage.setItem('grido-settings', JSON.stringify({ state: { texts: [old] }, version: 0 }))
    await boot()
    expect(get().texts).toEqual([
      {
        ...old,
        italic: false,
        underline: false,
        strike: false,
        align: 'center',
        rotation: 0,
        width: null,
        spacing: 0,
        lineHeight: 1.25,
        anchor: 'middle',
        opacity: 100,
        vertical: false,
      },
    ])
  })
})

describe('library tips', () => {
  it('shows the tips until they are dismissed, and remembers that after a restart', async () => {
    expect(get().libraryTipSeen).toBe(false)
    get().set({ libraryTipSeen: true })
    vi.advanceTimersByTime(1000)
    await boot()
    expect(get().libraryTipSeen).toBe(true)
  })
})

describe('albums', () => {
  it('creates an album with the given name, or a numbered default', () => {
    const first = get().createAlbum('Đà Lạt')
    const second = get().createAlbum()
    expect(get().albums).toEqual([
      { id: first, name: 'Đà Lạt' },
      { id: second, name: 'Album 2' },
    ])
  })

  it('renames an album and ignores a blank name', () => {
    const id = get().createAlbum('Cũ')
    get().renameAlbum(id, '  Mới  ')
    expect(get().albums[0].name).toBe('Mới')
    get().renameAlbum(id, '   ')
    expect(get().albums[0].name).toBe('Mới')
  })

  it('moves photos into an album and back out to uncategorised', () => {
    const id = get().createAlbum('Đà Lạt')
    get().movePhotos(['p1', 'p2'], id)
    expect(get().photoAlbum).toEqual({ p1: id, p2: id })
    get().movePhotos(['p1'], null)
    expect(get().photoAlbum).toEqual({ p2: id })
  })

  it('removing an album sends its photos back to uncategorised without deleting them', () => {
    const keep = get().createAlbum('Giữ')
    const gone = get().createAlbum('Bỏ')
    get().movePhotos(['p1'], keep)
    get().movePhotos(['p2', 'p3'], gone)
    get().toggleAlbumCollapsed(gone)
    get().removeAlbum(gone)
    expect(get().albums.map((a) => a.id)).toEqual([keep])
    expect(get().photoAlbum).toEqual({ p1: keep })
    expect(get().collapsedAlbums).toEqual([])
    expect(get().photos).toHaveLength(14)
  })

  it('forgets the album of a photo that is deleted from the library', async () => {
    const id = get().createAlbum('Đà Lạt')
    get().movePhotos(['p1', 'p2'], id)
    await get().deletePhotos(['p1'])
    expect(get().photoAlbum).toEqual({ p2: id })
  })

  it('remembers which sections are collapsed', () => {
    const id = get().createAlbum('Đà Lạt')
    get().toggleAlbumCollapsed(id)
    get().toggleAlbumCollapsed('none')
    expect(get().collapsedAlbums).toEqual([id, 'none'])
    get().toggleAlbumCollapsed(id)
    expect(get().collapsedAlbums).toEqual(['none'])
  })

  it('keeps albums and their photos after the app is reopened', async () => {
    const id = get().createAlbum('Đà Lạt')
    get().movePhotos(['p1'], id)
    vi.advanceTimersByTime(1000)
    await boot()
    expect(get().albums).toEqual([{ id, name: 'Đà Lạt' }])
    expect(get().photoAlbum).toEqual({ p1: id })
  })

  it('puts photos picked from an album straight into that album', async () => {
    const id = get().createAlbum('Thẻ nhớ')
    fake.state.pickResult = ['E:\card\DSC001.JPG', 'E:\card\DSC002.JPG']
    await get().pickPhotos(id)
    const added = get().photos.slice(0, 2).map((p) => p.id)
    expect(Object.keys(get().photoAlbum).sort()).toEqual([...added].sort())
    expect(Object.values(get().photoAlbum)).toEqual([id, id])
  })

  it('leaves photos added without an album uncategorised', async () => {
    get().createAlbum('Thẻ nhớ')
    fake.state.pickResult = ['E:\card\DSC003.JPG']
    await get().pickPhotos()
    expect(get().photoAlbum).toEqual({})
  })
})

describe('importing photos', () => {
  it('brings a large batch in completely, newest first, straight into the chosen album', async () => {
    const album = get().createAlbum('Sado')
    const names = Array.from({ length: 40 }, (_, i) => `shot${String(i).padStart(2, '0')}`)
    await get().importFiles(names.map((n) => droppedFile(`D:\\shoot\\${n}.jpg`)), album)
    expect(get().photos).toHaveLength(14 + 40)
    expect(get().imports).toEqual([])
    const added = get().photos.slice(0, 40)
    expect(added.map((p) => p.name).sort()).toEqual(names)
    expect(added.every((p) => get().photoAlbum[p.id] === album)).toBe(true)
  })

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
    expect(mod.canvasSize({ presetId: 'custom', customW: 10, customH: 99999 })).toEqual({ width: 200, height: 10000 })
    expect(mod.canvasSize({ presetId: 'custom', customW: Number.NaN, customH: 1500.6 })).toEqual({ width: 200, height: 1501 })
  })

  it('falls back to the custom size for a preset id that no longer exists', () => {
    expect(mod.canvasSize({ presetId: 'removed-preset', customW: 800, customH: 600 })).toEqual({ width: 800, height: 600 })
  })
})

describe('original frame', () => {
  const size = () => mod.canvasSize(get())

  it('starts a new collage at the first photo’s original resolution and keeps it as photos are added', async () => {
    mod.useStore.setState({ photos: [photo('p1', { sourceWidth: 4000, sourceHeight: 5000 }), photo('p2')] })
    get().toggleSelect('p1')
    expect(get().presetId).toBe('original')
    expect(size()).toEqual({ width: 4000, height: 5000 })
    get().clearSelection()
    // Ảnh máy ảnh lớn hơn 6000px vẫn giữ nguyên độ phân giải.
    mod.useStore.setState({ photos: [photo('p1', { sourceWidth: 4672, sourceHeight: 7008 }), photo('p2')] })
    get().toggleSelect('p1')
    expect(size()).toEqual({ width: 4672, height: 7008 })
    get().toggleSelect('p2')
    expect(size()).toEqual({ width: 4672, height: 7008 })
  })

  it('keeps a frame the user picked until the collage is emptied', () => {
    get().toggleSelect('p1')
    get().set({ presetId: 'story' })
    get().toggleSelect('p2')
    expect(get().presetId).toBe('story')
    get().clearSelection()
    get().toggleSelect('p2')
    expect(get().presetId).toBe('original')
    expect(size()).toEqual({ width: 6000, height: 4000 })
  })

  it('shrinks an oversized original to the canvas limit, and uses the preview when the file is gone', async () => {
    mod.useStore.setState({ photos: [photo('p1', { sourceWidth: 12000, sourceHeight: 8000 }), photo('p2', { missing: true })] })
    get().toggleSelect('p1')
    expect(size()).toEqual({ width: 10000, height: 6667 })
    get().clearSelection()
    get().toggleSelect('p2')
    expect(size()).toEqual({ width: 2560, height: 1707 })
  })

  it('goes back to the original size on request', () => {
    get().toggleSelect('p1')
    get().set({ presetId: 'ig-square' })
    get().applyOriginalSize()
    expect(get().presetId).toBe('original')
    expect(size()).toEqual({ width: 6000, height: 4000 })
  })

  it('moves a draft that used a retired frame to the same custom size', async () => {
    localStorage.setItem('grido-settings', JSON.stringify({ state: { presetId: 'a4' }, version: 0 }))
    await boot()
    expect(get().presetId).toBe('custom')
    expect(size()).toEqual({ width: 2480, height: 3508 })
  })
})

describe('favourite fonts and frames', () => {
  it('toggles and survives a restart', async () => {
    get().toggleFavoriteFont('lora')
    get().toggleFavoritePreset('story')
    get().toggleFavoritePreset('fb-cover')
    get().toggleFavoritePreset('story')
    expect(get().favoriteFonts).toEqual(['lora'])
    expect(get().favoritePresets).toEqual(['fb-cover'])
    window.dispatchEvent(new Event('pagehide'))
    await boot()
    expect(get().favoriteFonts).toEqual(['lora'])
    expect(get().favoritePresets).toEqual(['fb-cover'])
  })
})

describe('designs', () => {
  const titles = () => get().designs.map((d) => d.snapshot.selected.join('+'))
  const caption = (text: string) => {
    get().addText()
    get().updateText(get().activeText!, { text })
  }

  it('saves the collage as a design as soon as it has a photo, and keeps it up to date', () => {
    expect(get().designs).toEqual([])
    get().toggleSelect('p1')
    expect(get().designs).toHaveLength(1)
    expect(get().currentDesignId).toBe(get().designs[0].id)
    get().toggleSelect('p2')
    get().set({ bg: '#000000' })
    expect(get().designs).toHaveLength(1)
    expect(get().designs[0].snapshot).toMatchObject({ selected: ['p1', 'p2'], bg: '#000000' })
  })

  it('starts a new design without touching the one being put away', () => {
    get().toggleSelect('p1')
    get().toggleSelect('p2')
    const first = get().currentDesignId
    get().newDesign()
    expect(get()).toMatchObject({ selected: [], tree: null, currentDesignId: null, tab: 'library', past: [] })
    get().toggleSelect('p3')
    expect(get().currentDesignId).not.toBe(first)
    expect(titles()).toEqual(['p3', 'p1+p2'])
  })

  it('switches between designs, restoring each one exactly and resetting undo', () => {
    get().toggleSelect('p1')
    caption('Đà Lạt')
    const a = get().currentDesignId!
    get().newDesign()
    get().toggleSelect('p2')
    get().toggleSelect('p3')
    get().set({ presetId: 'story' })
    const b = get().currentDesignId!

    get().openDesign(a)
    expect(get()).toMatchObject({ selected: ['p1'], currentDesignId: a, presetId: 'original', past: [], activeText: null })
    expect(get().texts.map((t) => t.text)).toEqual(['Đà Lạt'])
    get().undo()
    expect(get().selected).toEqual(['p1'])

    get().openDesign(b)
    expect(get()).toMatchObject({ selected: ['p2', 'p3'], presetId: 'story', texts: [] })
    // Mở qua lại không được làm đổi nội dung đã lưu.
    expect(get().designs.find((d) => d.id === a)!.snapshot.selected).toEqual(['p1'])
  })

  it('keeps a design that was emptied by mistake so undo brings it back under the same name', () => {
    get().toggleSelect('p1')
    const id = get().currentDesignId!
    get().renameDesign(id, 'Kỷ yếu')
    pause()
    get().clearSelection()
    expect(get().currentDesignId).toBe(id)
    get().undo()
    expect(get().designs).toMatchObject([{ id, name: 'Kỷ yếu', snapshot: { selected: ['p1'] } }])
  })

  it('keeps the design open after every photo is taken out, and carries on with it when photos come back', () => {
    get().toggleSelect('p1')
    caption('Đà Lạt')
    const id = get().currentDesignId!
    get().clearSelection()
    expect(get()).toMatchObject({ currentDesignId: id, tree: null })
    expect(get().designs).toMatchObject([{ id, snapshot: { selected: [] } }])

    get().toggleSelect('p2')
    expect(get().currentDesignId).toBe(id)
    expect(get().designs).toHaveLength(1)
    expect(get().texts.map((t) => t.text)).toEqual(['Đà Lạt'])
  })

  it('starts clean after "new design" even when the open design had lost its photos, and keeps that design for its text', () => {
    get().toggleSelect('p1')
    caption('Đà Lạt')
    const id = get().currentDesignId!
    get().clearSelection()
    get().newDesign()
    expect(get()).toMatchObject({ currentDesignId: null, texts: [] })
    expect(get().designs).toMatchObject([{ id, snapshot: { selected: [] } }])

    get().toggleSelect('p2')
    expect(get().currentDesignId).not.toBe(id)
    expect(get().texts).toEqual([])
    expect(titles()).toEqual(['p2', ''])

    // Mở lại thiết kế cũ: chữ còn nguyên, chọn ảnh là ghép tiếp.
    get().openDesign(id)
    expect(get().texts.map((t) => t.text)).toEqual(['Đà Lạt'])
  })

  it('forgets a design with neither photos nor text once the user moves on', () => {
    get().toggleSelect('p1')
    get().clearSelection()
    // Với người dùng đây là khung trống, không phải "một thiết kế chưa có ảnh".
    expect(mod.currentDesign(get())).toBeNull()
    get().newDesign()
    expect(get()).toMatchObject({ designs: [], currentDesignId: null })
  })

  it('treats an emptied design as still open only while it has text or a name of its own', () => {
    get().toggleSelect('p1')
    const id = get().currentDesignId!
    get().renameDesign(id, 'Kỷ yếu')
    get().clearSelection()
    expect(mod.currentDesign(get())?.id).toBe(id)
    get().newDesign()
    expect(get().designs.map((d) => d.name)).toEqual(['Kỷ yếu'])
  })

  it('says where the design went when a new one is started, and offers the way back', () => {
    get().toggleSelect('p1')
    const id = get().currentDesignId!
    get().newDesign()
    expect(get().toasts).toMatchObject([{ kind: 'success', action: { label: 'Mở lại' } }])
    get().toasts[0].action!.run()
    expect(get()).toMatchObject({ currentDesignId: id, selected: ['p1'] })
  })

  it('renames, falls back to the automatic name when cleared, and duplicates under a free name', () => {
    get().toggleSelect('p1')
    const id = get().currentDesignId!
    get().renameDesign(id, '  Sado  ')
    expect(get().designs[0].name).toBe('Sado')
    get().duplicateDesign(id)
    get().duplicateDesign(id)
    expect(get().designs.map((d) => d.name)).toEqual(['Sado (bản sao 2)', 'Sado (bản sao)', 'Sado'])
    expect(get().currentDesignId).toBe(id)
    get().renameDesign(id, '   ')
    expect(get().designs[2].name).toBeNull()
  })

  it('deletes a design with an undo, clearing the stage when it was the open one', () => {
    get().toggleSelect('p1')
    const id = get().currentDesignId!
    get().removeDesign(id)
    expect(get()).toMatchObject({ designs: [], currentDesignId: null, selected: [], tree: null })
    get().toasts[0].action!.run()
    expect(get().designs.map((d) => d.id)).toEqual([id])
    // Ảnh vẫn còn trong thư viện.
    expect(get().photos).toHaveLength(14)
  })

  it('drops deleted photos from saved designs and removes designs left with no photo', async () => {
    get().toggleSelect('p1')
    get().newDesign()
    get().toggleSelect('p1')
    get().toggleSelect('p2')
    get().toggleSelect('p3')
    get().newDesign()
    await get().deletePhotos(['p1'])
    expect(titles()).toEqual(['p2+p3'])
    expect(get().designs[0].snapshot.layoutId).toBe('H(*,*)')
  })

  it('remembers every design and which one is open after a restart', async () => {
    get().toggleSelect('p1')
    get().newDesign()
    get().toggleSelect('p2')
    const open = get().currentDesignId
    window.dispatchEvent(new Event('pagehide'))
    await boot()
    expect(titles()).toEqual(['p2', 'p1'])
    expect(get()).toMatchObject({ currentDesignId: open, selected: ['p2'] })
  })

  it('turns a draft from a version without designs into the first design', async () => {
    const tree = { kind: 'cell' }
    localStorage.setItem('grido-settings', JSON.stringify({ state: { selected: ['p4'], layoutId: '*', tree }, version: 0 }))
    await boot()
    expect(titles()).toEqual(['p4'])
    expect(get().currentDesignId).toBe(get().designs[0].id)
  })
})

describe('selecting many photos at once', () => {
  it('adds the swept photos in order, skipping ones already in the collage', () => {
    get().toggleSelect('p2')
    get().selectMany(['p1', 'p2', 'p3'])
    expect(get().selected).toEqual(['p2', 'p1', 'p3'])
    expect(get().layoutId).not.toBeNull()
    expect(get().toasts).toEqual([])
  })

  it('stops at the photo limit and says how many were added', () => {
    ids(10).forEach((id) => get().toggleSelect(id))
    get().selectMany(['p11', 'p12', 'p13', 'p14'])
    expect(get().selected).toEqual(ids(12))
    expect(get().toasts.map((t) => t.message)).toEqual(['Chỉ thêm được 2 ảnh: một ảnh ghép chứa tối đa 12 ảnh.'])
  })

  it('does nothing when every swept photo is already there', () => {
    get().toggleSelect('p1')
    const before = get().designs
    get().selectMany(['p1'])
    expect(get().selected).toEqual(['p1'])
    expect(get().designs).toBe(before)
  })
})

describe('font picker memory', () => {
  it('keeps the most recently used fonts, newest first, without reshuffling ones already listed', () => {
    ;['a', 'b', 'c'].forEach((id) => get().noteRecentFont(id))
    get().noteRecentFont('a')
    expect(get().recentFonts).toEqual(['c', 'b', 'a'])
    ;['d', 'e', 'f', 'g'].forEach((id) => get().noteRecentFont(id))
    expect(get().recentFonts).toEqual(['g', 'f', 'e', 'd', 'c', 'b'])
  })

  it('previews a font without touching the caption, its design or the undo history', () => {
    get().toggleSelect('p1')
    get().addText()
    pause()
    const { texts, designs, past } = get()
    get().setPreviewFont({ id: texts[0].id, font: 'serif' })
    expect(get()).toMatchObject({ texts, designs, past })
  })

  it('remembers recent fonts and the panel width after a restart, but not a preview', async () => {
    get().noteRecentFont('serif')
    get().set({ panelWidth: 520 })
    get().setPreviewFont({ id: 't', font: 'serif' })
    vi.advanceTimersByTime(1000)
    await boot()
    expect(get()).toMatchObject({ recentFonts: ['serif'], panelWidth: 520, previewFont: null })
  })
})
