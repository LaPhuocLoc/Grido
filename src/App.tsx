import {
  Crop,
  Download,
  FolderCog,
  ImagePlus,
  Images,
  LayoutGrid,
  LoaderCircle,
  RefreshCw,
  RotateCw,
  Settings,
  SlidersHorizontal,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { UpdateState } from '../shared/types'
import { Library } from './components/Library'
import { ExportPanel, LayoutPanel, SizePanel, StylePanel, TextPanel } from './components/Panels'
import { Stage } from './components/Stage'
import { Button, cx, IconButton, Logo, ThemeToggle, Toasts } from './components/ui'
import { desktop } from './lib/desktop'
import { exportToFile, useExportProgress } from './lib/useCollage'
import { useStore, type Tab } from './store'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'library', label: 'Ảnh', icon: Images },
  { id: 'layout', label: 'Bố cục', icon: LayoutGrid },
  { id: 'size', label: 'Khung', icon: Crop },
  { id: 'style', label: 'Viền', icon: SlidersHorizontal },
  { id: 'text', label: 'Chữ', icon: Type },
  { id: 'export', label: 'Xuất', icon: Download },
]

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
      const files = [...(e.dataTransfer?.files ?? [])]
      if (files.length) void useStore.getState().importFiles(files)
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
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing(e) && s.activeText) {
        s.removeText(s.activeText)
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

  // Cửa sổ đủ rộng thì thư viện luôn hiện ở cột trái nên panel phải không có tab "Ảnh".
  const activeTab = isDesktop && tab === 'library' ? 'layout' : tab
  const tabs = isDesktop ? TABS.filter((t) => t.id !== 'library') : TABS
  const panel =
    activeTab === 'library' ? (
      <Library />
    ) : (
      <div key={activeTab} className="animate-fade p-4">
        {activeTab === 'size' && <SizePanel />}
        {activeTab === 'layout' && <LayoutPanel />}
        {activeTab === 'style' && <StylePanel />}
        {activeTab === 'text' && <TextPanel />}
        {activeTab === 'export' && <ExportPanel />}
      </div>
    )

  const tabBar = <TabBar tabs={tabs} active={activeTab} wide={isDesktop} onSelect={setTab} />

  return (
    <div className="flex h-dvh animate-app flex-col">
      <TitleBar />
      {isDesktop ? (
        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_384px] grid-rows-[minmax(0,1fr)]">
          <aside className="min-h-0 border-r border-line bg-paper">
            <Library />
          </aside>
          <main className="min-h-0">
            <Stage />
          </main>
          <aside className="flex min-h-0 flex-col border-l border-line bg-paper">
            {tabBar}
            <div className="scroll-soft min-h-0 flex-1 overflow-y-auto">{panel}</div>
          </aside>
        </div>
      ) : (
        <>
          <main className="h-[44dvh] shrink-0">
            <Stage />
          </main>
          <div className="scroll-soft min-h-0 flex-1 overflow-y-auto border-t border-line bg-paper">{panel}</div>
          {tabBar}
        </>
      )}
    </div>
  )
}

function TabBar({ tabs, active, wide, onSelect }: { tabs: typeof TABS; active: Tab; wide: boolean; onSelect: (tab: Tab) => void }) {
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
  }, [active, wide, tabs.length])

  return (
    <nav className={cx(wide ? 'border-b border-line p-2' : 'border-t border-line bg-card px-2 py-1.5')}>
      <div ref={row} className="relative flex gap-0.5">
        {/* Nền của tab đang chọn trượt sang tab mới thay vì nhảy cóc. */}
        {pill && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-xl bg-blush transition-[transform,width] duration-300 ease-glide"
            style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
          />
        )}
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={active === id}
            onClick={() => onSelect(id)}
            className={cx(
              'relative flex flex-auto items-center justify-center whitespace-nowrap rounded-xl font-semibold transition-colors duration-200 focus-visible:-outline-offset-2',
              wide ? 'h-9 gap-1.5 px-2 text-[12.5px]' : 'h-12 flex-col gap-0.5 px-1 text-[11px]',
              active === id ? 'text-coral-dark' : 'text-soft hover:text-ink',
            )}
          >
            <Icon className={cx('shrink-0 transition-transform duration-300 ease-glide', wide ? 'size-4' : 'size-5', active === id && 'scale-110')} />
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}

