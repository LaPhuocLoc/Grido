import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import type { ImportCandidate, Photo, StageResult } from '../shared/types'
import { desktop } from './lib/desktop'
import { DEFAULT_ADJUST, type CellAdjust } from './lib/geometry'
import { POOL_SIZE, prepareImport } from './lib/imaging/tasks'
import { countCells, parseLayout } from './lib/layout/dsl'
import { getLayouts, MAX_PHOTOS } from './lib/layout/registry'
import type { LayoutNode } from './lib/layout/types'
import { albumName, pruneAlbumMap, type Album } from './lib/albums'
import { copyName, designTitle } from './lib/designs'
import { placeTemplate, type TextTemplate } from './lib/templates'
import { normalizeText, type TextItem } from './lib/text'
import type { TextPatches } from './lib/textGroup'
import {
  CUSTOM_PRESET_ID,
  DEFAULT_PRESET_ID,
  MAX_CANVAS,
  MIN_CANVAS,
  ORIGINAL_PRESET_ID,
  originalCanvas,
  RETIRED_PRESETS,
  SIZE_PRESETS,
} from './lib/presets'

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

export type Tab = 'designs' | 'library' | 'layout' | 'size' | 'style' | 'text' | 'export'

/** Bố cục người dùng tự lưu (giữ cả tỉ lệ ô đã kéo chỉnh). */
export interface SavedLayout {
  id: string
  n: number
  tree: LayoutNode
}
const MAX_SAVED_LAYOUTS = 60
const MAX_RECENT_FONTS = 6
/** Bề rộng mặc định (và nhỏ nhất) của bảng công cụ, cùng mức "rộng" khi bấm đúp vào mép. */
export const PANEL_WIDTH = 380
export const PANEL_WIDTH_WIDE = 640
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
  exportSharpen: ExportSharpen
  theme: Theme
  /** Sidebar trái đang thu gọn, chỉ còn dải biểu tượng. */
  leftCollapsed: boolean
  /** Bề rộng bảng công cụ của sidebar (px), đổi bằng cách kéo mép phải của nó. */
  panelWidth: number
  /** Người dùng đã đóng dải mẹo thao tác ở cuối thư viện. */
  libraryTipSeen: boolean
  /** Cách xem kho font: lưới ảnh mẫu, hoặc danh sách viết câu chữ đang chọn bằng từng font. */
  fontView: 'grid' | 'list'
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
export type Snapshot = Pick<State, (typeof EDIT_KEYS)[number]>

