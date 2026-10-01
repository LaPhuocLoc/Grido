import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import type { ImportCandidate, Photo, StageResult } from '../shared/types'
import { desktop, importUrl } from './lib/desktop'
import { DEFAULT_ADJUST, type CellAdjust } from './lib/geometry'
import { POOL_SIZE, prepareImport } from './lib/imaging/tasks'
import { countCells, parseLayout } from './lib/layout/dsl'
import { getLayouts, MAX_PHOTOS } from './lib/layout/registry'
import type { LayoutNode } from './lib/layout/types'
import { albumName, pruneAlbumMap, type Album } from './lib/albums'
import { normalizeText, type TextItem } from './lib/text'
import { CUSTOM_PRESET_ID, MAX_CANVAS, MIN_CANVAS, SIZE_PRESETS } from './lib/presets'

/** Ảnh đang được nhập vào thư viện (tạo bản xem trước + thumbnail). */
export interface ImportItem {
  key: number
  name: string
  status: 'processing' | 'error'
  error?: string
  /** Album sẽ nhận ảnh này khi chuẩn bị xong. */
  albumId?: string
}

export interface Toast {
  key: number
  kind: 'info' | 'error' | 'success'
  message: string
  /** Đang chạy hiệu ứng biến mất, sắp bị gỡ khỏi danh sách. */
  leaving?: boolean
  /** Nút hành động kèm theo thông báo (vd. "Mở thư mục"). */
  action?: { label: string; run: () => void }
}

export type Tab = 'library' | 'layout' | 'size' | 'style' | 'text' | 'export'

/** Bố cục người dùng tự lưu (giữ cả tỉ lệ ô đã kéo chỉnh). */
export interface SavedLayout {
  id: string
  n: number
  tree: LayoutNode
}
const MAX_SAVED_LAYOUTS = 60
/** Khớp với thời lượng hiệu ứng toast-out trong index.css. */
const TOAST_EXIT_MS = 220

export type Theme = 'system' | 'light' | 'dark'

export type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp'
/** Mức làm nét đầu ra khi xuất (bù phần chi tiết mềm đi sau khi thu nhỏ). */
export type ExportSharpen = 'off' | 'low' | 'standard' | 'high'

interface Settings {
  presetId: string
  customW: number
  customH: number
  /** Viền ngoài / khoảng cách giữa ảnh / bo góc: tính theo % cạnh ngắn của khung để không phụ thuộc độ phân giải. */
  margin: number
  gap: number
  radius: number
  bg: string
  exportFormat: ExportFormat
  exportQuality: number
  exportScale: number
  exportSharpen: ExportSharpen
  theme: Theme
  /** Panel thư viện (trái) / panel công cụ (phải) đang thu gọn. */
  leftCollapsed: boolean
  rightCollapsed: boolean
  /** Người dùng đã đóng dải mẹo thao tác ở cuối thư viện. */
  libraryTipSeen: boolean
}

/** Những trường tạo nên một ảnh ghép — là thứ được undo/redo và lưu nháp. */
const EDIT_KEYS = [
  'selected',
  'layoutId',
  'tree',
  'adjust',
  'texts',
  'margin',
  'gap',
  'radius',
  'bg',
  'presetId',
  'customW',
  'customH',
] as const
type Snapshot = Pick<State, (typeof EDIT_KEYS)[number]>
const snapshot = (s: State): Snapshot => Object.fromEntries(EDIT_KEYS.map((k) => [k, s[k]])) as Snapshot
const HISTORY_LIMIT = 60
/** Các thay đổi liên tiếp trong khoảng này (kéo chuột, kéo slider) gộp thành một bước undo. */
const COALESCE_MS = 600

interface State extends Settings {
  photos: Photo[]
  imports: ImportItem[]
  /** Id ảnh theo đúng thứ tự ô trong bố cục. */
  selected: string[]
  layoutId: string | null
  tree: LayoutNode | null
  adjust: Record<string, CellAdjust>
  activeCell: number | null
  tab: Tab
  texts: TextItem[]
  activeText: string | null
  /** Dòng chữ đang được gõ trực tiếp trên khung ghép. */
  editingText: string | null
  past: Snapshot[]
  future: Snapshot[]
  toasts: Toast[]
  /** Id các bố cục có sẵn được thả tim. */
  favorites: string[]
  savedLayouts: SavedLayout[]
  albums: Album[]
  /** Id ảnh → id album. Ảnh không có ở đây là "Chưa phân loại". */
  photoAlbum: Record<string, string>
  /** Id các mục đang thu gọn trong thư viện (UNCATEGORIZED cho mục "Chưa phân loại"). */
  collapsedAlbums: string[]

