import {
  Check,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  Ellipsis,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Grid2x2,
  Grid3x3,
  ImagePlus,
  ListChecks,
  Search,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Photo } from '../../shared/types'
import { groupByAlbum, UNCATEGORIZED, type Album } from '../lib/albums'
import { desktop, prefetchFile, thumbUrl, usePhotoUrl } from '../lib/desktop'
import { MAX_PHOTOS } from '../lib/layout/registry'
import { justify, searchPhotos, tileAspect } from '../lib/libraryView'
import { stageDropAt, type StageDrop } from '../lib/stageDrop'
import { photosIn, useStore, type ImportItem } from '../store'
import { Button, cx } from './ui'

/** Số ô đầu tiên được hiện lần lượt khi mở app; phần còn lại hiện cùng lúc để không phải chờ. */
const STAGGER = 14
/** Chỉ những ô đầu danh sách mới có hiệu ứng hiện dần: vài nghìn animation chạy cùng lúc làm cuộn chậm hẳn. */
const ANIMATED_TILES = 24
/**
 * Lưới ảnh được cắt thành từng khối vài hàng: trình duyệt bỏ qua hẳn việc dàn trang + vẽ những khối nằm ngoài vùng nhìn.
 * Đánh dấu theo khối thay vì theo từng ô, vì theo dõi vài nghìn ô riêng lẻ làm cuộn giật. Khối luôn chứa trọn hàng nên
 * không còn hàng lẻ loi giữa lưới.
 */
const ROWS_PER_CHUNK = 6
/** Khe giữa các ảnh (px). */
const GAP = 6
/** Chiều cao hàng ảnh theo cỡ xem: nhỏ / vừa / lớn. */
const ROW_TARGET = [64, 96, 144]
/** Ba cỡ ảnh của thư viện, từ lớn tới nhỏ như menu "View" của Windows (`zoom` là chỉ số trong ROW_TARGET). */
const SIZES: { zoom: number; label: string; icon: ReactNode }[] = [
  { zoom: 2, label: 'Ảnh lớn', icon: <Square className="size-4" /> },
  { zoom: 1, label: 'Ảnh vừa', icon: <Grid2x2 className="size-4" /> },
  { zoom: 0, label: 'Ảnh nhỏ', icon: <Grid3x3 className="size-4" /> },
]
/** Số ô giữ chỗ tối đa cho ảnh đang được nhập. */
const MAX_SHIMMERS = 12
/** Vùng thả "tạo album mới từ những ảnh đang kéo". */
const NEW_ALBUM = '__new'
/** Con trỏ phải đi quá bấy nhiêu px mới tính là kéo (để bấm chọn ảnh không bị nhầm thành kéo). */
const DRAG_THRESHOLD = 6
/** Kéo sát mép trên / dưới danh sách trong khoảng này thì danh sách tự cuộn. */
const AUTO_SCROLL_EDGE = 48

interface MenuItem {
  label: string
  /** Biểu tượng đứng trước nhãn. */
  icon?: ReactNode
  /** Menu chọn một trong nhiều (cỡ ảnh…): true = mục đang dùng, hiện một chấm ở đầu dòng. */
  checked?: boolean
  danger?: boolean
  /** Kẻ một đường ngăn phía trên mục này. */
  divider?: boolean
  run: () => void
}
interface MenuState {
  x: number
  y: number
  /** Menu bung về bên trái điểm neo (dùng cho nút nằm sát mép phải panel). */
  alignRight?: boolean
  items: MenuItem[]
}

/**
 * Ảnh sẽ đi cùng khi kéo / chuyển album: kéo một ảnh đang được chọn thì mang theo mọi ảnh đang chọn (chế độ "Chọn"), hoặc
 * mọi ảnh trong bố cục; không thì chỉ ảnh đó.
 */
function movingIds(photoId: string, picked: Set<string> | null): string[] {
  if (picked?.has(photoId)) return [...picked]
  const inFrame = photosIn(useStore.getState().selected)
  return inFrame.length > 1 && inFrame.includes(photoId) ? inFrame : [photoId]
}

/**
 * Một ảnh trong thư viện, hiện trọn khung theo đúng tỉ lệ (không cắt vuông). Bấm vào ảnh = đưa ảnh vào bản ghép, bấm lần
 * nữa = bỏ ra. Ở chế độ "Chọn" (nút "Chọn" hoặc quét chuột) thì bấm = tích / bỏ tích, chọn bao nhiêu ảnh cũng được để
 * xoá / chuyển album / ghép; kéo ảnh = chuyển sang album khác, hoặc thả vào một ô của khung; xoá khỏi thư viện là nút
 * thùng rác riêng (hoặc menu chuột phải) nên không thể bấm nhầm.
 * memo: chọn / bỏ chọn một ảnh chỉ vẽ lại đúng ô đó.
 */
