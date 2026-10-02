import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crop,
  DatabaseBackup,
  Download,
  FolderCog,
  FolderHeart,
  ImagePlus,
  Images,
  ImageOff,
  Info,
  LayoutGrid,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCw,
  Settings,
  SlidersHorizontal,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { UpdateState } from '../shared/types'
import { AboutDialog } from './components/AboutDialog'
import { DataDialog } from './components/DataDialog'
import { DesignsPanel } from './components/Designs'
import { Library } from './components/Library'
import { designTitle } from './lib/designs'
import { toggleGroup, toggleStyle } from './components/TextLayer'
import { ExportPanel, LayoutPanel, SizePanel, StylePanel, TextPanel } from './components/Panels'
import { Stage } from './components/Stage'
import { Button, cx, IconButton, Logo, ThemeToggle, Toasts, Tooltip } from './components/ui'
import { desktop } from './lib/desktop'
import { exportToFile, useExportProgress } from './lib/useCollage'
import { currentDesign, PANEL_WIDTH, PANEL_WIDTH_WIDE, useStore, type Tab } from './store'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'designs', label: 'Thiết kế', icon: FolderHeart },
  { id: 'library', label: 'Ảnh', icon: Images },
  { id: 'layout', label: 'Bố cục', icon: LayoutGrid },
  { id: 'size', label: 'Khung', icon: Crop },
  { id: 'style', label: 'Viền', icon: SlidersHorizontal },
  { id: 'text', label: 'Chữ', icon: Type },
  { id: 'export', label: 'Xuất', icon: Download },
]

/** Bề rộng dải biểu tượng của sidebar trái (px). */
const RAIL_WIDTH = 64

const desktopQuery = window.matchMedia('(min-width: 1024px)')
const useIsDesktop = () =>
  useSyncExternalStore(
    (notify) => {
      desktopQuery.addEventListener('change', notify)
      return () => desktopQuery.removeEventListener('change', notify)
    },
    () => desktopQuery.matches,
  )

export default function App() {
  return (
    <>
      <Editor />
      <DropOverlay />
      <Toasts />
      <Tooltip />
    </>
  )
}

const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')

/** Kéo file từ ngoài vào bất kỳ đâu trong cửa sổ đều thêm được vào thư viện. */
function DropOverlay() {
  const [over, setOver] = useState(false)
  useEffect(() => {
    // dragenter / dragleave bắn cho từng phần tử con nên phải đếm mới biết con trỏ đã thật sự rời cửa sổ.
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setOver(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setOver(false)
    }
    const allow = (e: DragEvent) => {
      // Không chặn thì cửa sổ sẽ mở luôn file vừa thả.
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = hasFiles(e) ? 'copy' : 'none'
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setOver(false)
      // Đưa nguyên DataTransfer: bản web lấy file handle từ đó để dùng file tại chỗ, và phải lấy ngay trong sự kiện này.
      if (e.dataTransfer?.files.length) void useStore.getState().importFiles(e.dataTransfer)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', allow)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', allow)
      window.removeEventListener('drop', drop)
    }
  }, [])

  if (!over) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] grid animate-overlay place-items-center bg-paper/70 p-6 backdrop-blur-md">
      <div className="drop-frame grid w-full max-w-lg animate-pop place-items-center gap-3 rounded-[28px] bg-card px-8 py-12 text-center shadow-lift">
        <span className="grid size-16 animate-bob place-items-center rounded-full gradient-brand glow-brand">
          <ImagePlus className="size-7" />
        </span>
        <p className="font-display text-xl font-bold">Thả ảnh vào đây</p>
        <p className="text-sm text-soft">Ảnh hoặc cả thư mục đều được. File gốc vẫn nằm nguyên chỗ cũ trên máy bạn.</p>
      </div>
    </div>
  )
}