  loadPhotos: () => Promise<void>
  /** Mở hộp thoại chọn ảnh của hệ điều hành. */
  pickPhotos: (albumId?: string) => Promise<void>
  /** Nhận file kéo thả hoặc dán vào cửa sổ. */
  importFiles: (files: File[], albumId?: string) => Promise<void>
  dismissImport: (key: number) => void
  deletePhotos: (ids: string[]) => Promise<void>
  /** Tạo album; trả về id. Không truyền tên thì đặt "Album N". */
  createAlbum: (name?: string) => string
  renameAlbum: (id: string, name: string) => void
  /** Xoá album; ảnh bên trong quay về "Chưa phân loại", không bị xoá khỏi thư viện. */
  removeAlbum: (id: string) => void
  /** Chuyển ảnh vào album, hoặc về "Chưa phân loại" khi albumId là null. */
  movePhotos: (ids: string[], albumId: string | null) => void
  toggleAlbumCollapsed: (id: string) => void
  toggleSelect: (id: string) => void
  clearSelection: () => void
  shuffle: () => void
  swapCells: (a: number, b: number) => void
  setLayout: (id: string) => void
  toggleFavorite: (id: string) => void
  /** Lưu bố cục đang dùng; trả về false nếu chưa có gì để lưu hoặc đã lưu rồi. */
  saveLayout: () => boolean
  applySavedLayout: (id: string) => void
  removeSavedLayout: (id: string) => void
  randomLayout: () => void
  setTree: (tree: LayoutNode) => void
  setAdjust: (photoId: string, patch: Partial<CellAdjust>) => void
  setActiveCell: (index: number | null) => void
  /** Bỏ ảnh ở ô đang chọn khỏi bố cục; ảnh vẫn nằm trong thư viện. */
  removeActiveCell: () => void
  addText: () => void
  updateText: (id: string, patch: Partial<TextItem>) => void
  removeText: (id: string) => void
  duplicateText: (id: string) => void
  setActiveText: (id: string | null) => void
  setEditingText: (id: string | null) => void
  undo: () => void
  redo: () => void
  set: (patch: Partial<Settings>) => void
  toast: (message: string, kind?: Toast['kind'], action?: Toast['action']) => void
}

let seq = 1

type Persisted = Settings & Snapshot & Pick<State, 'favorites' | 'savedLayouts' | 'albums' | 'photoAlbum' | 'collapsedAlbums'>

/**
 * Ghi localStorage có trì hoãn: kéo slider hay cuộn zoom đổi state hàng chục lần mỗi giây,
 * ghi đồng bộ từng lần sẽ làm khựng giao diện. Gom lại ghi một lần, và ghi ngay khi đóng cửa sổ.
 */