/** Một thiết kế đã lưu: toàn bộ ảnh ghép (ảnh, bố cục, khung, viền, chữ) để mở lại làm tiếp. */
export interface Design {
  id: string
  /** Tên người dùng tự đặt; null = tự lấy theo chữ trên ảnh. */
  name: string | null
  updatedAt: number
  snapshot: Snapshot
}
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
  /** Các thiết kế đã lưu. Thiết kế đang mở được ghi đè liên tục theo từng thay đổi. */
  designs: Design[]
  /** Thiết kế đang nằm trên khung làm việc; null = khung trống, chưa thành thiết kế. */
  currentDesignId: string | null
  /** Id các font được thả tim. */
  favoriteFonts: string[]
  /** Font vừa dùng gần đây, mới nhất đứng đầu. */
  recentFonts: string[]
  /** Font đang xem thử trên một dòng chữ (rê chuột trong bảng font); không ghi vào thiết kế. */
  previewFont: { id: string; font: string } | null
  /** Nhóm chữ đang được kéo / phóng / xoay: giá trị tạm của từng dòng, thả tay mới ghi vào `texts`. Không lưu, không vào lịch sử. */
  liveTexts: TextPatches | null
  /** Các dòng chữ đang được chọn chung (khoanh vùng, Shift + bấm) mà chưa thành nhóm. Không lưu, không vào lịch sử. */
  pickedTexts: string[]
  /**
   * Dòng chữ đang được chỉnh riêng dù nằm trong nhóm: bấm lần nữa vào một dòng của nhóm (vào chế độ gõ) thì từ đó đổi
   * font, màu, kiểu chữ chỉ áp dụng cho dòng ấy, tới khi chọn lại nhóm. Không lưu, không vào lịch sử.
   */
  soloText: string | null
  /** Bảng Chữ đang mở mục nào: các mẫu chữ dựng sẵn, hay kho font của dòng chữ đang chọn. */
  textView: 'templates' | 'font'
  /** Id các khung ảnh được thả tim. */
  favoritePresets: string[]
  albums: Album[]
  /** Id ảnh → id album. Ảnh không có ở đây là "Chưa phân loại". */
  photoAlbum: Record<string, string>
  /** Id các mục đang thu gọn trong thư viện (UNCATEGORIZED cho mục "Chưa phân loại"). */
  collapsedAlbums: string[]

  loadPhotos: () => Promise<void>
  /** Mở hộp thoại chọn ảnh của hệ điều hành. */
  pickPhotos: (albumId?: string) => Promise<void>
  /** Mở hộp thoại chọn cả thư mục ảnh (nền tảng có hỗ trợ). */
  pickFolder: (albumId?: string) => Promise<void>
  /** Nhận file dán vào cửa sổ (mảng file) hoặc vừa được thả vào (DataTransfer của sự kiện drop). */
  importFiles: (files: File[] | DataTransfer, albumId?: string) => Promise<void>
  /** Bản web: xin lại quyền đọc file gốc rồi cập nhật trạng thái từng ảnh. Gọi từ một thao tác bấm. */
  grantAccess: () => Promise<void>
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
  /** Đưa nhiều ảnh vào bố cục một lượt (quét chọn trong thư viện); ảnh đã có sẵn thì bỏ qua. */
  selectMany: (ids: string[]) => void
  clearSelection: () => void
  shuffle: () => void
  swapCells: (a: number, b: number) => void
  setLayout: (id: string) => void
  toggleFavorite: (id: string) => void
  toggleFavoriteFont: (id: string) => void
  /** Ghi nhận một font vừa được chọn để đưa vào mục "Dùng gần đây". */
  noteRecentFont: (id: string) => void
  setPreviewFont: (preview: { id: string; font: string } | null) => void
  toggleFavoritePreset: (id: string) => void
  /** Cất thiết kế đang mở (đã tự lưu) rồi bắt đầu một khung trống. */
  newDesign: () => void
  /** Cất thiết kế đang mở rồi mở thiết kế khác lên khung làm việc. */
  openDesign: (id: string) => void
  /** Đặt tên; để trống thì quay về tên tự đặt theo chữ trên ảnh. */
  renameDesign: (id: string, name: string) => void
  duplicateDesign: (id: string) => void
  /** Xoá thiết kế (không xoá ảnh trong thư viện); thông báo kèm nút Hoàn tác. */
  removeDesign: (id: string) => void
  /** Đưa khung về tỉ lệ và độ phân giải gốc của ảnh đầu tiên trong bản ghép. */
  applyOriginalSize: () => void
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
  /** Sửa nhiều dòng chữ một lượt (thao tác trên cả nhóm) thành một bước undo. */
  updateTexts: (patches: TextPatches) => void
  /** Xoá dòng chữ; dòng thuộc một nhóm (hoặc đang được chọn chung) thì xoá hết, trừ khi `alone`. */
  removeText: (id: string, alone?: boolean) => void
  /** Nhân bản dòng chữ; dòng thuộc một nhóm (hoặc đang được chọn chung) thì nhân bản hết. */
  duplicateText: (id: string) => void
  /** Chèn một mẫu chữ vào giữa khung thành một nhóm mới. */
  insertTemplate: (template: TextTemplate) => void
  /** Tách nhóm: các dòng chữ trở lại độc lập. */
  ungroupTexts: (group: string) => void
  /** Chọn chung nhiều dòng chữ (khoanh vùng); dòng nào thuộc nhóm thì cả nhóm được chọn theo. */
  pickTexts: (ids: string[]) => void
  /** Gộp các dòng chữ thành một nhóm mới. */
  groupTexts: (ids: string[]) => void
  setActiveText: (id: string | null) => void
  setEditingText: (id: string | null) => void
  undo: () => void
  redo: () => void
  set: (patch: Partial<Settings>) => void
  toast: (message: string, kind?: Toast['kind'], action?: Toast['action']) => void
}

let seq = 1
/** Các dòng chữ của mẫu vừa chèn, đúng như lúc chèn; dòng nào bị sửa thì không còn là đối tượng này nữa. */
let lastTemplate: TextItem[] = []

type Persisted = Settings & Snapshot & Pick<State, 'designs' | 'currentDesignId' | 'favorites' | 'favoriteFonts' | 'recentFonts' | 'favoritePresets' | 'savedLayouts' | 'albums' | 'photoAlbum' | 'collapsedAlbums'>

/**
 * Ghi localStorage có trì hoãn: kéo slider hay cuộn zoom đổi state hàng chục lần mỗi giây,
 * ghi đồng bộ từng lần sẽ làm khựng giao diện. Gom lại ghi một lần, và ghi ngay khi đóng cửa sổ.
 */