function Editor() {
  const isDesktop = useIsDesktop()
  const tab = useStore((s) => s.tab)
  const setTab = (tab: Tab) => useStore.setState({ tab })
  const loadPhotos = useStore((s) => s.loadPhotos)
  const collapsed = useStore((s) => s.leftCollapsed)
  const panelWidth = useStore((s) => s.panelWidth)
  const [resizing, setResizing] = useState(false)
  // Bảng không hẹp hơn mặc định và không chiếm quá nửa cửa sổ, để khung ảnh luôn còn đủ chỗ.
  const panelCss = `clamp(${PANEL_WIDTH}px, ${panelWidth}px, 50vw)`
  const setSettings = useStore((s) => s.set)
  useEffect(() => void loadPhotos(), [loadPhotos])

  useEffect(() => {
    const typing = (e: Event) => e.target instanceof HTMLElement && !!e.target.closest('input, textarea, select, [contenteditable]')
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z' && !typing(e)) {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (mod && key === 'y' && !typing(e)) {
        e.preventDefault()
        s.redo()
      } else if (mod && key === 'o') {
        e.preventDefault()
        void s.pickPhotos()
      } else if (mod && (key === 'e' || key === 's')) {
        e.preventDefault()
        void exportToFile()
      } else if (mod && (key === 'b' || key === 'i' || key === 'u') && !typing(e) && s.activeText) {
        e.preventDefault()
        toggleStyle(s.activeText, key)
      } else if (mod && key === 'g' && !typing(e) && s.activeText) {
        e.preventDefault()
        toggleGroup(s.activeText, e.shiftKey ? 'ungroup' : 'group')
      } else if (mod && key === 'd' && !typing(e) && s.activeText) {
        e.preventDefault()
        s.duplicateText(s.activeText)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing(e) && s.activeText) {
        s.removeText(s.activeText)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing(e) && s.activeCell !== null) {
        // Chỉ bỏ ảnh khỏi bố cục; ảnh vẫn còn trong thư viện.
        s.removeActiveCell()
      } else if (e.key === 'Escape') {
        s.setActiveCell(null)
        s.setActiveText(null)
      }
    }
    // Dán ảnh từ clipboard (ảnh chụp màn hình, ảnh copy từ app khác) thẳng vào thư viện.
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (!files.length || typing(e)) return
      e.preventDefault()
      void useStore.getState().importFiles(files)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [])

  const panel =
    tab === 'library' ? (
      <Library />
    ) : (
      <div key={tab} className="animate-fade p-4">
        {tab === 'designs' && <DesignsPanel />}
        {tab === 'size' && <SizePanel />}
        {tab === 'layout' && <LayoutPanel />}
        {tab === 'style' && <StylePanel />}
        {tab === 'text' && <TextPanel />}
        {tab === 'export' && <ExportPanel />}
      </div>
    )

  // Bấm mục đang mở thì thu gọn sidebar (chỉ còn dải biểu tượng); bấm mục khác thì mở ra ở mục đó.
  const openTab = (id: Tab) => {
    if (id === tab && !collapsed) return setSettings({ leftCollapsed: true })
    setTab(id)
    if (collapsed) setSettings({ leftCollapsed: false })
  }

  return (
    <div className="flex h-dvh animate-app flex-col">
      <TitleBar />
      {isDesktop ? (
        <div
          // Đang kéo mép để đổi bề rộng thì bảng phải bám tay ngay, không trượt theo hiệu ứng.
          className={cx('grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]', !resizing && 'transition-[grid-template-columns] duration-300 ease-glide')}
          style={{ gridTemplateColumns: `${RAIL_WIDTH}px ${collapsed ? '0px' : panelCss} minmax(0, 1fr)` }}
        >
          <Rail active={collapsed ? null : tab} onSelect={openTab} />
          {/* Nội dung giữ nguyên bề rộng, cột bao ngoài co lại và cắt bớt → panel trượt vào thay vì bị bóp méo. */}
          <aside inert={collapsed} className={cx('min-h-0 overflow-hidden bg-paper', !collapsed && 'border-r border-line')}>
            <div className="ml-auto flex h-full flex-col" style={{ width: `calc(${panelCss} - 1px)` }}>
              {tab === 'library' ? panel : <div className="scroll-soft min-h-0 flex-1 overflow-y-auto">{panel}</div>}
            </div>
          </aside>
          <main className="relative min-h-0">
            <Stage />
            {!collapsed && <PanelResizer width={panelWidth} onResize={(w) => setSettings({ panelWidth: w })} onActive={setResizing} />}
            <PanelToggle collapsed={collapsed} onToggle={() => setSettings({ leftCollapsed: !collapsed })} />
          </main>
        </div>
      ) : (
        <>
          <main className="h-[44dvh] shrink-0">
            <Stage />
          </main>
          <div className="scroll-soft min-h-0 flex-1 overflow-y-auto border-t border-line bg-paper">{panel}</div>
          <TabBar active={tab} onSelect={setTab} />
        </>
      )}
    </div>
  )
}