function lazyStorage(): PersistStorage<Persisted> {
  let pending: { name: string; value: StorageValue<Persisted> } | null = null
  let timer: number | undefined
  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    if (!pending) return
    try {
      localStorage.setItem(pending.name, JSON.stringify(pending.value))
    } catch {
      // Hết chỗ hoặc bị chặn: bỏ qua, app vẫn chạy, chỉ là không lưu được bản nháp.
    }
    pending = null
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
  return {
    getItem: (name) => {
      try {
        const raw = localStorage.getItem(name)
        return raw ? (JSON.parse(raw) as StorageValue<Persisted>) : null
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      pending = { name, value }
      timer ??= window.setTimeout(flush, 400)
    },
    removeItem: (name) => {
      pending = null
      localStorage.removeItem(name)
    },
  }
}

// true trong lúc undo/redo đang ghi state, để thao tác đó không tự sinh thêm bước lịch sử.
let restoring = false
let lastEdit = 0

/** Bỏ những ảnh không còn trong thư viện khỏi bản ghép (kèm tinh chỉnh của chúng). Không có gì để bỏ thì không đổi state. */
function withoutMissing(state: State, alive: (id: string) => boolean): Partial<State> {
  if (state.selected.every(alive) && Object.keys(state.adjust).every(alive)) return {}
  return {
    ...withSelection(state, state.selected.filter(alive)),
    adjust: Object.fromEntries(Object.entries(state.adjust).filter(([id]) => alive(id))),
  }
}

/** Khi số ảnh đổi thì bố cục cũ không còn hợp lệ → chọn bố cục đầu tiên của số ảnh mới. */
function withSelection(state: State, selected: string[]): Partial<State> {
  if (selected.length === 0) return { selected, layoutId: null, tree: null, activeCell: null }
  if (selected.length === state.selected.length && state.tree) return { selected, activeCell: null }
  const layoutId = getLayouts(selected.length)[0].id
  return { selected, layoutId, tree: parseLayout(layoutId), activeCell: null }
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      presetId: SIZE_PRESETS[0].id,
      customW: 1080,
      customH: 1350,
      margin: 2,
      gap: 1.2,
      radius: 0,
      bg: '#ffffff',
      exportFormat: 'image/jpeg',
      exportQuality: 0.95,
      exportScale: 1,
      exportSharpen: 'standard',
      theme: 'system',
      leftCollapsed: false,
      rightCollapsed: false,
      libraryTipSeen: false,

      photos: [],
      imports: [],
      selected: [],
      layoutId: null,
      tree: null,
      adjust: {},
      activeCell: null,
      tab: 'library',
      texts: [],
      activeText: null,
      editingText: null,
      past: [],
      future: [],
      toasts: [],
      favorites: [],
      savedLayouts: [],
      albums: [],
      photoAlbum: {},
      collapsedAlbums: [],

      loadPhotos: async () => {
        try {
          const photos = await desktop.library.list()
          const alive = new Set(photos.map((p) => p.id))
          set((s) => ({ photos, photoAlbum: pruneAlbumMap(s.photoAlbum, (id) => alive.has(id)), ...withoutMissing(s, (id) => alive.has(id)) }))
          // Đối chiếu bản nháp với thư viện không phải thao tác của user → không tính vào lịch sử undo.
          set({ past: [], future: [] })
        } catch (err) {
          get().toast((err as Error).message, 'error')
        }
      },

      pickPhotos: async (albumId) => importStaged(await desktop.library.pick(), true, albumId),

      importFiles: async (files, albumId) => {
        const paths: string[] = []
        const staged: StageResult = { candidates: [], duplicates: 0 }
        const merge = (r: StageResult) => {
          staged.candidates.push(...r.candidates)
          staged.duplicates += r.duplicates
        }
        try {
          for (const file of files) {
            const path = desktop.pathForFile(file)
            if (path) paths.push(path)
            // Không có đường dẫn (ảnh dán từ clipboard, kéo từ trình duyệt): app tự giữ một bản.
            else if (file.type.startsWith('image/')) merge(await desktop.library.stageBytes(file.name, await file.arrayBuffer()))
          }
          if (paths.length) merge(await desktop.library.stage(paths))
        } catch (err) {
          return get().toast((err as Error).message, 'error')
        }
        await importStaged(staged, false, albumId)
      },

      dismissImport: (key) => set((s) => ({ imports: s.imports.filter((u) => u.key !== key) })),

      deletePhotos: async (ids) => {
        try {
          const deleted = new Set(await desktop.library.remove(ids))
          set((s) => ({
            photos: s.photos.filter((p) => !deleted.has(p.id)),
            photoAlbum: pruneAlbumMap(s.photoAlbum, (id) => !deleted.has(id)),
            ...withoutMissing(s, (id) => !deleted.has(id)),
          }))
        } catch (err) {
          get().toast((err as Error).message, 'error')
        }
      },

      createAlbum: (name) => {
        const id = `a${Date.now().toString(36)}${seq++}`
        set((s) => ({ albums: [...s.albums, { id, name: albumName(name, s.albums) }] }))
        return id
      },

      renameAlbum: (id, name) => {
        const next = name.trim()
        if (next) set((s) => ({ albums: s.albums.map((a) => (a.id === id ? { ...a, name: next } : a)) }))
      },

      removeAlbum: (id) =>
        set((s) => ({
          albums: s.albums.filter((a) => a.id !== id),
          photoAlbum: Object.fromEntries(Object.entries(s.photoAlbum).filter(([, album]) => album !== id)),
          collapsedAlbums: s.collapsedAlbums.filter((c) => c !== id),
        })),

      movePhotos: (ids, albumId) =>
        set((s) => {
          const next = { ...s.photoAlbum }
          for (const id of ids) {
            if (albumId === null) delete next[id]
            else next[id] = albumId
          }
          return { photoAlbum: next }
        }),

      toggleAlbumCollapsed: (id) =>
        set((s) => ({ collapsedAlbums: s.collapsedAlbums.includes(id) ? s.collapsedAlbums.filter((c) => c !== id) : [...s.collapsedAlbums, id] })),

      toggleSelect: (id) => {
        const s = get()
        // Đang chọn một ô trong khung → ảnh vừa bấm sẽ vào ô đó thay vì thêm ô mới;
        // nếu ảnh ấy đang nằm ở ô khác thì hai ô đổi chỗ cho nhau.
        if (s.activeCell !== null && s.selected[s.activeCell] && s.selected[s.activeCell] !== id) {
          const next = [...s.selected]
          const from = next.indexOf(id)
          if (from >= 0) next[from] = next[s.activeCell]
          next[s.activeCell] = id
          return set({ selected: next })
        }
        if (s.selected.includes(id))
          return set(
            withSelection(
              s,
              s.selected.filter((x) => x !== id),
            ),
          )
        if (s.selected.length >= MAX_PHOTOS) return s.toast(`Một ảnh ghép chứa tối đa ${MAX_PHOTOS} ảnh.`)
        set(withSelection(s, [...s.selected, id]))
      },

      clearSelection: () => set((s) => withSelection(s, [])),

      shuffle: () =>
        set((s) => {
          if (s.selected.length < 2) return {}
          const next = [...s.selected]
          // Fisher–Yates; lặp lại nếu vô tình ra đúng thứ tự cũ.
          do {
            for (let i = next.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1))
              ;[next[i], next[j]] = [next[j], next[i]]
            }
          } while (next.every((id, i) => id === s.selected[i]))
          return { selected: next, activeCell: null }
        }),

      swapCells: (a, b) =>
        set((s) => {
          const next = [...s.selected]
          ;[next[a], next[b]] = [next[b], next[a]]
          return { selected: next, activeCell: b }
        }),

      setLayout: (id) => set({ layoutId: id, tree: parseLayout(id) }),

      toggleFavorite: (id) =>
        set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [id, ...s.favorites] })),

      saveLayout: () => {
        const s = get()
        if (!s.tree) return false
        const signature = JSON.stringify(s.tree)
        if (s.savedLayouts.some((l) => JSON.stringify(l.tree) === signature)) {
          s.toast('Bố cục này đã có trong mục Đã lưu.')
          return false
        }
        const saved: SavedLayout = { id: `saved:${Date.now().toString(36)}${seq++}`, n: countCells(s.tree), tree: structuredClone(s.tree) }
        set({ savedLayouts: [saved, ...s.savedLayouts].slice(0, MAX_SAVED_LAYOUTS) })
        s.toast('Đã lưu bố cục. Lần sau chọn lại trong mục Đã lưu.', 'success')
        return true
      },

      applySavedLayout: (id) => {
        const saved = get().savedLayouts.find((l) => l.id === id)
        if (saved) set({ layoutId: saved.id, tree: structuredClone(saved.tree) })
      },

      removeSavedLayout: (id) => set((s) => ({ savedLayouts: s.savedLayouts.filter((l) => l.id !== id) })),

      randomLayout: () => {
        const s = get()
        const options = getLayouts(s.selected.length).filter((l) => l.id !== s.layoutId)
        if (options.length) s.setLayout(options[Math.floor(Math.random() * options.length)].id)
      },

      setTree: (tree) => set({ tree }),

      setAdjust: (photoId, patch) =>
        set((s) => ({ adjust: { ...s.adjust, [photoId]: { ...(s.adjust[photoId] ?? DEFAULT_ADJUST), ...patch } } })),

      setActiveCell: (activeCell) => set(activeCell === null ? { activeCell } : { activeCell, activeText: null, editingText: null }),

      removeActiveCell: () => {
        const s = get()
        const id = s.activeCell === null ? undefined : s.selected[s.activeCell]
        if (id) s.toggleSelect(id)
      },

      addText: () => {
        const id = `t${Date.now().toString(36)}${seq++}`
        const item = normalizeText({ id, text: 'Chữ của bạn' })
        // Vào luôn chế độ gõ để người dùng thay chữ mẫu ngay trên ảnh.
        set((s) => ({ texts: [...s.texts, item], activeText: id, editingText: id, activeCell: null, tab: 'text' }))
      },

      updateText: (id, patch) => set((s) => ({ texts: s.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

      removeText: (id) =>
        set((s) => ({
          texts: s.texts.filter((t) => t.id !== id),
          activeText: s.activeText === id ? null : s.activeText,
          editingText: s.editingText === id ? null : s.editingText,
        })),

      duplicateText: (id) => {
        const source = get().texts.find((t) => t.id === id)
        if (!source) return
        const copy: TextItem = {
          ...source,
          id: `t${Date.now().toString(36)}${seq++}`,
          // Lệch nhẹ để thấy bản sao; sát mép thì lệch ngược lại cho khỏi ra ngoài khung.
          x: source.x + (source.x > 0.9 ? -0.04 : 0.04),
          y: source.y + (source.y > 0.9 ? -0.04 : 0.04),
        }
        set((s) => ({ texts: [...s.texts, copy], activeText: copy.id, editingText: null, activeCell: null, tab: 'text' }))
      },

      setActiveText: (activeText) =>
        set(activeText === null ? { activeText, editingText: null } : { activeText, editingText: null, activeCell: null, tab: 'text' }),

      setEditingText: (editingText) =>
        set(editingText === null ? { editingText } : { editingText, activeText: editingText, activeCell: null, tab: 'text' }),

      undo: () => step('past', 'future'),
      redo: () => step('future', 'past'),

      set: (patch) => set(patch),

      toast: (message, kind = 'info', action) => {
        // Bấm liên tục vào cùng một giới hạn thì không xếp chồng thông báo giống hệt nhau.
        if (get().toasts.some((t) => t.message === message && !t.leaving)) return
        const key = seq++
        set((s) => ({ toasts: [...s.toasts, { key, kind, message, action }] }))
        // Thông báo có nút bấm thì nán lại lâu hơn để kịp bấm.
        const life = action ? 9000 : 4500
        setTimeout(() => set((s) => ({ toasts: s.toasts.map((t) => (t.key === key ? { ...t, leaving: true } : t)) })), life)
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.key !== key) })), life + TOAST_EXIT_MS)
      },
    }),
    {
      name: 'grido-settings',
      storage: lazyStorage(),
      // Lưu cả cài đặt lẫn bản nháp đang ghép, để lần sau mở app làm tiếp được ngay.
      partialize: (s): Persisted => ({
        ...snapshot(s),
        presetId: s.presetId,
        customW: s.customW,
        customH: s.customH,
        margin: s.margin,
        gap: s.gap,
        radius: s.radius,
        bg: s.bg,
        exportFormat: s.exportFormat,
        exportQuality: s.exportQuality,
        exportScale: s.exportScale,
        exportSharpen: s.exportSharpen,
        theme: s.theme,
        leftCollapsed: s.leftCollapsed,
        rightCollapsed: s.rightCollapsed,
        libraryTipSeen: s.libraryTipSeen,
        favorites: s.favorites,
        savedLayouts: s.savedLayouts,
        albums: s.albums,
        photoAlbum: s.photoAlbum,
        collapsedAlbums: s.collapsedAlbums,
      }),
      merge: (saved, current) => {
        const persisted = (saved ?? {}) as Partial<Persisted>
        return { ...current, ...persisted, texts: (persisted.texts ?? []).map(normalizeText) }
      },
    },
  ),
)

