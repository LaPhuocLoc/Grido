// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBridge, photo } from './helpers/bridge'

// Dựng và mã hoá ảnh cần canvas thật + Web Worker; ở đây kiểm tra luồng xuất file quanh hai bước đó.
const renderCollage = vi.fn()
const encodeCanvas = vi.fn()
vi.mock('../src/lib/imaging/exportCollage', () => ({ renderCollage, collageLayout: vi.fn() }))
vi.mock('../src/lib/imaging/encode', () => ({ encodeCanvas }))
vi.mock('../src/lib/imaging/tasks', () => ({ POOL_SIZE: 2, prepareImport: vi.fn() }))

let store: typeof import('../src/store')
let collage: typeof import('../src/lib/useCollage')
let fake: ReturnType<typeof fakeBridge>
const get = () => store.useStore.getState()

beforeEach(async () => {
  localStorage.clear()
  fake = fakeBridge(['p1', 'p2', 'p3'].map((id) => photo(id)))
  window.grido = fake.bridge
  vi.resetModules()
  store = await import('../src/store')
  collage = await import('../src/lib/useCollage')
  await get().loadPhotos()
  renderCollage.mockReset().mockResolvedValue({ width: 0, height: 0 })
  encodeCanvas.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]))
})
afterEach(() => vi.useRealTimers())

describe('buildSpec', () => {
  it('is null until photos are chosen', () => {
    expect(collage.buildSpec(get())).toBeNull()
  })

  it('scales the frame and converts border settings from % of the short side to pixels', () => {
    get().toggleSelect('p1')
    get().toggleSelect('p2')
    get().set({ presetId: 'story', margin: 2, gap: 1.2, radius: 5 })
    get().setAdjust('p2', { zoom: 2 })
    const spec = collage.buildSpec(get(), 2)!
    expect(spec).toMatchObject({ width: 2160, height: 3840, margin: 43, gap: 26, radius: 108 })
    expect(spec.cells.map((c) => [c.photo.id, c.adjust.zoom])).toEqual([
      ['p1', 1],
      ['p2', 2],
    ])
  })
})

describe('exporting', () => {
  beforeEach(() => {
    get().toggleSelect('p1')
    get().toggleSelect('p2')
  })

  it('asks for at least one photo instead of opening a save dialog', async () => {
    get().clearSelection()
    await collage.exportToFile()
    expect(fake.saved).toEqual([])
    expect(get().toasts.map((t) => t.message)).toEqual(['Chọn ít nhất một ảnh để ghép đã nhé.'])
  })

  it('does no rendering work when the save dialog is cancelled', async () => {
    fake.state.saveResult = null
    await collage.exportToFile()
    expect(renderCollage).not.toHaveBeenCalled()
    expect(get().toasts).toEqual([])
    expect(collage.useExportProgress.getState().progress).toBeNull()
  })

  it('writes the encoded image to the chosen path and offers to open the folder', async () => {
    get().set({ presetId: 'ig-square', exportFormat: 'image/png' })
    await collage.exportToFile()
    expect(fake.saved).toHaveLength(1)
    expect(fake.saved[0].path).toBe('C:\\out\\collage.jpg')
    expect(fake.saved[0].suggested).toMatch(/^tiem-ghep-anh-\d{8}-\d{6}\.png$/)
    expect([...new Uint8Array(fake.saved[0].bytes)]).toEqual([1, 2, 3])
    expect(renderCollage.mock.calls[0][0]).toMatchObject({ width: 1080, height: 1080 })
    expect(get().toasts).toMatchObject([{ kind: 'success', action: { label: 'Mở thư mục' } }])
  })

  it('passes the chosen format, quality and sharpening on to the encoder and renderer', async () => {
    get().set({ exportFormat: 'image/jpeg', exportQuality: 0.9, exportSharpen: 'off' })
    await collage.exportToFile()
    expect(encodeCanvas.mock.calls[0].slice(1)).toEqual(['image/jpeg', 0.9])
    expect(renderCollage.mock.calls[0][1]).toBe(0)
    get().set({ exportSharpen: 'high' })
    await collage.exportToFile()
    expect(renderCollage.mock.calls[1][1]).toBeGreaterThan(0)
  })

  it('exports at exactly the frame size, ignoring a scale saved by an older version', async () => {
    store.useStore.setState({ exportScale: 3 } as never)
    get().set({ presetId: 'custom', customW: 6000, customH: 3000 })
    await collage.exportToFile()
    expect(renderCollage.mock.calls[0][0]).toMatchObject({ width: 6000, height: 3000 })
  })

  it('reports a failed export and becomes ready for another try', async () => {
    renderCollage.mockRejectedValue(new Error('Không đọc được ảnh "p1".'))
    await collage.exportToFile()
    expect(fake.saved).toEqual([])
    expect(get().toasts).toMatchObject([{ kind: 'error', message: 'Không đọc được ảnh "p1".' }])
    expect(collage.useExportProgress.getState().progress).toBeNull()
  })

  it('ignores a second export while one is running', async () => {
    let finish!: (canvas: unknown) => void
    renderCollage.mockReturnValue(new Promise((r) => (finish = r)))
    const first = collage.exportToFile()
    await vi.waitFor(() => expect(renderCollage).toHaveBeenCalledTimes(1))
    await collage.exportToFile()
    finish({ width: 0, height: 0 })
    await first
    expect(renderCollage).toHaveBeenCalledTimes(1)
    expect(fake.saved).toHaveLength(1)
  })
})