/** Dải biểu tượng luôn hiện ở mép trái: chọn mục nào thì bảng bên cạnh mở ra mục đó. */
function Rail({ active, onSelect }: { active: Tab | null; onSelect: (tab: Tab) => void }) {
  return (
    <nav aria-label="Công cụ" className="scroll-soft flex min-h-0 flex-col gap-1 overflow-y-auto border-r border-line bg-card px-1 py-2.5">
      {/* Luôn ở đầu dải: bắt đầu thiết kế mới từ bất kỳ mục nào, không phải quay về mục Thiết kế. */}
      <button
        type="button"
        aria-label="Tạo thiết kế mới"
        data-tip="Tạo thiết kế mới. Thiết kế đang mở đã được lưu, mở lại ở mục Thiết kế"
        onClick={() => useStore.getState().newDesign()}
        className="group mb-1 flex w-full shrink-0 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold text-soft transition-colors hover:text-ink focus-visible:-outline-offset-2"
      >
        <span className="grid size-9 place-items-center rounded-full bg-coral text-white shadow-sm transition-transform duration-200 ease-glide group-hover:scale-110 group-active:scale-95">
          <Plus className="size-5" />
        </span>
        Tạo
      </button>
      {TABS.map(({ id, label, icon: Icon }) => {
        const current = active === id
        return (
          <button
            key={id}
            type="button"
            aria-pressed={current}
            aria-expanded={current}
            onClick={() => onSelect(id)}
            className={cx(
              'group flex w-full shrink-0 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition-colors focus-visible:-outline-offset-2',
              current ? 'text-coral-dark' : 'text-soft hover:text-ink',
            )}
          >
            <span className={cx('grid h-8 w-11 place-items-center rounded-xl transition-colors duration-200', current ? 'bg-blush' : 'group-hover:bg-sand')}>
              <Icon className={cx('size-5 transition-transform duration-300 ease-glide', current && 'scale-110')} />
            </span>
            {label}
          </button>
        )
      })}
    </nav>
  )
}

/**
 * Mép phải của bảng công cụ: kéo để đổi bề rộng (xem được nhiều font / ảnh / thiết kế cùng lúc hơn mà không che khung ảnh),
 * bấm đúp để nhảy giữa bề rộng thường và rộng.
 */
function PanelResizer({ width, onResize, onActive }: { width: number; onResize: (width: number) => void; onActive: (active: boolean) => void }) {
  const drag = useRef(false)
  const limit = (w: number) => Math.round(Math.min(Math.max(w, PANEL_WIDTH), window.innerWidth / 2))
  const end = () => {
    drag.current = false
    onActive(false)
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Kéo để đổi bề rộng bảng công cụ"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = true
        onActive(true)
      }}
      onPointerMove={(e) => drag.current && onResize(limit(e.clientX - RAIL_WIDTH))}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onResize(limit(width) > PANEL_WIDTH + 40 ? PANEL_WIDTH : limit(PANEL_WIDTH_WIDE))}
      className="group absolute inset-y-0 -left-1 z-40 w-2.5 cursor-col-resize touch-none"
    >
      <span className="absolute inset-y-0 left-1 w-0.5 bg-coral opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-active:opacity-100" />
    </div>
  )
}

/** Nút nhỏ ở mép trái khung làm việc để thu gọn / mở lại bảng công cụ. */
function PanelToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = `${collapsed ? 'Mở' : 'Thu gọn'} bảng công cụ`
  const Icon = collapsed ? ChevronRight : ChevronLeft
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={!collapsed}
      data-tip={label}
      onClick={onToggle}
      className="absolute left-0 top-1/2 z-40 grid h-12 w-5 -translate-y-1/2 place-items-center rounded-r-lg border border-l-0 border-line bg-card text-muted shadow-sm transition-colors hover:bg-surface hover:text-ink"
    >
      <Icon className="size-4" />
    </button>
  )
}