/** Tạo bản xem trước + thumbnail cho từng file đã được main process nhận rồi đưa vào thư viện. */
/** `albumId`: album nhận ảnh mới; bỏ trống thì ảnh nằm ở "Chưa phân loại". */
async function importStaged({ candidates, duplicates }: StageResult, fromDialog: boolean, albumId?: string): Promise<void> {
  const { toast } = useStore.getState()
  if (duplicates) toast(`${duplicates} ảnh đã có sẵn trong thư viện nên được bỏ qua.`)
  // Hộp thoại bị huỷ thì im lặng; kéo thả mà không có ảnh nào thì báo cho người dùng biết.
  else if (!candidates.length && !fromDialog) toast('Không có file ảnh nào trong những gì bạn vừa thả vào.', 'error')
  if (!candidates.length) return

  const items = candidates.map((candidate) => ({ candidate, key: seq++ }))
  useStore.setState((s) => ({
    imports: [...s.imports, ...items.map(({ candidate, key }) => ({ key, name: candidate.name, status: 'processing' as const, albumId }))],
  }))

  const queue = [...items]
  const work = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const { key } = item
      try {
        const photo = await importOne(item.candidate)
        useStore.setState((s) => ({
          photos: [photo, ...s.photos],
          imports: s.imports.filter((u) => u.key !== key),
          // Album có thể đã bị xoá trong lúc ảnh đang được chuẩn bị.
          ...(albumId && s.albums.some((a) => a.id === albumId) ? { photoAlbum: { ...s.photoAlbum, [photo.id]: albumId } } : {}),
        }))
      } catch (err) {
        useStore.setState((s) => ({
          imports: s.imports.map((u) => (u.key === key ? { ...u, status: 'error', error: (err as Error).message } : u)),
        }))
      }
    }
  }
  // Mỗi worker xử lý một ảnh; nhiều hơn nữa cũng chỉ xếp hàng chờ.
  await Promise.all(Array.from({ length: POOL_SIZE }, work))
}