const Tile = memo(function Tile({
  photo,
  x,
  y,
  w,
  h,
  selected,
  slot,
  swept,
  doomed,
  moving,
  picking,
  index,
  onActivate,
  onMenu,
}: {
  photo: Photo
  /** Vị trí + cỡ ô trong khối (px). */
  x: number
  y: number
  w: number
  h: number
  /** Đang nằm trong khung, hoặc (chế độ "Chọn") đang được tích. */
  selected: boolean
  /** Thứ tự của ảnh trong bản ghép (1, 2, 3…), 0 = không nằm trong bản ghép hoặc đang ở chế độ "Chọn". */
  slot: number
  /** Ảnh đang nằm trong vùng quét chọn (chưa thả chuột). */
  swept: boolean
  /** Ảnh đang chờ xác nhận xoá. */
  doomed: boolean
  /** Ảnh đang được kéo sang album khác. */
  moving: boolean
  /** Đang ở chế độ "Chọn" nhiều ảnh. */
  picking: boolean
  index: number
  onActivate: (id: string, shift: boolean) => void
  onMenu: (photo: Photo, x: number, y: number) => void
}) {
  const [loaded, setLoaded] = useState(false)
  const thumb = usePhotoUrl(photo.id, 'thumb')
  return (
    <li
      data-photo={photo.id}
      // Quyền đọc file gốc của trình duyệt là chuyện của lúc xuất (app hỏi khi đó), không hiện thành biểu tượng trên ảnh.
      data-locked={photo.locked || undefined}
      className={cx('tile group absolute transition-opacity', index < ANIMATED_TILES && 'animate-tile', moving && 'opacity-35')}
      style={{ left: x, top: y, width: w, height: h, animationDelay: `${Math.min(index, STAGGER) * 22}ms` }}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(photo, e.clientX, e.clientY)
      }}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={
          picking
            ? `${selected ? 'Bỏ chọn' : 'Chọn'} ảnh ${photo.name}`
            : `${selected ? 'Bỏ ảnh' : 'Đưa ảnh'} ${photo.name} ${selected ? 'khỏi' : 'vào'} bản ghép`
        }
        onPointerEnter={() => prefetchFile(photo.id)}
        onClick={(e) => onActivate(photo.id, e.shiftKey)}
        className={cx(
          'relative block size-full overflow-hidden rounded-lg bg-sand transition-[transform,box-shadow] duration-200 ease-glide',
          // Thu nhỏ một chút để viền nằm gọn trong ô (thẻ li cắt mọi thứ tràn ra ngoài).
          doomed
            ? 'scale-[0.92] ring-[3px] ring-danger ring-offset-2 ring-offset-paper'
            : selected
              ? 'scale-[0.92] ring-[3px] ring-coral ring-offset-2 ring-offset-paper'
              : swept
                ? 'scale-[0.92] ring-[3px] ring-coral/60 ring-offset-2 ring-offset-paper'
              : 'hover:scale-[1.03] hover:shadow-soft active:scale-[0.97]',
        )}
      >
        <img
          src={thumb}
          // Chỉ tên file kèm đuôi; muốn biết ảnh nằm ở đâu thì dùng "Mở thư mục chứa ảnh" trong menu chuột phải.
          data-tip={photo.path.split(/[\\/]/).pop() || photo.name}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          // Ảnh hiện dần khi giải mã xong thay vì bật ra từng mảng.
          className={cx(
            'size-full object-cover transition-[opacity,transform] duration-300 ease-out',
            !loaded ? 'scale-105 opacity-0' : doomed ? 'opacity-45' : 'opacity-100',
          )}
        />
        {/* Ảnh chỉ đang chờ trình duyệt cho phép đọc (locked) cũng có cờ missing, nhưng không phải lỗi: không hiện gì. */}
        {photo.missing && !photo.locked && (
          <span
            data-tip="Không tìm thấy file gốc (đã bị di chuyển hoặc xoá): xuất ảnh sẽ dùng bản xem trước"
            className="absolute bottom-1 left-1 grid size-5 place-items-center rounded-full bg-amber text-ink"
          >
            <TriangleAlert className="size-3" />
          </span>
        )}
      </button>
      {/* Ảnh đang nằm trong bản ghép: số thứ tự ở góc phải (chế độ "Chọn" thì chỗ này là dấu tích). */}
      {slot > 0 && !doomed && !swept && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 text-[11px] font-bold tabular-nums text-white shadow">
          {slot}
        </span>
      )}
      {/* Dấu tích ở góc chỉ có ở chế độ "Chọn" (và lúc đang quét chọn): mờ khi chưa chọn, sáng lên khi đã chọn. */}
      {(picking || swept) && !doomed && (
        <span
          className={cx(
            'pointer-events-none absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full transition-colors duration-150',
            selected || swept ? 'bg-coral text-white shadow' : 'bg-black/45 text-white/80 ring-1 ring-white/70',
          )}
        >
          <Check className="size-3" strokeWidth={3.5} />
        </span>
      )}
    </li>
  )
})

/** Một ảnh trong dải "đang dùng trong bố cục": bấm để tìm tới ảnh đó trong thư viện, nút × để bỏ ra. */
function TrayItem({ id, name, onLocate }: { id: string; name: string; onLocate: (id: string) => void }) {
  const thumb = usePhotoUrl(id, 'thumb')
  return (
    <li className="group relative size-10 shrink-0">
      <button
        type="button"
        aria-label={`Tìm ảnh ${name} trong thư viện`}
        data-tip={name}
        onClick={() => onLocate(id)}
        className="block size-full overflow-hidden rounded-lg bg-sand ring-1 ring-line transition-transform hover:scale-105"
      >
        {thumb && <img src={thumb} alt="" draggable={false} className="size-full object-cover" />}
      </button>
      <button
        type="button"
        aria-label={`Bỏ ${name} khỏi bố cục`}
        data-tip="Bỏ khỏi bố cục"
        onClick={() => useStore.getState().deselect(id)}
        className="absolute -right-1 -top-1 grid size-4.5 place-items-center rounded-full bg-ink text-paper opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="size-3" strokeWidth={3} />
      </button>
    </li>
  )
}