/** Thanh tab ở đáy cửa sổ hẹp. */
function TabBar({ active, onSelect }: { active: Tab; onSelect: (tab: Tab) => void }) {
  const row = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  // Mỗi tab rộng theo chữ của nó nên nền phải đo đúng nút đang chọn, không chia đều theo số tab được.
  useLayoutEffect(() => {
    const el = row.current!
    const measure = () => {
      const button = el.querySelector<HTMLElement>('[aria-pressed="true"]')
      if (button) setPill({ left: button.offsetLeft, width: button.offsetWidth })
    }
    measure()
    // Cửa sổ đổi cỡ hoặc font tải xong làm các nút đổi bề rộng.
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    void document.fonts.ready.then(measure)
    return () => observer.disconnect()
  }, [active])

  return (
    <nav className="border-t border-line bg-card px-2 py-1.5">
      <div ref={row} className="relative flex gap-0.5">
        {/* Nền của tab đang chọn trượt sang tab mới thay vì nhảy cóc. */}
        {pill && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-xl bg-blush transition-[transform,width] duration-300 ease-glide"
            style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
          />
        )}
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={active === id}
            onClick={() => onSelect(id)}
            className={cx(
              'relative flex h-12 flex-auto flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-xl px-1 text-[11px] font-semibold transition-colors duration-200 focus-visible:-outline-offset-2',
              active === id ? 'text-coral-dark' : 'text-soft hover:text-ink',
            )}
          >
            <Icon className={cx('size-5 shrink-0 transition-transform duration-300 ease-glide', active === id && 'scale-110')} />
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}

const UPDATE_CHECK_EVERY = 4 * 60 * 60 * 1000

/**
 * Trạng thái cập nhật. Có bản mới thì hỏi người dùng trước; đồng ý rồi app mới tải, tải xong tự cài và mở lại.
 * `manual` = người dùng vừa tự bấm kiểm tra nên cần báo kết quả kể cả khi không có gì mới.
 */