const UPDATE_CHECK_EVERY = 4 * 60 * 60 * 1000

/** Trạng thái tự cập nhật. `manual` = người dùng vừa tự bấm kiểm tra nên cần báo kết quả kể cả khi không có gì mới. */
function useUpdates() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const manual = useRef(false)

  useEffect(() => {
    const off = desktop.updates.onState((next) => {
      setState(next)
      const { toast } = useStore.getState()
      if (next.status === 'ready')
        toast(`Grido ${next.version} đã tải xong.`, 'success', { label: 'Khởi động lại', run: () => void desktop.updates.install() })
      else if (manual.current && next.status === 'latest') toast('Bạn đang dùng bản mới nhất.', 'success')
      else if (manual.current && next.status === 'error') toast(next.message, 'error')
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
    if (state.status === 'downloading') return toast(`Đang tải Grido ${state.version}…`)
    if (state.status === 'ready') return void desktop.updates.install()
    manual.current = true
    void desktop.updates.check()
  }
  return { state, check }
}

/**
 * Thanh trên cùng đồng thời là thanh tiêu đề cửa sổ: kéo vào chỗ trống để di chuyển cửa sổ.
 * Hệ điều hành tự vẽ cụm nút cửa sổ lên trên (phải với Windows/Linux, trái với macOS) nên phải chừa chỗ.
 */
function TitleBar() {
  const hasCollage = useStore((s) => !!s.tree)
  const progress = useExportProgress((s) => s.progress)
  const [menu, setMenu] = useState(false)
  const [version, setVersion] = useState('')
  const { state: update, check } = useUpdates()

  useEffect(() => void desktop.app.info().then((info) => setVersion(info.version)), [])

  const checking = update.status === 'checking'
  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-soft transition-colors hover:bg-sand hover:text-ink disabled:opacity-50'

  return (
    <header className="titlebar relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-line bg-card">
      <Logo size={22} />
      <div className="no-drag flex items-center gap-2">
        {update.status === 'downloading' && (
          <span className="relative flex h-8 animate-pop items-center overflow-hidden rounded-full bg-sand px-3 text-[12.5px] font-semibold tabular-nums text-soft">
            <span className="absolute inset-y-0 left-0 bg-blush transition-[width] duration-500" style={{ width: `${update.percent}%` }} />
            <span className="relative">
              Đang tải bản {update.version} · {update.percent}%
            </span>
          </span>
        )}
        {update.status === 'ready' && (
          <button
            type="button"
            onClick={() => void desktop.updates.install()}
            title={`Cài Grido ${update.version} và mở lại app`}
            className="flex h-8 animate-pop items-center gap-1.5 rounded-full bg-blush px-3 text-[12.5px] font-semibold text-coral-dark transition hover:brightness-95 active:scale-95"
          >
            <RotateCw className="size-3.5" />
            Khởi động lại để cập nhật
          </button>
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
                  <p className="text-sm font-semibold">Grido</p>
                  <p className="text-xs text-muted">Phiên bản {version}</p>
                </div>
                <button type="button" disabled={checking} className={item} onClick={check}>
                  <RefreshCw className={cx('size-4', checking && 'animate-spin')} />
                  {checking ? 'Đang kiểm tra…' : update.status === 'ready' ? `Cài bản ${update.version} ngay` : 'Kiểm tra cập nhật'}
                </button>
                <button type="button" className={item} onClick={() => void desktop.app.openDataDir()}>
                  <FolderCog className="size-4" />
                  Mở thư mục dữ liệu
                </button>
              </div>
            </>
          )}
        </div>
        <Button variant="primary" className="h-8 px-3.5 text-[13px]" disabled={!hasCollage || progress !== null} onClick={() => void exportToFile()}>
          {progress !== null ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
          <span className="tabular-nums">{progress !== null ? `${Math.round(progress * 100)}%` : 'Xuất ảnh'}</span>
        </Button>
      </div>
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