async function importOne({ token }: ImportCandidate): Promise<Photo> {
  const { preview, thumb, ...size } = await prepareImport(importUrl(token))
  return desktop.library.add({
    token,
    ...size,
    preview: preview && (await preview.arrayBuffer()),
    thumb: await thumb.arrayBuffer(),
    thumbType: thumb.type,
  })
}

/** Lùi/tiến một bước lịch sử. Bỏ qua những bước tham chiếu tới ảnh đã bị xoá khỏi thư viện. */
function step(from: 'past' | 'future', to: 'past' | 'future'): void {
  const s = useStore.getState()
  const alive = new Set(s.photos.map((p) => p.id))
  const stack = [...s[from]]
  let target = stack.pop()
  while (target && !target.selected.every((id) => alive.has(id))) target = stack.pop()
  if (!target) {
    useStore.setState({ [from]: [] } as Partial<State>)
    return
  }
  restoring = true
  useStore.setState({
    ...target,
    [from]: stack,
    [to]: [...s[to], snapshot(s)].slice(-HISTORY_LIMIT),
    activeCell: null,
    activeText: null,
    editingText: null,
  } as Partial<State>)
  restoring = false
}

useStore.subscribe((s, prev) => {
  if (restoring || EDIT_KEYS.every((k) => s[k] === prev[k])) return
  const now = Date.now()
  const continuing = now - lastEdit < COALESCE_MS
  lastEdit = now
  if (continuing && s.past.length) return
  restoring = true
  useStore.setState({ past: [...s.past, snapshot(prev)].slice(-HISTORY_LIMIT), future: [] })
  restoring = false
})

export function canvasSize(s: Pick<State, 'presetId' | 'customW' | 'customH'>): { width: number; height: number } {
  const preset = s.presetId === CUSTOM_PRESET_ID ? undefined : SIZE_PRESETS.find((p) => p.id === s.presetId)
  if (preset) return { width: preset.width, height: preset.height }
  // Ô nhập có thể đang gõ dở (vd "10") nên luôn kẹp về khoảng hợp lệ.
  const fit = (v: number) => Math.min(MAX_CANVAS, Math.max(MIN_CANVAS, Math.round(v) || MIN_CANVAS))
  return { width: fit(s.customW), height: fit(s.customH) }
}

/** Đổi % cạnh ngắn sang px trên khung width×height. */
export const pctToPx = (pct: number, width: number, height: number) => Math.round((Math.min(width, height) * pct) / 100)