function useUpdates() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  /** Hộp thoại hỏi "cập nhật ngay?" đang mở. */
  const [asking, setAsking] = useState(false)
  const manual = useRef(false)

  useEffect(() => {
    const off = desktop.updates.onState((next) => {
      setState(next)
      const { toast } = useStore.getState()
      // Tự bấm kiểm tra mà có bản mới thì hỏi luôn; app tự kiểm tra ở nền thì chỉ hiện nút trên thanh tiêu đề.
      if (next.status === 'available' && manual.current) setAsking(true)
      else if (manual.current && next.status === 'latest') toast('Bạn đang dùng bản mới nhất.', 'success')
      // Lỗi lúc tải / cài luôn phải báo, vì người dùng đã bấm đồng ý và đang chờ.
      else if (next.status === 'error' && next.manual)
        toast(next.message, 'error', { label: 'Tải thủ công', run: () => void desktop.updates.openDownloadPage() })
      else if (manual.current && next.status === 'error') toast(next.message, 'error')
      if (next.status !== 'available') setAsking(false)
      if (next.status !== 'checking') manual.current = false
    })
    // Tự kiểm tra sau khi app đã mở xong, rồi định kỳ nếu app được để mở cả ngày.
    const first = setTimeout(() => void desktop.updates.check(), 3000)
    const timer = setInterval(() => void desktop.updates.check(), UPDATE_CHECK_EVERY)
    return () => {
      off()
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [])

  const check = () => {
    const { toast } = useStore.getState()
    if (state.status === 'unsupported') return toast('Bản chạy từ mã nguồn không tự cập nhật.')
    if (state.status === 'available') return setAsking(true)
    if (state.status === 'downloading') return toast(`Đang tải Tiệm Ghép Ảnh ${state.version}…`)
    if (state.status === 'ready') return void desktop.updates.install()
    manual.current = true
    void desktop.updates.check()
  }
  const confirm = () => {
    setAsking(false)
    void desktop.updates.download()
  }
  return { state, check, asking, confirm, dismiss: () => setAsking(false) }
}

/** Hỏi người dùng trước khi cập nhật: đồng ý thì app tải về, tự cài và mở lại. */
function UpdateDialog({ version, current, onConfirm, onCancel }: { version: string; current: string; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onCancel])
  // Gắn vào body: nằm trong thanh tiêu đề thì bị các nút nổi của khung làm việc đè lên.
  return createPortal(
    <div className="no-drag fixed inset-0 z-[70] grid animate-overlay place-items-center bg-black/45 p-6" onPointerDown={onCancel}>
      <div
        role="alertdialog"
        aria-labelledby="update-title"
        className="w-full max-w-sm animate-pop rounded-3xl border border-line bg-card p-6 shadow-lift"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h2 id="update-title" className="font-display text-lg font-bold text-ink">
          Đã có Tiệm Ghép Ảnh {version}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-soft">
          {current && <>Bạn đang dùng bản {current}. </>}
          {desktop.features.installer ? 'Tiệm Ghép Ảnh sẽ tải bản mới về, tự cài rồi mở lại.' : 'Trang sẽ tải lại để dùng bản mới.'} Ảnh ghép đang làm
          dở và thư viện ảnh được giữ nguyên.
        </p>
        <div className="mt-5 flex gap-2">
          <Button className="flex-1" onClick={onCancel}>
            Để sau
          </Button>
          <Button variant="primary" className="flex-1" autoFocus onClick={onConfirm}>
            Cập nhật ngay
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Thanh trên cùng đồng thời là thanh tiêu đề cửa sổ: kéo vào chỗ trống để di chuyển cửa sổ.
 * Hệ điều hành tự vẽ cụm nút cửa sổ lên trên (phải với Windows/Linux, trái với macOS) nên phải chừa chỗ.
 */
function TitleBar() {
  const hasCollage = useStore((s) => !!s.tree)
  // Tên thiết kế đang mở; chuỗi rỗng khi chưa có thiết kế nào trên khung. Thiết kế vừa bị bỏ hết ảnh vẫn đang mở.
  const design = useStore((s) => {
    const open = currentDesign(s)
    return open ? designTitle(open.name, s.texts) : ''
  })
  const progress = useExportProgress((s) => s.progress)
  const [menu, setMenu] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [version, setVersion] = useState('')
  const { state: update, check, asking, confirm, dismiss } = useUpdates()

  useEffect(() => void desktop.app.info().then((info) => setVersion(info.version)), [])

  // Người dùng đã đồng ý cập nhật từ trước: tải xong là cài và mở lại ngay. Đang xuất ảnh dở thì đợi xuất xong.
  const ready = update.status === 'ready'
  useEffect(() => {
    if (ready && progress === null) void desktop.updates.install()
  }, [ready, progress])

  const checking = update.status === 'checking'
  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-soft transition-colors hover:bg-sand hover:text-ink disabled:opacity-50'

  return (
    <header className="titlebar relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-line bg-card">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
        <Logo size={22} />
        {design && (
          <button
            type="button"
            data-tip="Thiết kế đang mở · tự động lưu. Bấm để xem tất cả thiết kế"
            onClick={() => useStore.setState({ tab: 'designs', leftCollapsed: false })}
            className="no-drag flex h-8 min-w-0 animate-fade items-center gap-2 rounded-full px-2 text-[13px] font-semibold text-soft transition-colors hover:bg-sand hover:text-ink sm:px-3"
          >
            <span className="truncate">{design}</span>
            <span className="hidden shrink-0 items-center gap-1 text-[11px] font-medium text-muted md:flex">
              {hasCollage ? <Check className="size-3" /> : <ImageOff className="size-3" />}
              {hasCollage ? 'Đã lưu' : 'Chưa có ảnh'}
            </span>
          </button>
        )}
        {/* Cửa sổ hẹp không có dải biểu tượng bên trái, nên nút tạo thiết kế mới nằm tạm ở đây. */}
        <button
          type="button"
          aria-label="Tạo thiết kế mới"
          onClick={() => useStore.getState().newDesign()}
          className="no-drag grid size-8 shrink-0 place-items-center rounded-full bg-coral text-white transition active:scale-95 lg:hidden"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="no-drag flex shrink-0 items-center gap-1 sm:gap-2">
        {update.status === 'downloading' && (
          <span className="relative flex h-8 animate-pop items-center overflow-hidden rounded-full bg-sand px-3 text-[12.5px] font-semibold tabular-nums text-soft">
            <span className="absolute inset-y-0 left-0 bg-blush transition-[width] duration-500" style={{ width: `${update.percent}%` }} />
            <span className="relative">
              Đang tải bản {update.version} · {update.percent}%
            </span>
          </span>
        )}
        {update.status === 'available' && (
          <button
            type="button"
            onClick={check}
            data-tip={`Cập nhật lên Tiệm Ghép Ảnh ${update.version}`}
            className="flex h-8 animate-pop items-center gap-1.5 rounded-full bg-blush px-3 text-[12.5px] font-semibold text-coral-dark transition hover:brightness-95 active:scale-95"
          >
            <RotateCw className="size-3.5" />
            Có bản mới {update.version}
          </button>
        )}
        {update.status === 'ready' && (
          <span className="flex h-8 animate-pop items-center gap-1.5 rounded-full bg-blush px-3 text-[12.5px] font-semibold text-coral-dark">
            <LoaderCircle className="size-3.5 animate-spin" />
            {progress === null ? `Đang chuyển sang bản ${update.version}…` : `Sẽ chuyển sang bản ${update.version} khi xuất ảnh xong`}
          </span>
        )}
        <ThemeToggle className="size-8" />
        <div className="relative">
          <IconButton label="Ứng dụng" className="size-8" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <Settings className={cx('size-[18px] transition-transform duration-300 ease-glide', menu && 'rotate-90')} />
          </IconButton>
          {menu && (
            <>
              <div className="fixed inset-0" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-10 w-64 origin-top-right animate-pop rounded-2xl border border-line bg-card p-2 shadow-lift">
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">Tiệm Ghép Ảnh</p>
                  <p className="text-xs text-muted">Phiên bản {version}</p>
                </div>
                <button
                  type="button"
                  disabled={checking}
                  className={item}
                  onClick={() => {
                    setMenu(false)
                    check()
                  }}
                >
                  <RefreshCw className={cx('size-4', checking && 'animate-spin')} />
                  {checking
                    ? 'Đang kiểm tra…'
                    : update.status === 'available'
                      ? `Cập nhật lên bản ${update.version}`
                      : update.status === 'downloading'
                        ? `Đang tải bản ${update.version}…`
                        : 'Kiểm tra cập nhật'}
                </button>
                {desktop.features.dataDir ? (
                  <button type="button" className={item} onClick={() => void desktop.app.openDataDir()}>
                    <FolderCog className="size-4" />
                    Mở thư mục dữ liệu
                  </button>
                ) : (
                  desktop.data && (
                    <>
                      <button
                        type="button"
                        className={item}
                        onClick={() => {
                          setMenu(false)
                          setDataOpen(true)
                        }}
                      >
                        <DatabaseBackup className="size-4" />
                        Dữ liệu & sao lưu
                      </button>
                      <button
                        type="button"
                        className={item}
                        onClick={() => {
                          setMenu(false)
                          setAboutOpen(true)
                        }}
                      >
                        <Info className="size-4" />
                        Giới thiệu & quyền riêng tư
                      </button>
                    </>
                  )
                )}
              </div>
            </>
          )}
        </div>
        <Button variant="primary" className="h-8 px-3.5 text-[13px]" disabled={!hasCollage || progress !== null} onClick={() => void exportToFile()}>
          {progress !== null ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
          <span className="tabular-nums">{progress !== null ? `${Math.round(progress * 100)}%` : 'Xuất ảnh'}</span>
        </Button>
      </div>
      {dataOpen && <DataDialog onClose={() => setDataOpen(false)} />}
      {aboutOpen && <AboutDialog version={version} onClose={() => setAboutOpen(false)} />}
      {asking && update.status === 'available' && (
        <UpdateDialog version={update.version} current={version} onConfirm={confirm} onCancel={dismiss} />
      )}
      {/* Tiến độ xuất ảnh chạy dọc mép dưới thanh tiêu đề. */}
      <span
        aria-hidden
        className={cx(
          'absolute inset-x-0 -bottom-px h-[3px] origin-left gradient-brand ease-out',
          // Lúc bắt đầu thanh phải về 0 ngay; xong thì chạy nốt tới hết rồi mờ đi.
          progress === 0 ? 'transition-none' : 'transition-[transform,opacity] duration-300',
          progress === null && 'opacity-0',
        )}
        style={{ transform: `scaleX(${progress ?? 1})` }}
      />
    </header>
  )
}