/** Menu nhỏ bung ra tại con trỏ / dưới một nút. Gắn vào body vì panel bao ngoài cắt mọi thứ tràn ra. */
function Menu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])
  const height = Math.min(menu.items.length * 36 + 12, window.innerHeight * 0.7)
  return createPortal(
    <div className="fixed inset-0 z-50" onPointerDown={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        role="menu"
        className="scroll-soft absolute max-h-[70vh] min-w-52 max-w-72 animate-pop overflow-y-auto rounded-2xl border border-line bg-card p-1.5 shadow-lift"
        style={{
          top: Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)),
          ...(menu.alignRight ? { right: Math.max(8, window.innerWidth - menu.x) } : { left: Math.max(8, Math.min(menu.x, window.innerWidth - 296)) }),
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {menu.items.map((item) => {
          const radio = item.checked !== undefined
          return (
          <button
            key={item.label}
            type="button"
            role={radio ? 'menuitemradio' : 'menuitem'}
            aria-checked={radio ? item.checked : undefined}
            onClick={() => {
              onClose()
              item.run()
            }}
            className={cx(
              'flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13px] font-medium transition-colors hover:bg-sand',
              item.danger ? 'text-danger' : 'text-ink',
              item.divider && 'relative mt-2 before:absolute before:inset-x-2 before:-top-1 before:h-px before:bg-line',
            )}
          >
            {radio && <span className={cx('size-1.5 shrink-0 rounded-full', item.checked ? 'bg-ink' : 'bg-transparent')} />}
            {item.icon && <span className="grid shrink-0 place-items-center text-soft [&>svg]:size-4">{item.icon}</span>}
            <span className="truncate">{item.label}</span>
          </button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}

/** Ô nhập tên album ngay tại tiêu đề mục. Enter / bấm ra ngoài để lưu, Esc để bỏ. */
function NameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const cancelled = useRef(false)
  return (
    <input
      autoFocus
      defaultValue={initial}
      maxLength={40}
      aria-label="Tên album"
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onDone(cancelled.current ? null : e.currentTarget.value)}
      onKeyDown={(e) => {
        // Phím gõ không được lọt ra phím tắt toàn cục (Esc bỏ chọn ô, Delete bỏ ảnh…).
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
      className="h-7 min-w-0 flex-1 rounded-lg border border-coral bg-surface px-2 text-[13px] font-semibold text-ink outline-none ring-4 ring-coral/15"
    />
  )
}

/** Một mục trong thư viện: "Chưa phân loại" hoặc một album. Cả mục là vùng thả khi kéo ảnh. */
function Section({
  album,
  bare,
  count,
  collapsed,
  editing,
  over,
  onStartRename,
  onRename,
  onMenu,
  children,
}: {
  /** null = "Chưa phân loại". */
  album: Album | null
  /** Ẩn tiêu đề mục (khi thư viện chưa có album nào). */
  bare: boolean
  count: number
  collapsed: boolean
  editing: boolean
  /** Đang có ảnh được kéo lơ lửng trên mục này. */
  over: boolean
  onStartRename: () => void
  /** Tên mới, hoặc null khi người dùng bỏ (Esc). */
  onRename: (name: string | null) => void
  onMenu: (x: number, y: number, alignRight?: boolean) => void
  children: ReactNode
}) {
  const { toggleAlbumCollapsed } = useStore.getState()
  const id = album?.id ?? UNCATEGORIZED
  const name = album?.name ?? 'Chưa phân loại'
  return (
    <section
      aria-label={name}
      data-drop={id}
      className={cx('rounded-2xl transition-colors duration-150', over && !bare && 'bg-blush shadow-[0_0_0_2px_var(--color-coral)]')}
    >
      <header
        // Nền đặc, không làm mờ: backdrop-filter trên tiêu đề dính khiến GPU phải vẽ lại mỗi khung hình khi cuộn.
        className={cx('group/head sticky top-0 z-10 h-9 items-center gap-1 bg-paper pl-0.5 pr-0.5', bare ? 'hidden' : 'flex')}
        onContextMenu={(e) => {
          if (!album) return
          e.preventDefault()
          onMenu(e.clientX, e.clientY)
        }}
      >
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Mở' : 'Thu gọn'} ${name}`}
          onClick={() => toggleAlbumCollapsed(id)}
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-sand hover:text-ink"
        >
          <ChevronDown className={cx('size-4 transition-transform duration-200', collapsed && '-rotate-90')} />
        </button>
        {editing && album ? (
          <NameInput initial={album.name} onDone={onRename} />
        ) : (
          <button
            type="button"
            data-tip={album ? 'Bấm đúp để đổi tên' : undefined}
            onClick={() => toggleAlbumCollapsed(id)}
            onDoubleClick={() => album && onStartRename()}
            className={cx('min-w-0 flex-1 truncate text-left text-[13px] font-semibold', album ? 'text-ink' : 'text-soft')}
          >
            {name}
          </button>
        )}
        <span className="shrink-0 px-1 text-xs tabular-nums text-muted">{count}</span>
        {album && !editing && (
          <button
            type="button"
            aria-label={`Tuỳ chọn cho album ${album.name}`}
            aria-haspopup="menu"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              onMenu(r.right, r.bottom + 4, true)
            }}
            className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-sand hover:text-ink"
          >
            <Ellipsis className="size-4" />
          </button>
        )}
      </header>
      {!collapsed && <div className={bare ? 'pt-2' : 'pb-2 pt-1'}>{children}</div>}
    </section>
  )
}

/**
 * Biểu tượng "ghép ảnh": một khung chia ba ô như bố cục ảnh ghép, ô lớn có hình núi + mặt trời để nhìn là biết ô chứa
 * ảnh. Cùng nét với bộ icon lucide (24px, nét 2).
 */
function ComposeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="2.5" y="3" width="19" height="18" rx="3" />
      <path d="M12.5 3v18M12.5 12h9" />
      <path d="m2.5 17.5 3.5-4 3 3 3.5-3.5" />
      <circle cx="7" cy="8" r="1.5" />
    </svg>
  )
}

/** Nút tròn chỉ có icon trên thanh thao tác nổi của chế độ "Chọn"; chú thích hiện khi rê chuột. */
function BarButton({
  label,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  return (
    // aria-disabled thay cho disabled: nút bị khoá vẫn phải hiện được chú thích giải thích vì sao.
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled}
      data-tip={label}
      onClick={(e) => !disabled && onClick(e)}
      className={cx(
        'grid size-9 shrink-0 place-items-center rounded-full transition-colors',
        disabled ? 'cursor-default opacity-35' : danger ? 'hover:bg-danger' : 'hover:bg-white/15',
      )}
    >
      {children}
    </button>
  )
}

/** Vị trí + cỡ một ô trong khối lưới (px). */
interface Placed {
  index: number
  x: number
  y: number
  w: number
  h: number
}
/** Khối ảnh nới ra mỗi bên bấy nhiêu px: khối cắt mọi thứ vẽ tràn (content-visibility), viền chọn cần chỗ. */
const CHUNK_PAD = 4

export function Library() {
  const photos = useStore((s) => s.photos)
  const imports = useStore((s) => s.imports)
  const slots = useStore((s) => s.selected)
  // Ảnh đang nằm trong khung; `slots` còn tính cả ô trống của bố cục.
  const selected = useMemo(() => photosIn(slots), [slots])
  const emptySlots = slots.length - selected.length
  const fillingEmpty = useStore((s) => s.activeCell !== null && s.selected[s.activeCell] === null)
  const albums = useStore((s) => s.albums)
  const photoAlbum = useStore((s) => s.photoAlbum)
  const collapsedAlbums = useStore((s) => s.collapsedAlbums)
  const replacing = useStore((s) => s.activeCell !== null)
  // Ảnh đang kéo đã sang tới khung làm việc: chỉ ảnh đang cầm đi vào ô.
  const overStage = useStore((s) => s.dropTarget !== null)
  const zoom = useStore((s) => s.libraryZoom)
  const {
    pickPhotos,
    pickFolder,
    dismissImport,
    clearSelection,
    deletePhotos,
    replaceSelection,
    createAlbum,
    renameAlbum,
    removeAlbum,
    movePhotos,
    toggleAlbumCollapsed,
    toast,
    set,
  } = useStore.getState()

  const [query, setQuery] = useState('')
  /**
   * Chế độ "Chọn": những ảnh đang được chọn để ghép / chuyển album / xoá một lượt, không giới hạn số lượng (khác với ảnh
   * trong bố cục, tối đa 10). null = không ở chế độ này.
   */
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const pickedRef = useRef(picked)
  pickedRef.current = picked
  /** Ảnh bấm gần nhất ở chế độ "Chọn", làm mốc cho Shift + bấm (chọn cả dải). */
  const anchor = useRef<string | null>(null)
  /** Bề rộng vùng lưới, để xếp ảnh vừa khít từng hàng. */
  const [width, setWidth] = useState(0)
  const measure = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = measure.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  // Mọi kiểu xoá (một ảnh, ảnh đã chọn, cả album) đều đi qua cùng một bước xác nhận: ảnh sắp xoá được tô đỏ trong lưới.
  const [doomedIds, setDoomed] = useState<string[] | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** Album đang được đổi tên ngay tại tiêu đề. */
  const [renaming, setRenaming] = useState<string | null>(null)
  /** Ảnh đang được kéo và mục đang nằm dưới con trỏ. Vị trí hình bay theo con trỏ ghi thẳng vào DOM, không qua state. */
  const [drag, setDrag] = useState<{ ids: string[]; over: string | null } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const press = useRef<{ id: string; x: number; y: number; pointerId: number; ids: string[] | null; over: string | null; cell: StageDrop; lastX: number; lastY: number; raf: number } | null>(null)
  /** Quét chọn: giữ chuột ở chỗ trống rồi kéo thành một vùng, mọi ảnh chạm vùng đó được chọn khi thả tay. */
  const [swept, setSwept] = useState<Set<string> | null>(null)
  const marquee = useRef<HTMLDivElement>(null)
  /** Điểm bắt đầu tính theo nội dung danh sách (đã cộng độ cuộn), để vùng quét đứng yên so với ảnh khi danh sách tự cuộn. */
  const sweep = useRef<{ pointerId: number; x: number; y: number; sx: number; sy: number; cx: number; cy: number; active: boolean; ids: string[]; raf: number } | null>(null)
  // Thả chuột sau khi kéo vẫn sinh ra một cú click lên ảnh → phải nuốt nó, nếu không ảnh bị chọn / bỏ chọn ngoài ý muốn.
  const swallowClick = useRef(false)
  const closeMenu = useCallback(() => setMenu(null), [])

  // Lọc theo ô tìm kiếm. Đang tìm thì mở hết các album (kết quả nằm trong album thu gọn vẫn phải thấy) và ẩn mục không có
  // kết quả nào.
  const searching = query.trim() !== ''
  const visible = useMemo(() => searchPhotos(photos, query), [photos, query])
  const groups = useMemo(() => groupByAlbum(visible, albums, photoAlbum), [visible, albums, photoAlbum])
  const shown = searching ? groups.filter((g) => g.photos.length) : groups
  const isCollapsed = (id: string) => !searching && albums.length > 0 && collapsedAlbums.includes(id)
  /** Thứ tự ảnh đang thấy trên màn hình (cho Shift + bấm, "Chọn hết", thứ tự ghép). */
  const order = shown.flatMap((g) => (isCollapsed(g.album?.id ?? UNCATEGORIZED) ? [] : g.photos.map((p) => p.id)))
  const orderRef = useRef(order)
  orderRef.current = order
  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos])

  /** Tích / bỏ tích một ảnh (Shift = cả dải từ ảnh bấm trước); chưa ở chế độ "Chọn" thì vào luôn với ảnh đó. */
  const onPick = useCallback((id: string, shift: boolean) => {
    const next = new Set(pickedRef.current ?? [])
    const list = orderRef.current
    const from = anchor.current ? list.indexOf(anchor.current) : -1
    const to = list.indexOf(id)
    if (shift && from >= 0 && to >= 0) for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next.add(list[i])
    else if (next.has(id)) next.delete(id)
    else next.add(id)
    anchor.current = id
    setPicked(next)
  }, [])

  /** Bấm vào một ảnh: đưa vào bản ghép, bấm lần nữa thì bỏ ra; ở chế độ "Chọn" thì tích / bỏ tích. */
  const onActivate = useCallback(
    (id: string, shift: boolean) => {
      if (pickedRef.current) return onPick(id, shift)
      const s = useStore.getState()
      // Bản ghép đã đủ ảnh: chỉ luôn cách chọn nhiều hơn (để xoá, chuyển album), kẻo người dùng tưởng không chọn tiếp được.
      if (s.activeCell === null && !s.selected.includes(id) && !s.selected.includes(null) && s.selected.length >= MAX_PHOTOS)
        return s.toast(`Một ảnh ghép chứa tối đa ${MAX_PHOTOS} ảnh. Muốn chọn nhiều hơn để xoá hay chuyển album thì bấm nút Chọn.`, 'info', {
          label: 'Chọn nhiều ảnh',
          run: () => onPick(id, false),
        })
      s.toggleSelect(id)
    },
    [onPick],
  )

  const startPicking = () => {
    anchor.current = null
    setPicked(new Set())
  }
  const stopPicking = () => setPicked(null)

  // Chế độ "Chọn": Esc để thoát, Ctrl + A chọn mọi ảnh đang thấy.
  const picking = picked !== null
  useEffect(() => {
    if (!picking) return
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === 'Escape' && !doomedIds) setPicked(null)
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setPicked(new Set(orderRef.current))
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [picking, doomedIds])

  /** Tạo album rồi vào luôn chế độ đặt tên; `ids` là ảnh đưa sẵn vào album mới. */
  const newAlbum = (ids: string[] = []) => {
    const id = createAlbum()
    if (ids.length) movePhotos(ids, id)
    setRenaming(id)
  }

  /** Cuộn tới một ảnh trong lưới và nháy viền cho dễ thấy (bấm ảnh ở dải "trong bố cục"). */
  const locate = (id: string) => {
    const find = () => scroller.current?.querySelector<HTMLElement>(`[data-photo="${CSS.escape(id)}"]`)
    const go = () => {
      const el = find()
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.remove('tile-flash')
      void el.offsetWidth
      el.classList.add('tile-flash')
      setTimeout(() => el.classList.remove('tile-flash'), 1600)
    }
    if (find()) return go()
    // Ảnh đang bị ô tìm kiếm hoặc album thu gọn che mất: mở ra rồi tìm.
    setQuery('')
    const album = albums.some((a) => a.id === photoAlbum[id]) ? photoAlbum[id] : UNCATEGORIZED
    if (collapsedAlbums.includes(album)) toggleAlbumCollapsed(album)
    setTimeout(go, 60)
  }

  /** Nút thùng rác trên thanh công cụ: xoá ảnh đang chọn / đang trong khung, hoặc vào chế độ "Chọn" để tích ảnh cần xoá. */
  const deleteMenu = (x: number, y: number) => {
    const { photos: all } = useStore.getState()
    const inFrame = photosIn(useStore.getState().selected)
    const chosen = pickedInOrder()
    const items: MenuItem[] = []
    if (chosen.length) items.push({ label: `Xoá ${chosen.length} ảnh đã chọn`, danger: true, run: () => setDoomed(chosen) })
    else {
      items.push({ label: 'Chọn ảnh để xoá…', run: startPicking })
      if (inFrame.length)
        items.push({
          label: inFrame.length > 1 ? `Xoá ${inFrame.length} ảnh trong bản ghép` : 'Xoá ảnh đang ở trong khung',
          run: () => setDoomed([...inFrame]),
        })
    }
    items.push({ label: `Xoá tất cả ${all.length} ảnh`, danger: true, divider: true, run: () => setDoomed(all.map((p) => p.id)) })
    setMenu({ x, y, alignRight: true, items })
  }

  const albumMenu = (ids: string[], x: number, y: number, after?: () => void) => {
    const run = (fn: () => void) => () => {
      fn()
      after?.()
    }
    setMenu({
      x,
      y,
      items: [
        ...albums.map((a) => ({ label: `Chuyển vào “${a.name}”`, run: run(() => movePhotos(ids, a.id)) })),
        { label: 'Chuyển vào album mới…', run: run(() => newAlbum(ids)) },
        { label: 'Đưa về Chưa phân loại', divider: albums.length > 0, run: run(() => movePhotos(ids, null)) },
      ],
    })
  }

  const openTileMenu = useCallback((photo: Photo, x: number, y: number) => {
    const s = useStore.getState()
    const inCollage = s.selected.includes(photo.id)
    const ids = movingIds(photo.id, pickedRef.current)
    const what = ids.length > 1 ? `${ids.length} ảnh đã chọn` : 'ảnh'
    const current = s.albums.some((a) => a.id === s.photoAlbum[photo.id]) ? s.photoAlbum[photo.id] : null
    const moves: MenuItem[] = [
      ...s.albums
        .filter((a) => ids.length > 1 || a.id !== current)
        .map((a) => ({ label: `Chuyển ${what} vào “${a.name}”`, run: () => movePhotos(ids, a.id) })),
      { label: `Chuyển ${what} vào album mới…`, run: () => newAlbum(ids) },
      ...(ids.length > 1 || current !== null ? [{ label: `Đưa ${what} về Chưa phân loại`, run: () => movePhotos(ids, null) }] : []),
    ]
    moves[0].divider = true
    setMenu({
      x,
      y,
      items: [
        ...(s.selected.length === 1 && inCollage ? [] : [{ label: 'Mở riêng ảnh này', run: () => s.replaceSelection([photo.id]) }]),
        ...(!inCollage && s.selected.length > 0 ? [{ label: 'Thêm vào bản ghép', run: () => s.toggleSelect(photo.id) }] : []),
        ...(pickedRef.current?.has(photo.id) ? [] : [{ label: 'Chọn ảnh này', run: () => onPick(photo.id, false) }]),
        ...(inCollage ? [{ label: 'Bỏ khỏi bản ghép', run: () => s.deselect(photo.id) }] : []),
        ...(photo.missing || !desktop.features.reveal ? [] : [{ label: 'Mở thư mục chứa ảnh', run: () => void desktop.library.reveal(photo.id) }]),
        ...moves,
        { label: ids.length > 1 ? `Xoá ${ids.length} ảnh khỏi thư viện` : 'Xoá khỏi thư viện', danger: true, divider: true, run: () => setDoomed(ids) },
      ],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dropAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? null
  const onPointerDown = (e: ReactPointerEvent) => {
    // Màn cảm ứng: vuốt là để cuộn danh sách; chuyển album thì dùng menu (nhấn giữ).
    if (e.button !== 0 || e.pointerType !== 'mouse') return
    const target = e.target as HTMLElement
    if (target.closest('[data-no-drag]')) return
    const tile = target.closest<HTMLElement>('[data-photo]')
    const box = scroller.current!
    const r = box.getBoundingClientRect()
    // Bắt đầu từ chỗ trống = quét chọn; giữ Shift, hoặc đang ở chế độ "Chọn", thì quét được cả khi bắt đầu ngay trên một
    // ảnh. Bấm vào thanh cuộn thì không.
    if (!tile || e.shiftKey || pickedRef.current) {
      if ((!tile && target.closest('button, input')) || e.clientX > r.left + box.clientWidth) return
      sweep.current = { pointerId: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top + box.scrollTop, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, active: false, ids: [], raf: 0 }
      return
    }
    press.current = { id: tile.dataset.photo!, x: e.clientX, y: e.clientY, pointerId: e.pointerId, ids: null, over: null, cell: null, lastX: e.clientX, lastY: e.clientY, raf: 0 }
  }
  /** Vẽ lại vùng quét theo vị trí con trỏ mới nhất và tìm những ảnh nó chạm tới. */
  const paintSweep = () => {
    const s = sweep.current
    const box = scroller.current
    if (!s || !box) return
    const r = box.getBoundingClientRect()
    const x = Math.min(Math.max(s.cx - r.left, 0), box.clientWidth)
    const y = Math.min(Math.max(s.cy - r.top, 0), box.clientHeight) + box.scrollTop
    const area = { left: Math.min(s.x, x), top: Math.min(s.y, y), right: Math.max(s.x, x), bottom: Math.max(s.y, y) }
    const el = marquee.current
    if (el) {
      el.style.left = `${area.left}px`
      el.style.top = `${area.top}px`
      el.style.width = `${area.right - area.left}px`
      el.style.height = `${area.bottom - area.top}px`
    }
    // Đổi sang toạ độ cửa sổ để so với vị trí thật của từng ô.
    const dx = r.left
    const dy = r.top - box.scrollTop
    const hit = (t: DOMRect) => t.left < area.right + dx && t.right > area.left + dx && t.top < area.bottom + dy && t.bottom > area.top + dy
    const ids: string[] = []
    // Xét theo từng khối trước: khối nằm ngoài vùng quét thì khỏi phải đo từng ô bên trong (thư viện có thể vài nghìn ảnh).
    for (const chunk of box.querySelectorAll<HTMLElement>('ul.tile-chunk')) {
      if (!hit(chunk.getBoundingClientRect())) continue
      for (const tile of chunk.querySelectorAll<HTMLElement>('[data-photo]')) if (hit(tile.getBoundingClientRect())) ids.push(tile.dataset.photo!)
    }
    if (ids.join() === s.ids.join()) return
    s.ids = ids
    setSwept(new Set(ids))
  }
  const onSweepMove = (e: ReactPointerEvent) => {
    const s = sweep.current
    if (!s || e.pointerId !== s.pointerId) return
    s.cx = e.clientX
    s.cy = e.clientY
    if (!s.active) {
      if (Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < DRAG_THRESHOLD) return
      s.active = true
      scroller.current!.setPointerCapture(e.pointerId)
      setSwept(new Set())
      // Quét sát mép trên / dưới thì danh sách tự cuộn để quét tiếp được những ảnh nằm ngoài vùng nhìn.
      const tick = () => {
        const box = scroller.current
        const now = sweep.current
        if (!box || !now) return
        const r = box.getBoundingClientRect()
        const speed = now.cy < r.top + AUTO_SCROLL_EDGE ? now.cy - (r.top + AUTO_SCROLL_EDGE) : now.cy > r.bottom - AUTO_SCROLL_EDGE ? now.cy - (r.bottom - AUTO_SCROLL_EDGE) : 0
        if (speed) {
          box.scrollTop += speed * 0.25
          paintSweep()
        }
        now.raf = requestAnimationFrame(tick)
      }
      s.raf = requestAnimationFrame(tick)
    }
    paintSweep()
  }
  const endSweep = (commit: boolean) => {
    const s = sweep.current
    sweep.current = null
    if (!s?.active) return
    cancelAnimationFrame(s.raf)
    swallowClick.current = true
    setTimeout(() => (swallowClick.current = false))
    setSwept(null)
    // Quét = chọn nhiều ảnh: vào chế độ "Chọn" (nếu chưa) với những ảnh vừa quét, rồi ghép / chuyển album / xoá tuỳ ý.
    if (commit && s.ids.length) {
      const next = new Set(pickedRef.current ?? [])
      for (const id of s.ids) next.add(id)
      anchor.current = s.ids[s.ids.length - 1]
      setPicked(next)
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (sweep.current) return onSweepMove(e)
    const p = press.current
    if (!p || e.pointerId !== p.pointerId) return
    if (!p.ids) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return
      p.ids = movingIds(p.id, pickedRef.current)
      scroller.current!.setPointerCapture(e.pointerId)
      // Kéo sát mép thì danh sách tự cuộn, để tới được album nằm ngoài vùng nhìn.
      const tick = () => {
        const box = scroller.current
        if (!box || !press.current) return
        const r = box.getBoundingClientRect()
        const { lastX: x, lastY: y } = press.current
        const speed = y < r.top + AUTO_SCROLL_EDGE ? y - (r.top + AUTO_SCROLL_EDGE) : y > r.bottom - AUTO_SCROLL_EDGE ? y - (r.bottom - AUTO_SCROLL_EDGE) : 0
        // Con trỏ đã sang khung làm việc (đang nhắm một ô) thì danh sách đứng yên.
        if (speed && x >= r.left && x <= r.right) box.scrollTop += speed * 0.25
        press.current.raf = requestAnimationFrame(tick)
      }
      p.raf = requestAnimationFrame(tick)
      setDrag({ ids: p.ids, over: null })
    }
    p.lastX = e.clientX
    p.lastY = e.clientY
    if (ghost.current) ghost.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`
    // Ra khỏi thư viện, lơ lửng trên khung làm việc: ô nằm dưới con trỏ sáng lên, thả là ảnh vào ô đó.
    const cell = stageDropAt(e.clientX, e.clientY)
    if (cell !== p.cell) {
      p.cell = cell
      useStore.setState({ dropTarget: cell })
    }
    const over = cell === null ? dropAt(e.clientX, e.clientY) : null
    if (over !== p.over) {
      p.over = over
      setDrag({ ids: p.ids, over })
    }
  }
  const endDrag = (e: ReactPointerEvent, commit: boolean) => {
    if (sweep.current) return endSweep(commit)
    const p = press.current
    press.current = null
    if (!p?.ids) return
    cancelAnimationFrame(p.raf)
    swallowClick.current = true
    // Cú click (nếu có) tới ngay sau pointerup; không có thì cờ cũng tự hạ để không nuốt nhầm cú bấm sau.
    setTimeout(() => (swallowClick.current = false))
    setDrag(null)
    useStore.setState({ dropTarget: null })
    const cell = commit ? stageDropAt(e.clientX, e.clientY) : null
    // Thả vào khung: chỉ ảnh đang cầm đi vào ô (kéo một ảnh của bản ghép thì cả nhóm đi cùng là chuyện của album).
    if (cell === 'stage') return useStore.getState().replaceSelection([p.id])
    if (cell !== null) return useStore.getState().placePhoto(cell, p.id)
    const over = commit ? dropAt(e.clientX, e.clientY) : null
    if (over === NEW_ALBUM) newAlbum(p.ids)
    else if (over) movePhotos(p.ids, over === UNCATEGORIZED ? null : over)
  }

  const openAlbumMenu = (album: Album, inside: Photo[], x: number, y: number, alignRight?: boolean) =>
    setMenu({
      x,
      y,
      alignRight,
      items: [
        { label: 'Thêm ảnh vào album này…', run: () => void pickPhotos(album.id) },
        { label: 'Đổi tên', run: () => setRenaming(album.id) },
        {
          label: 'Xoá album (ảnh được giữ lại)',
          divider: true,
          run: () => {
            removeAlbum(album.id)
            toast(
              inside.length ? `Đã xoá album “${album.name}”. ${inside.length} ảnh chuyển về Chưa phân loại.` : `Đã xoá album “${album.name}”.`,
              'success',
            )
          },
        },
        ...(inside.length
          ? [{ label: `Xoá ${inside.length} ảnh trong album khỏi thư viện`, danger: true, run: () => setDoomed(inside.map((p) => p.id)) }]
          : []),
      ],
    })

  // Ảnh có thể biến mất trong lúc chờ xác nhận (vd. hoàn tác) → chỉ tính những ảnh còn trong thư viện.
  const doomed = new Set(doomedIds?.filter((id) => byId.has(id)))
  const doomedInCollage = selected.filter((id) => doomed.has(id)).length
  useEffect(() => {
    if (!doomedIds) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setDoomed(null)
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [doomedIds])

  const pending = imports.filter((u) => u.status === 'processing')
  const failed = imports.filter((u) => u.status === 'error')
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const target = ROW_TARGET[zoom] ?? ROW_TARGET[1]

  /**
   * Lưới ảnh của một mục: xếp thành hàng giữ đúng tỉ lệ từng ảnh (xem `justify`), cắt thành khối vài hàng. Mỗi ô đặt
   * tuyệt đối theo toạ độ tính sẵn nên chiều cao từng khối biết trước, kể cả khi khối chưa được vẽ.
   */
  const grid = (list: Photo[], waiting: ImportItem[]) => {
    if (width <= 0) return null
    // Ảnh đang được chuẩn bị giữ sẵn chỗ ở đầu lưới, xong cái nào hiện cái đó. Chỉ vài ô: nhập cả nghìn ảnh mà vẽ
    // cả nghìn ô nhấp nháy thì chính việc vẽ làm chậm việc nhập (con số đầy đủ đã có ở dòng "Đang thêm N…").
    const shimmers = waiting.slice(0, MAX_SHIMMERS)
    const aspects = [...shimmers.map(() => 1), ...list.map((p) => p.width / p.height)]
    const rows = justify(aspects, width, target, GAP)
    const chunks: { items: Placed[]; height: number }[] = []
    for (let r = 0; r < rows.length; r += ROWS_PER_CHUNK) {
      const items: Placed[] = []
      let y = 0
      for (const row of rows.slice(r, r + ROWS_PER_CHUNK)) {
        let x = 0
        for (let i = row.start; i < row.start + row.count; i++) {
          const w = tileAspect(aspects[i]) * row.height
          items.push({ index: i, x, y, w, h: row.height })
          x += w + GAP
        }
        y += row.height + GAP
      }
      chunks.push({ items, height: y - GAP })
    }
    return (
      <div className="flex flex-col" style={{ gap: GAP }}>
        {chunks.map(({ items, height }, c) => (
          <ul key={c} className="tile-chunk relative" style={{ height: height + 2 * CHUNK_PAD, margin: -CHUNK_PAD }}>
            {items.map(({ index, x, y, w, h }) => {
              const left = x + CHUNK_PAD
              const top = y + CHUNK_PAD
              if (index < shimmers.length) {
                const u = shimmers[index]
                return (
                  <li
                    key={`pending-${u.key}`}
                    data-tip={`Đang chuẩn bị ${u.name}…`}
                    className="shimmer absolute animate-tile rounded-lg"
                    style={{ left, top, width: w, height: h }}
                  />
                )
              }
              const photo = list[index - shimmers.length]
              return (
                <Tile
                  key={photo.id}
                  photo={photo}
                  x={left}
                  y={top}
                  w={w}
                  h={h}
                  selected={picked ? picked.has(photo.id) : selectedSet.has(photo.id)}
                  slot={picked ? 0 : selected.indexOf(photo.id) + 1}
                  swept={!!swept && swept.has(photo.id)}
                  doomed={doomed.has(photo.id)}
                  picking={picking}
                  index={index - shimmers.length}
                  moving={!!drag && drag.ids.includes(photo.id)}
                  onActivate={onActivate}
                  onMenu={openTileMenu}
                />
              )
            })}
          </ul>
        ))}
      </div>
    )
  }
  const waitingFor = (album: Album | null) =>
    searching ? [] : pending.filter((u) => (album ? u.albumId === album.id : !albums.some((a) => a.id === u.albumId)))

  const pickedCount = picked?.size ?? 0
  const allPicked = !!picked && order.length > 0 && order.every((id) => picked.has(id))
  /** Ảnh đang chọn theo thứ tự trên màn hình (thứ tự ghép). */
  const pickedInOrder = () => [...order.filter((id) => picked?.has(id)), ...[...(picked ?? [])].filter((id) => !order.includes(id))]

  const compose = () => {
    replaceSelection(pickedInOrder())
    stopPicking()
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Một hàng công cụ gọn; hướng dẫn chi tiết nằm ở trạng thái trống, tooltip và nút "?" để nhường chỗ cho ảnh. */}
      <div className="flex items-center gap-0.5 px-3 py-2.5 lg:px-4">
        <Button
          variant="primary"
          data-tip="Bấm để chọn ảnh, hoặc kéo thả ảnh / thư mục vào cửa sổ"
          onClick={() => void pickPhotos()}
          className="h-9 shrink-0 gap-1.5 pl-3 pr-3.5 text-[13px]"
        >
          <ImagePlus className="size-4" />
          Thêm ảnh
        </Button>
        {desktop.library.pickFolder && (
          <button
            type="button"
            aria-label="Thêm cả thư mục ảnh"
            data-tip="Thêm cả thư mục: chỉ cần cho phép một lần cho mọi ảnh bên trong"
            onClick={() => void pickFolder()}
            className="ml-1 grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-sand hover:text-ink"
          >
            <FolderOpen className="size-4" />
          </button>
        )}
        <span className="min-w-0 flex-1 truncate px-2 text-xs tabular-nums text-muted">
          {pending.length
            ? `Đang thêm ${pending.length}…`
            : searching
              ? `${visible.length}/${photos.length}`
              : photos.length
                ? `${photos.length} ảnh`
                : ''}
        </span>
        {photos.length > 0 && (
          <button
            type="button"
            aria-pressed={picking}
            data-tip={picking ? 'Thoát chế độ chọn (Esc)' : 'Chọn nhiều ảnh để ghép, chuyển album hoặc xoá một lượt'}
            aria-label={picking ? 'Thoát chế độ chọn' : 'Chọn nhiều ảnh'}
            onClick={() => (picking ? stopPicking() : startPicking())}
            className={cx(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold transition-colors',
              picking ? 'bg-ink text-paper' : 'text-soft hover:bg-sand hover:text-ink',
            )}
          >
            <ListChecks className="size-4" />
            Chọn
          </button>
        )}
        <button type="button" aria-label="Tạo album" data-tip="Tạo album để phân loại ảnh" onClick={() => newAlbum()} className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-sand hover:text-ink">
          <FolderPlus className="size-4" />
        </button>
        {photos.length > 0 && (
          <button
            type="button"
            aria-label="Xoá ảnh khỏi thư viện"
            aria-haspopup="menu"
            data-tip="Xoá ảnh khỏi thư viện…"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              deleteMenu(r.right, r.bottom + 6)
            }}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-sand hover:text-danger"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {/* Tìm ảnh + cỡ ảnh: thư viện vài nghìn ảnh thì cuộn tìm bằng mắt là không xong. */}
      {photos.length > 0 && (
        <div className="flex items-center gap-0.5 px-3 pb-2.5 lg:px-4">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Phím gõ không được lọt ra phím tắt toàn cục (Esc bỏ chọn ô, Delete bỏ ảnh…).
                e.stopPropagation()
                if (e.key === 'Escape') setQuery('')
              }}
              placeholder="Tìm tên, thư mục, máy, ngày chụp…"
              aria-label="Tìm ảnh"
              data-tip="Gõ tên file (DSCF33), thư mục, máy / ống kính (X-T5), giả lập phim, hoặc ngày chụp (28/03/2026)"
              className="h-8 w-full rounded-full border border-line bg-surface pl-8 pr-7 text-[13px] text-ink outline-none transition-shadow placeholder:text-muted focus:border-coral focus:ring-4 focus:ring-coral/15"
            />
            {query && (
              <button
                type="button"
                aria-label="Xoá từ khoá"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-sand hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <button
            type="button"
            aria-label="Cỡ ảnh"
            aria-haspopup="menu"
            data-tip="Cỡ ảnh"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setMenu({
                x: r.right,
                y: r.bottom + 6,
                alignRight: true,
                items: SIZES.map((v) => ({ label: v.label, icon: v.icon, checked: v.zoom === zoom, run: () => set({ libraryZoom: v.zoom }) })),
              })
            }}
            className="ml-1 flex h-8 shrink-0 items-center gap-0.5 rounded-full px-2 text-muted transition-colors hover:bg-sand hover:text-ink"
          >
            {(SIZES.find((v) => v.zoom === zoom) ?? SIZES[1]).icon}
            <ChevronDown className="size-3" />
          </button>
        </div>
      )}

      {doomed.size > 0 ? (
        <div role="alertdialog" aria-label="Xác nhận xoá ảnh" className="animate-fade border-t border-line bg-blush px-3 py-2.5 lg:px-4">
          <p className="text-[13px] font-semibold text-ink">
            Xoá {doomed.size === photos.length && doomed.size > 1 ? `tất cả ${doomed.size}` : doomed.size} ảnh khỏi thư viện?
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-soft">
            File gốc vẫn còn nguyên trên máy.
            {doomedInCollage > 0 && ` ${doomedInCollage} ảnh đang dùng trong bố cục cũng sẽ bị bỏ ra.`}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => setDoomed(null)}
              className="h-8 flex-1 rounded-full border border-line bg-card text-[13px] font-semibold text-ink hover:bg-surface"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={() => {
                setDoomed(null)
                if (picked && [...doomed].some((id) => picked.has(id))) stopPicking()
                void deletePhotos([...doomed])
              }}
              className="h-8 flex-1 rounded-full bg-danger text-[13px] font-bold text-white hover:brightness-110"
            >
              Xoá
            </button>
          </div>
        </div>
      ) : (
        // Ảnh đang dùng trong bản ghép, hiện thành một dải nhỏ: bỏ bớt hay tìm lại ảnh mà không phải cuộn cả thư viện.
        // Một ảnh thì chỉ cần dòng đếm (ảnh đó đã có viền + số trong lưới), từ hai ảnh mới hiện dải ảnh nhỏ.
        (replacing || selected.length > 0 || emptySlots > 0) && (
          <div className="animate-fade border-t border-line px-3 pb-1.5 pt-2 lg:px-4">
            <div className="flex items-center justify-between gap-2 text-[13px] text-soft">
              {replacing ? (
                <b className="text-coral-dark">{fillingEmpty ? 'Bấm ảnh để đưa vào ô trống' : 'Bấm ảnh để đổi ảnh cho ô'}</b>
              ) : emptySlots > 0 ? (
                <b className="text-coral-dark">Bấm ảnh để lấp {emptySlots} ô trống</b>
              ) : (
                <span>
                  Trong bố cục <b className="text-ink">{selected.length}</b>/{MAX_PHOTOS} ảnh
                </span>
              )}
              {slots.length > 0 && (
                <button type="button" onClick={clearSelection} className="shrink-0 whitespace-nowrap font-semibold text-coral-dark hover:underline">
                  Bỏ hết
                </button>
              )}
            </div>
            {selected.length > 1 && (
              <ul aria-label="Ảnh trong bố cục" className="scroll-soft -mx-1 mt-1 flex gap-1.5 overflow-x-auto px-1 pb-1 pt-1.5">
                {selected.map((id) => (
                  <TrayItem key={id} id={id} name={byId.get(id)?.name ?? ''} onLocate={locate} />
                ))}
              </ul>
            )}
          </div>
        )
      )}

      <div
        ref={scroller}
        className={cx(
          'scroll-soft relative min-h-0 flex-1 select-none overflow-y-auto border-t border-line px-3 lg:px-4',
          // Chừa chỗ cho thanh thao tác nổi ở đáy.
          picking ? 'pb-20' : 'pb-4',
          drag && 'cursor-grabbing',
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, true)}
        onPointerCancel={(e) => endDrag(e, false)}
        onClickCapture={(e) => {
          if (!swallowClick.current) return
          swallowClick.current = false
          e.stopPropagation()
          e.preventDefault()
        }}
      >
        {/* Đo bề rộng vùng lưới. */}
        <div ref={measure} aria-hidden className="h-0" />
        {failed.length > 0 && (
          <ul className="mb-3 mt-1 space-y-1.5">
            {failed.map((u) => (
              <li key={u.key} className="flex animate-fade items-center gap-2.5 rounded-xl bg-blush px-3 py-2 text-[13px] text-coral-dark">
                <CircleAlert className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{u.name}</span>
                  <span className="block text-[11px]">{u.error}</span>
                </span>
                <button type="button" aria-label="Đóng" onClick={() => dismissImport(u.key)}>
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {albums.length === 0 && photos.length === 0 && imports.length === 0 ? (
          // Thư viện trống: lời mời thêm ảnh và các bước nằm ở khung làm việc bên cạnh, ở đây không lặp lại.
          <p className="mt-6 text-center text-xs text-muted">Chưa có ảnh nào</p>
        ) : searching && !visible.length ? (
          <p className="mt-6 px-4 text-center text-[13px] leading-relaxed text-soft">
            Không có ảnh nào khớp “{query.trim()}”.
            <br />
            <span className="text-muted">Thử tên file, tên thư mục, máy ảnh hoặc ngày chụp (vd. 28/03/2026).</span>
          </p>
        ) : (
          <div className="space-y-1">
            {shown.map(({ album, photos: inside }) => {
              const waiting = waitingFor(album)
              const id = album?.id ?? UNCATEGORIZED
              return (
                <Section
                  key={id}
                  album={album}
                  // Chưa có album nào: một lưới duy nhất, không cần tiêu đề mục. Vẫn dùng cùng cấu trúc để lúc tạo album
                  // đầu tiên React không phải dựng lại toàn bộ ô ảnh.
                  bare={albums.length === 0}
                  count={inside.length}
                  collapsed={isCollapsed(id)}
                  editing={!!album && renaming === album.id}
                  over={drag?.over === id}
                  onStartRename={() => album && setRenaming(album.id)}
                  onRename={(name) => {
                    if (album && name !== null) renameAlbum(album.id, name)
                    setRenaming(null)
                  }}
                  onMenu={(x, y, alignRight) => album && openAlbumMenu(album, inside, x, y, alignRight)}
                >
                  {inside.length || waiting.length ? (
                    grid(inside, waiting)
                  ) : (
                    <p className="rounded-lg border border-dashed border-edge px-2 py-1.5 text-center text-xs text-muted">
                      {album ? 'Trống · kéo ảnh vào đây' : 'Mọi ảnh đã được xếp vào album'}
                    </p>
                  )}
                </Section>
              )
            })}
          </div>
        )}
        {swept && <div ref={marquee} className="pointer-events-none absolute z-20 rounded-md border border-coral bg-coral/15" />}
        {/* Chỉ hiện trong lúc kéo ảnh, dính ở đáy danh sách: thả vào đây = tạo album mới chứa luôn những ảnh đó. */}
        {drag && (
          <div
            data-drop={NEW_ALBUM}
            className={cx(
              'sticky bottom-0 z-20 mt-3 flex h-11 animate-pop items-center justify-center gap-2 rounded-xl border border-dashed text-[13px] font-semibold shadow-lift backdrop-blur',
              drag.over === NEW_ALBUM ? 'border-coral bg-blush text-coral-dark' : 'border-edge bg-card/95 text-soft',
            )}
          >
            <FolderPlus className="size-4" />
            Thả vào đây để tạo album mới
          </div>
        )}
      </div>

      {/* Chế độ "Chọn": thanh nổi ở đáy, chỉ có icon (rê chuột để xem chú thích). */}
      {picked && (
        <div
          role="toolbar"
          aria-label="Thao tác với ảnh đã chọn"
          className="absolute inset-x-3 bottom-3 z-30 flex animate-pop items-center gap-0.5 rounded-2xl bg-[#1b1b2b] p-1.5 text-white shadow-lift dark:bg-[#2b2e40] dark:ring-1 dark:ring-white/10 lg:inset-x-4"
        >
          <BarButton label="Thoát chế độ chọn (Esc)" onClick={stopPicking}>
            <X className="size-4.5" />
          </BarButton>
          <span className="min-w-0 flex-1 truncate px-1.5 text-[13px] font-semibold tabular-nums">
            {pickedCount ? `Đã chọn ${pickedCount}` : 'Chọn ảnh…'}
          </span>
          {/* Việc chính của chế độ này nên là nút duy nhất có chữ. aria-disabled: nút bị khoá vẫn hiện được chú thích. */}
          <button
            type="button"
            aria-disabled={!pickedCount || pickedCount > MAX_PHOTOS}
            data-tip={
              pickedCount > MAX_PHOTOS
                ? `Ghép tối đa ${MAX_PHOTOS} ảnh: bỏ bớt ${pickedCount - MAX_PHOTOS} ảnh`
                : pickedCount
                  ? `Ghép ${pickedCount} ảnh này thành một ảnh`
                  : 'Tích chọn ảnh trước'
            }
            onClick={() => pickedCount > 0 && pickedCount <= MAX_PHOTOS && compose()}
            className={cx(
              'mr-0.5 flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white pl-2.5 pr-3.5 text-[13px] font-bold text-[#1b1b2b] transition',
              !pickedCount || pickedCount > MAX_PHOTOS ? 'cursor-default opacity-35' : 'hover:brightness-95 active:scale-95',
            )}
          >
            <ComposeIcon className="size-4.5" />
            Ghép
          </button>
          <BarButton
            label={`${allPicked ? 'Bỏ chọn hết' : searching ? 'Chọn hết kết quả tìm' : 'Chọn hết'} (Ctrl+A)`}
            disabled={!order.length}
            onClick={() => setPicked(allPicked ? new Set() : new Set([...(picked ?? []), ...order]))}
          >
            <CheckCheck className="size-4.5" />
          </BarButton>
          <BarButton
            label="Chuyển vào album"
            disabled={!pickedCount}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              albumMenu(pickedInOrder(), r.left, r.top - (albums.length + 2) * 36 - 18, stopPicking)
            }}
          >
            <FolderInput className="size-4.5" />
          </BarButton>
          <BarButton label="Xoá khỏi thư viện" danger disabled={!pickedCount} onClick={() => setDoomed(pickedInOrder())}>
            <Trash2 className="size-4.5" />
          </BarButton>
        </div>
      )}

      {/* Hình bay theo con trỏ khi kéo ảnh sang album khác hoặc vào khung. */}
      {drag &&
        createPortal(
          <div ref={ghost} className="pointer-events-none fixed left-0 top-0 z-50" style={{ transform: `translate(${press.current?.x ?? 0}px, ${press.current?.y ?? 0}px)` }}>
            <div className="relative size-14 animate-pop">
              <img src={thumbUrl(press.current?.id ?? drag.ids[0]) || undefined} alt="" className="size-full rounded-xl object-cover shadow-lift ring-2 ring-white" />
              {drag.ids.length > 1 && !overStage && (
                <span className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-coral px-1.5 text-xs font-bold text-white shadow">
                  {drag.ids.length}
                </span>
              )}
            </div>
          </div>,
          document.body,
        )}

      {menu && <Menu menu={menu} onClose={closeMenu} />}
    </div>
  )
}