function lazyStorage(): PersistStorage<Persisted> {
  let pending: { name: string; value: StorageValue<Persisted> } | null = null
  let failed = false
  let timer: number | undefined
  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    if (!pending) return
    try {
      localStorage.setItem(pending.name, JSON.stringify(pending.value))
      failed = false
    } catch {
      // Hết chỗ hoặc bị chặn: app vẫn chạy, chỉ là không lưu được bản nháp. Báo một lần cho tới khi ghi lại được.
      if (!failed) queueMicrotask(() => useStore.getState().toast('Không lưu được thiết kế vào bộ nhớ trình duyệt (đã đầy hoặc bị chặn). Xoá bớt thiết kế cũ nhé.', 'error'))
      failed = true
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

// true trong lúc đổi sang thiết kế khác, để việc nạp nội dung mới không bị coi là một lần chỉnh sửa cần tự lưu.
let switching = false

const hasCollage = (s: Pick<State, 'tree' | 'selected'>) => !!s.tree && s.selected.length > 0

/** Khung trống cho thiết kế mới; viền, màu nền và khung ảnh giữ theo thiết kế vừa làm. */
const BLANK = { selected: [], layoutId: null, tree: null, adjust: {}, texts: [], activeCell: null, activeText: null, editingText: null }

/**
 * Thiết kế còn thứ đáng giữ: có ảnh, hoặc đã bỏ hết ảnh nhưng còn chữ (khung, viền, chữ vẫn nguyên, chỉ chờ chọn ảnh khác).
 * Bỏ hết ảnh không làm mất thiết kế: nó vẫn đang mở cho tới khi người dùng tạo / mở thiết kế khác hoặc tự tay xoá.
 */
const hasContent = (snap: Pick<Snapshot, 'tree' | 'selected' | 'texts'>) => hasCollage(snap) || snap.texts.some((t) => t.text.trim())

/** Thiết kế đáng được liệt kê và giữ lại: còn ảnh, còn chữ, hoặc đã được người dùng tự đặt tên. */
export const isKeeper = (d: Design) => hasContent(d.snapshot) || !!d.name

/**
 * Thiết kế đang mở, theo cách người dùng nhìn thấy. Vừa chọn một ảnh rồi bỏ ngay thì trên khung không còn gì cả:
 * với người dùng đó là khung trống chứ không phải "một thiết kế chưa có ảnh", nên trả về null. (Bên trong thiết kế
 * ấy vẫn được giữ để Hoàn tác đưa nó trở lại đúng chỗ cũ.)
 */
export function currentDesign(s: Pick<State, 'currentDesignId' | 'designs' | 'tree' | 'selected' | 'texts'>): Design | null {
  const design = s.currentDesignId ? s.designs.find((d) => d.id === s.currentDesignId) : undefined
  return design && (hasContent(s) || !!design.name) ? design : null
}

/** Thiết kế trống trơn (không ảnh, không chữ, không tên) thì không còn gì để mở lại → dọn khỏi danh sách khi người dùng rời nó. */
const withoutEmpty = (designs: Design[], keep: string | null) => designs.filter((d) => d.id === keep || isKeeper(d))

/** Bỏ ảnh không còn trong thư viện khỏi một thiết kế đã lưu; số ảnh đổi thì lấy bố cục đầu tiên của số ảnh mới. */
function pruneSnapshot(snap: Snapshot, alive: (id: string) => boolean): Snapshot {
  if (snap.selected.every(alive)) return snap
  const selected = snap.selected.filter(alive)
  const adjust = Object.fromEntries(Object.entries(snap.adjust).filter(([id]) => alive(id)))
  if (!selected.length) return { ...snap, selected, adjust, layoutId: null, tree: null }
  const layoutId = getLayouts(selected.length)[0].id
  return { ...snap, selected, adjust, layoutId, tree: parseLayout(layoutId) }
}

const pruneDesigns = (s: State, alive: (id: string) => boolean) =>
  withoutEmpty(
    s.designs.map((d) => {
      const next = pruneSnapshot(d.snapshot, alive)
      return next === d.snapshot ? d : { ...d, snapshot: next }
    }),
    s.currentDesignId,
  )

/** Bỏ những ảnh không còn trong thư viện khỏi bản ghép (kèm tinh chỉnh của chúng). Không có gì để bỏ thì không đổi state. */
function withoutMissing(state: State, alive: (id: string) => boolean): Partial<State> {
  if (state.selected.every(alive) && Object.keys(state.adjust).every(alive)) return {}
  return {
    ...withSelection(state, state.selected.filter(alive)),
    adjust: Object.fromEntries(Object.entries(state.adjust).filter(([id]) => alive(id))),
  }
}

/** Khung "Ảnh gốc" theo một ảnh trong thư viện; ảnh mất file gốc thì theo bản xem trước. */
export const originalCanvasOf = (photo: Photo) =>
  photo.missing ? originalCanvas(photo.width, photo.height) : originalCanvas(photo.sourceWidth, photo.sourceHeight)

function originalSize(state: State, photoId: string | undefined): Partial<Settings> {
  const photo = state.photos.find((p) => p.id === photoId)
  if (!photo) return {}
  const { width, height } = originalCanvasOf(photo)
  return { presetId: ORIGINAL_PRESET_ID, customW: width, customH: height }
}

const toggled = (list: string[], id: string) => (list.includes(id) ? list.filter((f) => f !== id) : [id, ...list])

/** Khi số ảnh đổi thì bố cục cũ không còn hợp lệ → chọn bố cục đầu tiên của số ảnh mới. */
function withSelection(state: State, selected: string[]): Partial<State> {
  if (selected.length === 0) return { selected, layoutId: null, tree: null, activeCell: null }
  if (selected.length === state.selected.length && state.tree) return { selected, activeCell: null }
  const layoutId = getLayouts(selected.length)[0].id
  // Bản ghép mới bắt đầu bằng khung đúng tỉ lệ / độ phân giải gốc của ảnh đầu tiên.
  const size = state.selected.length === 0 ? originalSize(state, selected[0]) : {}
  return { selected, layoutId, tree: parseLayout(layoutId), activeCell: null, ...size }
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      presetId: DEFAULT_PRESET_ID,
      customW: 1080,
      customH: 1350,
      margin: 2,
      gap: 1.2,
      radius: 0,
      bg: '#ffffff',
      exportFormat: 'image/jpeg',
      exportQuality: 0.95,
      exportSharpen: 'standard',
      theme: 'system',
      leftCollapsed: false,
      panelWidth: PANEL_WIDTH,
      libraryTipSeen: false,
      fontView: 'list',

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
      designs: [],
      currentDesignId: null,
      favoriteFonts: [],
      recentFonts: [],
      previewFont: null,
      liveTexts: null,
      pickedTexts: [],
      soloText: null,
      textView: 'templates',
      favoritePresets: [],
      albums: [],
      photoAlbum: {},
      collapsedAlbums: [],

      loadPhotos: async () => {
        try {
          const photos = await desktop.library.list()
          const alive = new Set(photos.map((p) => p.id))
          set((s) => ({
            photos,
            photoAlbum: pruneAlbumMap(s.photoAlbum, (id) => alive.has(id)),
            designs: pruneDesigns(s, (id) => alive.has(id)),
            ...withoutMissing(s, (id) => alive.has(id)),
          }))
          // Bản nháp từ phiên bản chưa có mục Thiết kế: đưa nó vào danh sách ngay lần mở đầu tiên.
          saveDesign(get())
          // Đối chiếu bản nháp với thư viện không phải thao tác của user → không tính vào lịch sử undo.
          set({ past: [], future: [] })
          void refreshStale()
        } catch (err) {
          get().toast((err as Error).message, 'error')
        }
      },

      pickPhotos: async (albumId) => {
        try {
          await importStaged(await desktop.library.pick(), true, albumId)
        } catch (err) {
          get().toast((err as Error).message, 'error')
        }
      },

      pickFolder: async (albumId) => {
        try {
          const staged = await desktop.library.pickFolder?.()
          if (staged) await importStaged(staged, true, albumId)
        } catch (err) {
          get().toast((err as Error).message, 'error')
        }
      },

      importFiles: async (files, albumId) => {
        let staged: StageResult
        try {
          // Không được có `await` nào trước lời gọi này: nội dung vừa thả chỉ đọc được ngay trong sự kiện drop.
          staged = await (Array.isArray(files) ? desktop.library.stageFiles(files) : desktop.library.stageDrop(files))
        } catch (err) {
          return get().toast((err as Error).message, 'error')
        }
        await importStaged(staged, false, albumId)
      },

      grantAccess: async () => {
        try {
          await desktop.library.grantAccess?.()
          const photos = await desktop.library.list()
          set({ photos })
          void refreshStale()
          const locked = photos.filter((p) => p.locked).length
          if (locked) get().toast(`Còn ${locked} ảnh chưa được cấp quyền đọc file gốc. Bấm "Cho phép" lần nữa để cấp tiếp.`)
          else get().toast('Đã đọc được file gốc của mọi ảnh.', 'success')
        } catch (err) {
          get().toast((err as Error).message, 'error')
        }
      },

      dismissImport: (key) => set((s) => ({ imports: s.imports.filter((u) => u.key !== key) })),

      deletePhotos: async (ids) => {
        try {
          const deleted = new Set(await desktop.library.remove(ids))
          set((s) => ({
            photos: s.photos.filter((p) => !deleted.has(p.id)),
            photoAlbum: pruneAlbumMap(s.photoAlbum, (id) => !deleted.has(id)),
            designs: pruneDesigns(s, (id) => !deleted.has(id)),
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

      selectMany: (ids) => {
        const s = get()
        const fresh = ids.filter((id) => !s.selected.includes(id))
        if (!fresh.length) return
        const room = MAX_PHOTOS - s.selected.length
        if (room > 0) set(withSelection(s, [...s.selected, ...fresh.slice(0, room)]))
        if (fresh.length > room)
          s.toast(room > 0 ? `Chỉ thêm được ${room} ảnh: một ảnh ghép chứa tối đa ${MAX_PHOTOS} ảnh.` : `Một ảnh ghép chứa tối đa ${MAX_PHOTOS} ảnh.`)
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

      toggleFavorite: (id) => set((s) => ({ favorites: toggled(s.favorites, id) })),
      toggleFavoriteFont: (id) => set((s) => ({ favoriteFonts: toggled(s.favoriteFonts, id) })),
      // Font đã có trong danh sách thì giữ nguyên chỗ, để các ô không nhảy lung tung dưới con trỏ.
      noteRecentFont: (id) => set((s) => (s.recentFonts.includes(id) ? {} : { recentFonts: [id, ...s.recentFonts].slice(0, MAX_RECENT_FONTS) })),
      setPreviewFont: (previewFont) => set({ previewFont }),
      toggleFavoritePreset: (id) => set((s) => ({ favoritePresets: toggled(s.favoritePresets, id) })),

      newDesign: () => {
        const s = get()
        // Khung đang trống sẵn thì chỉ cần đưa người dùng tới chỗ chọn ảnh (và nói rõ, kẻo bấm mà tưởng không có gì xảy ra).
        const put = currentDesign(s)
        if (!put) {
          // Có thể còn sót một thiết kế trống trơn bên dưới (vừa chọn ảnh rồi bỏ): dọn luôn.
          if (s.currentDesignId) load({ ...BLANK, currentDesignId: null, designs: withoutEmpty(s.designs, null) })
          set({ tab: 'library', leftCollapsed: false })
          return s.toast('Khung đang trống sẵn. Chọn ảnh trong thư viện để bắt đầu thiết kế mới.')
        }
        const designs = withoutEmpty(s.designs, null)
        load({ ...BLANK, currentDesignId: null, designs, tab: 'library', leftCollapsed: false })
        // Nói rõ thiết kế vừa rời khỏi khung đã đi đâu, kèm đường quay lại.
        if (put && designs.includes(put))
          s.toast(`Đã cất “${designTitle(put.name, put.snapshot.texts)}” vào mục Thiết kế. Chọn ảnh để bắt đầu thiết kế mới.`, 'success', {
            label: 'Mở lại',
            run: () => get().openDesign(put.id),
          })
      },

      openDesign: (id) => {
        const s = get()
        const design = s.designs.find((d) => d.id === id)
        if (!design || id === s.currentDesignId) return
        load({ ...BLANK, ...structuredClone(design.snapshot), currentDesignId: id, designs: withoutEmpty(s.designs, id) })
      },

      renameDesign: (id, name) =>
        set((s) => ({ designs: s.designs.map((d) => (d.id === id ? { ...d, name: name.trim().slice(0, 60) || null } : d)) })),

      duplicateDesign: (id) =>
        set((s) => {
          const source = s.designs.find((d) => d.id === id)
          if (!source) return {}
          const titles = s.designs.map((d) => designTitle(d.name, d.snapshot.texts))
          const copy: Design = {
            id: designId(),
            name: copyName(designTitle(source.name, source.snapshot.texts), titles),
            updatedAt: Date.now(),
            snapshot: structuredClone(source.snapshot),
          }
          return { designs: [copy, ...s.designs] }
        }),

      removeDesign: (id) => {
        const s = get()
        const design = s.designs.find((d) => d.id === id)
        if (!design) return
        const designs = s.designs.filter((d) => d.id !== id)
        if (id === s.currentDesignId) load({ ...BLANK, currentDesignId: null, designs })
        else set({ designs })
        s.toast(`Đã xoá thiết kế "${designTitle(design.name, design.snapshot.texts)}".`, 'info', {
          label: 'Hoàn tác',
          run: () => set((now) => (now.designs.some((d) => d.id === id) ? {} : { designs: [design, ...now.designs] })),
        })
      },

      applyOriginalSize: () => set((s) => originalSize(s, s.selected[0])),

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

      setActiveCell: (activeCell) => set(activeCell === null ? { activeCell } : { activeCell, activeText: null, pickedTexts: [], soloText: null, editingText: null }),

      removeActiveCell: () => {
        const s = get()
        const id = s.activeCell === null ? undefined : s.selected[s.activeCell]
        if (id) s.toggleSelect(id)
      },

      addText: () => {
        set({ pickedTexts: [], soloText: null })
        const id = `t${Date.now().toString(36)}${seq++}`
        const item = normalizeText({ id, text: 'Chữ của bạn' })
        // Vào luôn chế độ gõ để người dùng thay chữ mẫu ngay trên ảnh.
        set((s) => ({ texts: [...s.texts, item], activeText: id, editingText: id, activeCell: null, tab: 'text', textView: 'font' }))
      },

      updateText: (id, patch) => set((s) => ({ texts: s.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

      updateTexts: (patches) => set((s) => ({ texts: s.texts.map((t) => (patches[t.id] ? { ...t, ...patches[t.id] } : t)) })),

      removeText: (id, alone = false) =>
        set((s) => {
          const gone = new Set(alone ? [id] : selectionOf(s, id))
          return {
            pickedTexts: [],
            soloText: null,
            texts: s.texts.filter((t) => !gone.has(t.id)),
            activeText: s.activeText && gone.has(s.activeText) ? null : s.activeText,
            editingText: s.editingText && gone.has(s.editingText) ? null : s.editingText,
          }
        }),

      duplicateText: (id) => {
        const source = get().texts.find((t) => t.id === id)
        if (!source) return
        const ids = selectionOf(get(), id)
        const members = get().texts.filter((t) => ids.includes(t.id))
        // Mỗi nhóm cũ thành một nhóm mới, để bản sao không dính vào bản gốc.
        const groups = new Map<string, string>()
        for (const t of members) if (t.group && !groups.has(t.group)) groups.set(t.group, `g${Date.now().toString(36)}${seq++}`)
        // Lệch nhẹ để thấy bản sao; sát mép thì lệch ngược lại cho khỏi ra ngoài khung.
        const dx = source.x > 0.9 ? -0.04 : 0.04
        const dy = source.y > 0.9 ? -0.04 : 0.04
        const copies = members.map((t): TextItem => ({ ...t, id: `t${Date.now().toString(36)}${seq++}`, group: t.group && groups.get(t.group)!, x: t.x + dx, y: t.y + dy }))
        const active = copies[members.indexOf(source)].id
        const picked = get().pickedTexts.includes(id) ? copies.map((t) => t.id) : []
        set((s) => ({ texts: [...s.texts, ...copies], activeText: active, pickedTexts: picked, soloText: null, editingText: null, activeCell: null, tab: 'text' }))
      },

      insertTemplate: (template) => {
        const { width, height } = canvasSize(get())
        const placed = placeTemplate(template, width, height)
        if (!placed.length) return
        const group = placed.length > 1 ? `g${Date.now().toString(36)}${seq++}` : null
        const items = placed.map((t): TextItem => ({ ...t, id: `t${Date.now().toString(36)}${seq++}`, group }))
        // Đang lướt thử các mẫu: mẫu vừa chèn mà chưa đụng tới (vẫn đang được chọn) thì thay bằng mẫu mới, khỏi chồng lên nhau.
        const previous = lastTemplate
        const untouched = previous.length > 0 && previous.every((t) => get().texts.includes(t)) && previous.some((t) => t.id === get().activeText)
        lastTemplate = items
        set((s) => ({
          texts: [...(untouched ? s.texts.filter((t) => !previous.includes(t)) : s.texts), ...items],
          activeText: items[0].id,
          pickedTexts: [],
          soloText: null,
          editingText: null,
          activeCell: null,
          tab: 'text',
        }))
      },

      ungroupTexts: (group) => set((s) => ({ texts: s.texts.map((t) => (t.group === group ? { ...t, group: null } : t)) })),

      pickTexts: (ids) => {
        const s = get()
        const all = [...new Set(ids.flatMap((id) => selectionOf({ texts: s.texts, pickedTexts: [] }, id)))]
        const groups = new Set(s.texts.filter((t) => all.includes(t.id)).map((t) => t.group ?? t.id))
        // Chỉ một dòng (hoặc đúng một nhóm): chọn như bấm vào nó.
        if (groups.size < 2) {
          set({ pickedTexts: [] })
          return s.setActiveText(all[0] ?? null)
        }
        set({ pickedTexts: all, activeText: all[0], soloText: null, editingText: null, activeCell: null, tab: 'text' })
      },

      groupTexts: (ids) => {
        if (ids.length < 2) return
        const group = `g${Date.now().toString(36)}${seq++}`
        set((s) => ({ texts: s.texts.map((t) => (ids.includes(t.id) ? { ...t, group } : t)), pickedTexts: [] }))
      },

      setActiveText: (activeText) =>
        set((s) => {
          const pickedTexts = activeText !== null && s.pickedTexts.includes(activeText) ? s.pickedTexts : []
          const base = { activeText, pickedTexts, soloText: null, editingText: null }
          return activeText === null ? base : { ...base, activeCell: null, tab: 'text' }
        }),

      setEditingText: (editingText) =>
        set(editingText === null ? { editingText } : { editingText, soloText: editingText, activeText: editingText, activeCell: null, tab: 'text' }),

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
      // Số hiệu cấu trúc dữ liệu lưu. Đổi cấu trúc theo cách `merge` bên dưới không tự xử lý được thì tăng số này và
      // chuyển dữ liệu cũ trong `migrate`. Hiện mọi bản cũ (kể cả bản chưa có số hiệu) đều đọc được nguyên trạng.
      version: 2,
      // Bản 2: bảng phông chữ mặc định xem dạng danh sách; ai đang để lưới ảnh mẫu từ bản cũ cũng chuyển sang một lần.
      migrate: (saved, version) => (version < 2 ? { ...(saved as Persisted), fontView: 'list' } : (saved as Persisted)),
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
        exportSharpen: s.exportSharpen,
        theme: s.theme,
        leftCollapsed: s.leftCollapsed,
        panelWidth: s.panelWidth,
        recentFonts: s.recentFonts,
        libraryTipSeen: s.libraryTipSeen,
        fontView: s.fontView,
        designs: s.designs,
        currentDesignId: s.currentDesignId,
        favorites: s.favorites,
        favoriteFonts: s.favoriteFonts,
        favoritePresets: s.favoritePresets,
        savedLayouts: s.savedLayouts,
        albums: s.albums,
        photoAlbum: s.photoAlbum,
        collapsedAlbums: s.collapsedAlbums,
      }),
      merge: (saved, current) => {
        const persisted = (saved ?? {}) as Partial<Persisted>
        const retired = RETIRED_PRESETS[persisted.presetId ?? '']
        return {
          ...current,
          ...persisted,
          ...(retired && { presetId: CUSTOM_PRESET_ID, customW: retired.width, customH: retired.height }),
          texts: (persisted.texts ?? []).map(normalizeText),
          designs: (persisted.designs ?? []).map((d) => ({ ...d, snapshot: { ...d.snapshot, texts: d.snapshot.texts.map(normalizeText) } })),
        }
      },
    },
  ),
)

const designId = () => `d${Date.now().toString(36)}${seq++}`

/** Nạp một thiết kế khác (hoặc khung trống) lên khung làm việc: không tính là chỉnh sửa, và lịch sử undo bắt đầu lại. */
function load(next: Partial<State>): void {
  switching = restoring = true
  useStore.setState({ ...next, past: [], future: [] })
  switching = restoring = false
}

/** Ghi trạng thái khung làm việc vào thiết kế đang mở; khung có ảnh mà chưa thuộc thiết kế nào thì tạo thiết kế mới. */
function saveDesign(s: State): void {
  if (!s.currentDesignId && !hasCollage(s)) return
  const id = s.currentDesignId ?? designId()
  const existing = s.designs.find((d) => d.id === id)
  const saved: Design = { id, name: existing?.name ?? null, updatedAt: Date.now(), snapshot: snapshot(s) }
  useStore.setState({ currentDesignId: id, designs: existing ? s.designs.map((d) => (d.id === id ? saved : d)) : [saved, ...s.designs] })
}

// Tự lưu: mọi thay đổi trên khung làm việc (kể cả undo / redo) đều được ghi ngay vào thiết kế đang mở.
useStore.subscribe((s, prev) => {
  if (switching || EDIT_KEYS.every((k) => s[k] === prev[k])) return
  saveDesign(s)
})

/** Nhập nhiều hơn chừng này ảnh một lượt thì ảnh xong được đưa vào thư viện theo đợt, mỗi đợt cách nhau IMPORT_BATCH_MS. */
const IMPORT_BATCH_FROM = 12
const IMPORT_BATCH_MS = 250

/** Tạo bản xem trước + thumbnail cho từng file đã được main process nhận rồi đưa vào thư viện. */
/** `albumId`: album nhận ảnh mới; bỏ trống thì ảnh nằm ở "Chưa phân loại". */
async function importStaged({ candidates, duplicates, relinked = 0 }: StageResult, fromDialog: boolean, albumId?: string): Promise<void> {
  const { toast } = useStore.getState()
  if (relinked) {
    // Ảnh đang mất file gốc vừa tìm lại được file: cập nhật trạng thái rồi dựng lại bản xem trước nếu cần.
    useStore.setState({ photos: await desktop.library.list() })
    void refreshStale()
    toast(`Đã nối lại ${relinked} ảnh với file gốc.`, 'success')
  }
  if (duplicates) toast(`${duplicates} ảnh đã có sẵn trong thư viện nên được bỏ qua.`)
  // Hộp thoại bị huỷ thì im lặng; kéo thả mà không có ảnh nào thì báo cho người dùng biết.
  else if (!candidates.length && !relinked && !fromDialog) toast('Không có file ảnh nào trong những gì bạn vừa thả vào.', 'error')
  if (!candidates.length) return

  const items = candidates.map((candidate) => ({ candidate, key: seq++ }))
  useStore.setState((s) => ({
    imports: [...s.imports, ...items.map(({ candidate, key }) => ({ key, name: candidate.name, status: 'processing' as const, albumId }))],
  }))

  // Ảnh xong được đưa vào thư viện theo từng đợt ngắn chứ không từng ảnh một: mỗi lần thêm ảnh vào đầu danh sách là
  // cả lưới phải vẽ lại, nên nhập cả nghìn ảnh mà ghi từng ảnh thì càng về sau càng chậm.
  let ready: { photo: Photo; key: number }[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    if (!ready.length) return
    const batch = ready
    ready = []
    const keys = new Set(batch.map((b) => b.key))
    useStore.setState((s) => {
      // Album có thể đã bị xoá trong lúc ảnh đang được chuẩn bị.
      const album = albumId && s.albums.some((a) => a.id === albumId) ? albumId : null
      return {
        // Ảnh xong sau đứng trước, như khi thêm từng ảnh một.
        photos: [...batch.map((b) => b.photo).reverse(), ...s.photos],
        imports: s.imports.filter((u) => !keys.has(u.key)),
        ...(album ? { photoAlbum: { ...s.photoAlbum, ...Object.fromEntries(batch.map((b) => [b.photo.id, album])) } } : {}),
      }
    })
  }

  const queue = [...items]
  const work = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const { key } = item
      try {
        // Phải chờ xong rồi mới đụng tới `ready`: trong lúc chờ, mảng này có thể đã được ghi vào thư viện và thay bằng mảng mới.
        const photo = await importOne(item.candidate)
        ready.push({ photo, key })
        // Vài ảnh thì hiện ngay; nhập hàng loạt thì gom lại.
        if (items.length <= IMPORT_BATCH_FROM) flush()
        else timer ??= setTimeout(flush, IMPORT_BATCH_MS)
      } catch (err) {
        useStore.setState((s) => ({
          imports: s.imports.map((u) => (u.key === key ? { ...u, status: 'error', error: (err as Error).message } : u)),
        }))
      }
    }
  }
  // Mỗi worker xử lý một ảnh; nhiều hơn nữa cũng chỉ xếp hàng chờ.
  await Promise.all(Array.from({ length: POOL_SIZE }, work))
  flush()
}

async function importOne({ token }: ImportCandidate): Promise<Photo> {
  const { preview, thumb, ...size } = await prepareImport(await desktop.images.importSource(token))
  return desktop.library.add({
    token,
    ...size,
    preview: preview && (await preview.arrayBuffer()),
    thumb: await thumb.arrayBuffer(),
    thumbType: thumb.type,
  })
}

let refreshing = false
/**
 * Bản web: ảnh có file gốc đã bị sửa sau khi nhập (hoặc vừa được nối lại từ file sao lưu) thì dựng lại bản xem trước +
 * thumbnail ở nền, từng ảnh một. Lỗi ở ảnh nào thì bỏ qua ảnh đó, lần mở sau thử lại.
 */
async function refreshStale(): Promise<void> {
  const { refresh } = desktop.library
  if (!refresh || refreshing) return
  refreshing = true
  try {
    for (const photo of useStore.getState().photos.filter((p) => p.stale)) {
      try {
        const [source] = await desktop.images.cellSources(photo)
        if (!source) continue
        const { preview, thumb, ...size } = await prepareImport(source)
        const next = await refresh(photo.id, { ...size, preview: preview && (await preview.arrayBuffer()), thumb: await thumb.arrayBuffer(), thumbType: thumb.type })
        useStore.setState((s) => ({ photos: s.photos.map((p) => (p.id === next.id ? next : p)) }))
      } catch {
        // bỏ qua ảnh này
      }
    }
  } finally {
    refreshing = false
  }
}

/** Phần state được lưu lại giữa các phiên: thiết kế, album, bố cục đã lưu, cài đặt. Dùng cho file sao lưu. */
// Không còn dòng chữ nào đang chọn (bỏ chọn, undo, mở thiết kế khác…): quên luôn các dòng chọn chung và dòng chỉnh riêng,
// kẻo lần sau bấm lại một dòng thì cả cụm cũ tự được chọn theo.
useStore.subscribe((s) => {
  if (s.activeText === null && (s.pickedTexts.length || s.soloText !== null)) useStore.setState({ pickedTexts: [], soloText: null })
})

/**
 * Những dòng chữ đi cùng dòng `id` khi thao tác (kéo, phóng, xoá, đổi kiểu…): các dòng đang được chọn chung nếu `id` nằm
 * trong đó, không thì cả nhóm của nó, không thì chỉ mình nó.
 */
export function selectionOf(s: { texts: TextItem[]; pickedTexts: string[] }, id: string): string[] {
  const here = (list: string[]) => list.filter((other) => s.texts.some((t) => t.id === other))
  if (s.pickedTexts.includes(id)) {
    const picked = here(s.pickedTexts)
    if (picked.length > 1) return picked
  }
  const group = s.texts.find((t) => t.id === id)?.group
  return group ? s.texts.filter((t) => t.group === group).map((t) => t.id) : here([id])
}

/** Những dòng chữ nhận thay đổi font, màu, kiểu chữ khi chỉnh dòng `id`: như `selectionOf`, trừ khi dòng đó đang được chỉnh riêng. */
export function styleTargets(s: { texts: TextItem[]; pickedTexts: string[]; soloText: string | null }, id: string): string[] {
  return s.soloText === id ? [id] : selectionOf(s, id)
}

export const savedState = (): unknown => useStore.persist.getOptions().partialize?.(useStore.getState())

/** Nạp lại state từ file sao lưu (thay cho thiết kế, album và cài đặt hiện tại) rồi đối chiếu với thư viện. */
export async function restoreState(saved: unknown): Promise<void> {
  const merge = useStore.persist.getOptions().merge
  if (merge) load({ ...merge(saved, useStore.getState()), activeCell: null, activeText: null, editingText: null })
  await useStore.getState().loadPhotos()
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
