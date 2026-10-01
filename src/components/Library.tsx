import { Check, ChevronDown, CircleAlert, CircleHelp, Ellipsis, FolderPlus, ImagePlus, Lightbulb, Trash2, TriangleAlert, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Photo } from '../../shared/types'
import { groupByAlbum, UNCATEGORIZED, type Album } from '../lib/albums'
import { desktop, prefetchFile, thumbUrl } from '../lib/desktop'
import { MAX_PHOTOS } from '../lib/layout/registry'
import { useStore, type ImportItem } from '../store'
import { Button, cx } from './ui'

/** Số ô đầu tiên được hiện lần lượt khi mở app; phần còn lại hiện cùng lúc để không phải chờ. */
const STAGGER = 14
/** Chỉ những ô đầu danh sách mới có hiệu ứng hiện dần: vài nghìn animation chạy cùng lúc làm cuộn chậm hẳn. */
const ANIMATED_TILES = 24
/**
 * Lưới ảnh được cắt thành từng khối (bội số của 3, 4 và 6 cột): trình duyệt bỏ qua hẳn việc dàn trang + vẽ những khối
 * nằm ngoài vùng nhìn. Đánh dấu theo khối thay vì theo từng ô, vì theo dõi vài nghìn ô riêng lẻ làm cuộn giật.
 */
const CHUNK = 36
/** Chiều cao ước lượng của một hàng ô (ô ~84px + khe 8px) ở bố cục 3 cột, dùng khi khối chưa từng được vẽ. */
const ROW_HEIGHT = 92
/** Vùng thả "tạo album mới từ những ảnh đang kéo". */
const NEW_ALBUM = '__new'
/** Con trỏ phải đi quá bấy nhiêu px mới tính là kéo (để bấm chọn ảnh không bị nhầm thành kéo). */
const DRAG_THRESHOLD = 6
/** Kéo sát mép trên / dưới danh sách trong khoảng này thì danh sách tự cuộn. */
const AUTO_SCROLL_EDGE = 48
const GRID = 'grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-3'

interface MenuItem {
  label: string
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

/** Ảnh sẽ đi cùng khi kéo / chuyển album: kéo một ảnh đã tích thì mang theo mọi ảnh đang tích, không thì chỉ ảnh đó. */
function movingIds(photoId: string): string[] {
  const { selected } = useStore.getState()
  return selected.length > 1 && selected.includes(photoId) ? [...selected] : [photoId]
}

/**
 * Một ảnh trong thư viện. Bấm vào ảnh = đưa vào / bỏ khỏi bố cục; kéo ảnh = chuyển sang album khác;
 * xoá khỏi thư viện là nút thùng rác riêng (hoặc menu chuột phải) nên không thể bấm nhầm.
 * memo: chọn / bỏ chọn một ảnh chỉ vẽ lại đúng ô đó.
 */
const Tile = memo(function Tile({
  photo,
  selected,
  doomed,
  moving,
  index,
  onDelete,
  onMenu,
}: {
  photo: Photo
  selected: boolean
  /** Ảnh đang chờ xác nhận xoá. */
  doomed: boolean
  /** Ảnh đang được kéo sang album khác. */
  moving: boolean
  index: number
  onDelete: (id: string) => void
  onMenu: (photo: Photo, x: number, y: number) => void
}) {
  const [loaded, setLoaded] = useState(false)
  const { toggleSelect } = useStore.getState()
  return (
    <li
      data-photo={photo.id}
      className={cx('tile group relative transition-opacity', index < ANIMATED_TILES && 'animate-tile', moving && 'opacity-35')}
      style={{ animationDelay: `${Math.min(index, STAGGER) * 22}ms` }}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(photo, e.clientX, e.clientY)
      }}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${selected ? 'Bỏ ảnh' : 'Đưa ảnh'} ${photo.name} ${selected ? 'khỏi' : 'vào'} bố cục`}
        onPointerEnter={() => prefetchFile(photo.id)}
        onClick={() => toggleSelect(photo.id)}
        className={cx(
          'relative block aspect-square w-full overflow-hidden rounded-xl bg-sand transition-[transform,box-shadow] duration-200 ease-glide',
          // Thu nhỏ một chút để viền nằm gọn trong ô (thẻ li cắt mọi thứ tràn ra ngoài).
          doomed
            ? 'scale-[0.94] ring-[3px] ring-danger ring-offset-2 ring-offset-paper'
            : selected
              ? 'scale-[0.94] ring-[3px] ring-coral ring-offset-2 ring-offset-paper'
              : 'hover:scale-[1.03] hover:shadow-soft active:scale-[0.97]',
        )}
      >
        <img
          src={thumbUrl(photo.id)}
          title={photo.path}
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
        {photo.missing && (
          <span
            title="Không tìm thấy file gốc (đã bị di chuyển hoặc xoá): xuất ảnh sẽ dùng bản xem trước"
            className="absolute bottom-1 left-1 grid size-5 place-items-center rounded-full bg-amber text-ink"
          >
            <TriangleAlert className="size-3" />
          </span>
        )}
        {/* Dấu tích ở góc: mờ khi chưa chọn, sáng lên khi ảnh đang nằm trong bố cục. */}
        <span
          className={cx(
            'absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full transition-colors duration-150',
            selected ? 'bg-coral text-white shadow' : 'bg-black/40 text-white/55 group-hover:bg-black/60 group-hover:text-white',
          )}
        >
          <Check className="size-3" strokeWidth={3.5} />
        </span>
      </button>
      {!doomed && (
        <button
          type="button"
          aria-label={`Xoá ảnh ${photo.name} khỏi thư viện`}
          title="Xoá khỏi thư viện"
          data-no-drag
          onClick={() => onDelete(photo.id)}
          className="absolute bottom-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-[opacity,background-color] duration-150 hover:bg-danger focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </li>
  )
})

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
        {menu.items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose()
              item.run()
            }}
            className={cx(
              'flex h-9 w-full items-center rounded-xl px-3 text-left text-[13px] font-medium transition-colors hover:bg-sand',
              item.danger ? 'text-danger' : 'text-ink',
              item.divider && 'relative mt-2 before:absolute before:inset-x-2 before:-top-1 before:h-px before:bg-line',
            )}
          >
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}

/** Mọi thao tác của thư viện, gom vào một chỗ để không phải rải chữ hướng dẫn khắp panel. */
const TIPS: [string, string][] = [
  ['Bấm vào ảnh', 'đưa ảnh vào bố cục, bấm lần nữa để bỏ ra'],
  ['Kéo ảnh', 'chuyển sang album khác; tích nhiều ảnh rồi kéo để chuyển cả nhóm'],
  ['Chuột phải vào ảnh', 'chuyển album, mở thư mục chứa ảnh, xoá khỏi thư viện'],
  ['Kéo file vào cửa sổ', 'thêm ảnh hoặc cả thư mục; dán ảnh bằng Ctrl+V cũng được'],
  ['Bấm đúp tên album', 'đổi tên; nút ⋯ để thêm ảnh thẳng vào album hoặc xoá album'],
]

/** Bảng mẹo bung ra dưới nút "?". */
function TipsPopover({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-50" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-label="Mẹo thao tác"
        className="absolute w-72 animate-pop rounded-2xl border border-line bg-card p-4 shadow-lift"
        style={{ top: y, left: Math.max(8, Math.min(x - 288, window.innerWidth - 296)) }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="font-display text-sm font-bold text-ink">Mẹo thao tác</p>
        <dl className="mt-2.5 space-y-2.5">
          {TIPS.map(([action, result]) => (
            <div key={action}>
              <dt className="text-[13px] font-semibold text-ink">{action}</dt>
              <dd className="text-xs leading-snug text-soft">{result}</dd>
            </div>
          ))}
        </dl>
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
            title={album ? 'Bấm đúp để đổi tên' : undefined}
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
      {!collapsed && <div className={bare ? 'pt-2' : 'px-0.5 pb-2 pt-1'}>{children}</div>}
    </section>
  )
}

export function Library() {
  const photos = useStore((s) => s.photos)
  const imports = useStore((s) => s.imports)
  const selected = useStore((s) => s.selected)
  const albums = useStore((s) => s.albums)
  const photoAlbum = useStore((s) => s.photoAlbum)
  const collapsedAlbums = useStore((s) => s.collapsedAlbums)
  const replacing = useStore((s) => s.activeCell !== null)
  const tipSeen = useStore((s) => s.libraryTipSeen)
  const [tips, setTips] = useState<{ x: number; y: number } | null>(null)
  const closeTips = useCallback(() => setTips(null), [])
  const { pickPhotos, dismissImport, clearSelection, deletePhotos, toggleSelect, createAlbum, renameAlbum, removeAlbum, movePhotos, toast } =
    useStore.getState()

  // Mọi kiểu xoá (một ảnh, ảnh đã chọn, cả album, tất cả) đều đi qua cùng một bước xác nhận: ảnh sắp xoá được tô đỏ trong lưới.
  const [doomedIds, setDoomed] = useState<string[] | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** Album đang được đổi tên ngay tại tiêu đề. */
  const [renaming, setRenaming] = useState<string | null>(null)
  /** Ảnh đang được kéo và mục đang nằm dưới con trỏ. Vị trí hình bay theo con trỏ ghi thẳng vào DOM, không qua state. */
  const [drag, setDrag] = useState<{ ids: string[]; over: string | null } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const press = useRef<{ id: string; x: number; y: number; pointerId: number; ids: string[] | null; over: string | null; lastY: number; raf: number } | null>(null)
  // Thả chuột sau khi kéo vẫn sinh ra một cú click lên ảnh → phải nuốt nó, nếu không ảnh bị chọn / bỏ chọn ngoài ý muốn.
  const swallowClick = useRef(false)
  const closeMenu = useCallback(() => setMenu(null), [])
  const askDelete = useCallback((id: string) => setDoomed([id]), [])

  /** Tạo album rồi vào luôn chế độ đặt tên; `ids` là ảnh đưa sẵn vào album mới. */
  const newAlbum = (ids: string[] = []) => {
    const id = createAlbum()
    if (ids.length) movePhotos(ids, id)
    setRenaming(id)
  }

  const openTileMenu = useCallback((photo: Photo, x: number, y: number) => {
    const s = useStore.getState()
    const inCollage = s.selected.includes(photo.id)
    const ids = movingIds(photo.id)
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
        { label: inCollage ? 'Bỏ khỏi bố cục' : 'Đưa vào bố cục', run: () => toggleSelect(photo.id) },
        ...(photo.missing ? [] : [{ label: 'Mở thư mục chứa ảnh', run: () => void desktop.library.reveal(photo.id) }]),
        ...moves,
        { label: 'Xoá khỏi thư viện', danger: true, divider: true, run: () => setDoomed([photo.id]) },
      ],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dropAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? null
  const onPointerDown = (e: ReactPointerEvent) => {
    // Màn cảm ứng: vuốt là để cuộn danh sách; chuyển album thì dùng menu (nhấn giữ).
    if (e.button !== 0 || e.pointerType !== 'mouse') return
    const tile = (e.target as HTMLElement).closest<HTMLElement>('[data-photo]')
    if (!tile || (e.target as HTMLElement).closest('[data-no-drag]')) return
    press.current = { id: tile.dataset.photo!, x: e.clientX, y: e.clientY, pointerId: e.pointerId, ids: null, over: null, lastY: e.clientY, raf: 0 }
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const p = press.current
    if (!p || e.pointerId !== p.pointerId) return
    if (!p.ids) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return
      p.ids = movingIds(p.id)
      scroller.current!.setPointerCapture(e.pointerId)
      // Kéo sát mép thì danh sách tự cuộn, để tới được album nằm ngoài vùng nhìn.
      const tick = () => {
        const box = scroller.current
        if (!box || !press.current) return
        const r = box.getBoundingClientRect()
        const y = press.current.lastY
        const speed = y < r.top + AUTO_SCROLL_EDGE ? y - (r.top + AUTO_SCROLL_EDGE) : y > r.bottom - AUTO_SCROLL_EDGE ? y - (r.bottom - AUTO_SCROLL_EDGE) : 0
        if (speed) box.scrollTop += speed * 0.25
        press.current.raf = requestAnimationFrame(tick)
      }
      p.raf = requestAnimationFrame(tick)
      setDrag({ ids: p.ids, over: null })
    }
    p.lastY = e.clientY
    if (ghost.current) ghost.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`
    const over = dropAt(e.clientX, e.clientY)
    if (over !== p.over) {
      p.over = over
      setDrag({ ids: p.ids, over })
    }
  }
  const endDrag = (e: ReactPointerEvent, commit: boolean) => {
    const p = press.current
    press.current = null
    if (!p?.ids) return
    cancelAnimationFrame(p.raf)
    swallowClick.current = true
    // Cú click (nếu có) tới ngay sau pointerup; không có thì cờ cũng tự hạ để không nuốt nhầm cú bấm sau.
    setTimeout(() => (swallowClick.current = false))
    setDrag(null)
    const over = commit ? dropAt(e.clientX, e.clientY) : null
    if (over === NEW_ALBUM) newAlbum(p.ids)
    else if (over) movePhotos(p.ids, over === UNCATEGORIZED ? null : over)
  }

  const groups = useMemo(() => groupByAlbum(photos, albums, photoAlbum), [photos, albums, photoAlbum])

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
  const doomed = new Set(doomedIds?.filter((id) => photos.some((p) => p.id === id)))
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

  const grid = (list: Photo[], waiting: ImportItem[]) => (
    <div className="space-y-2">
      {Array.from({ length: Math.max(1, Math.ceil(list.length / CHUNK)) }, (_, chunk) => {
        const slice = list.slice(chunk * CHUNK, (chunk + 1) * CHUNK)
        // Ảnh đang được chuẩn bị giữ sẵn chỗ ở đầu lưới, xong cái nào hiện cái đó.
        const shimmers = chunk === 0 ? waiting : []
        const rows = Math.ceil((slice.length + shimmers.length) / 3)
        return (
          <ul key={chunk} className={cx(GRID, 'tile-chunk')} style={{ containIntrinsicSize: `auto ${rows * ROW_HEIGHT - 8}px` }}>
            {shimmers.map((u) => (
              <li key={`pending-${u.key}`} title={`Đang chuẩn bị ${u.name}…`} className="shimmer aspect-square animate-tile rounded-xl" />
            ))}
            {slice.map((photo, index) => (
              <Tile
                key={photo.id}
                photo={photo}
                selected={selectedSet.has(photo.id)}
                doomed={doomed.has(photo.id)}
                index={chunk * CHUNK + index}
                moving={!!drag && drag.ids.includes(photo.id)}
                onDelete={askDelete}
                onMenu={openTileMenu}
              />
            ))}
          </ul>
        )
      })}
    </div>
  )
  const waitingFor = (album: Album | null) =>
    pending.filter((u) => (album ? u.albumId === album.id : !albums.some((a) => a.id === u.albumId)))

  return (
    <div className="flex h-full flex-col">
      {/* Một hàng công cụ gọn; hướng dẫn chi tiết nằm ở trạng thái trống, tooltip và nút "?" để nhường chỗ cho ảnh. */}
      <div className="flex items-center gap-0.5 px-3 py-2.5 lg:px-4">
        <Button
          variant="primary"
          title="Bấm để chọn ảnh, hoặc kéo thả ảnh / thư mục vào cửa sổ"
          onClick={() => void pickPhotos()}
          className="h-9 shrink-0 gap-1.5 pl-3 pr-3.5 text-[13px]"
        >
          <ImagePlus className="size-4" />
          Thêm ảnh
        </Button>
        <span className="min-w-0 flex-1 truncate px-2 text-xs tabular-nums text-muted">
          {pending.length ? `Đang thêm ${pending.length}…` : photos.length ? `${photos.length} ảnh` : ''}
        </span>
        <button type="button" aria-label="Tạo album" title="Tạo album để phân loại ảnh" onClick={() => newAlbum()} className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-sand hover:text-ink">
          <FolderPlus className="size-4" />
        </button>
        {photos.length > 0 && (
          <button
            type="button"
            aria-label="Xoá ảnh khỏi thư viện"
            aria-haspopup="menu"
            title="Xoá ảnh khỏi thư viện…"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setMenu({
                x: r.right,
                y: r.bottom + 6,
                alignRight: true,
                items: [
                  ...(selected.length
                    ? [{ label: `Xoá ${selected.length} ảnh đã chọn`, danger: true, run: () => setDoomed([...useStore.getState().selected]) }]
                    : []),
                  { label: `Xoá tất cả ${photos.length} ảnh`, danger: true, run: () => setDoomed(useStore.getState().photos.map((p) => p.id)) },
                ],
              })
            }}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-sand hover:text-danger"
          >
            <Trash2 className="size-4" />
          </button>
        )}
        <button
          type="button"
          aria-label="Mẹo thao tác"
          aria-haspopup="dialog"
          title="Mẹo thao tác"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setTips({ x: r.right, y: r.bottom + 6 })
          }}
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-sand hover:text-ink"
        >
          <CircleHelp className="size-4" />
        </button>
      </div>

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
                void deletePhotos([...doomed])
              }}
              className="h-8 flex-1 rounded-full bg-danger text-[13px] font-bold text-white hover:brightness-110"
            >
              Xoá
            </button>
          </div>
        </div>
      ) : (
        // Dải trạng thái chỉ hiện khi có điều cần nói: đang chọn ảnh cho bố cục, hoặc đang đổi ảnh cho một ô.
        (replacing || selected.length > 0) && (
          <div className="flex animate-fade items-center justify-between gap-2 border-t border-line px-3 py-1.5 text-[13px] text-soft lg:px-4">
            {replacing ? (
              <b className="text-coral-dark">Bấm ảnh để đổi ảnh cho ô</b>
            ) : (
              <span>
                Đã chọn <b className="text-ink">{selected.length}</b>/{MAX_PHOTOS} ảnh
              </span>
            )}
            {selected.length > 0 && (
              <button type="button" onClick={clearSelection} className="shrink-0 whitespace-nowrap font-semibold text-coral-dark hover:underline">
                Bỏ chọn
              </button>
            )}
          </div>
        )
      )}

      <div
        ref={scroller}
        className={cx('scroll-soft min-h-0 flex-1 overflow-y-auto border-t border-line px-3 pb-4 lg:px-4', drag && 'cursor-grabbing')}
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
            // Thư viện trống thì còn nguyên chỗ: đây là nơi đặt lời mời và hướng dẫn đầy đủ.
            <button
              type="button"
              onClick={() => void pickPhotos()}
              className="group mt-4 flex w-full animate-rise flex-col items-center rounded-2xl border-2 border-dashed border-edge bg-card px-4 py-8 text-center transition-all duration-200 hover:border-coral hover:bg-surface active:scale-[0.98]"
            >
              <span className="grid size-12 place-items-center rounded-full gradient-brand glow-brand transition-transform duration-300 ease-glide group-hover:rotate-6 group-hover:scale-110">
                <ImagePlus className="size-6" />
              </span>
              <span className="mt-4 font-display text-base font-bold text-ink">Thêm ảnh để bắt đầu ghép</span>
              <span className="mt-1 text-[13px] leading-relaxed text-soft">Bấm vào đây để chọn, hoặc kéo thả ảnh / cả thư mục vào cửa sổ.</span>
              <span className="mt-3 text-xs leading-relaxed text-muted">Ảnh được dùng ngay tại chỗ trên máy bạn, không sao chép và không tải đi đâu cả.</span>
            </button>
        ) : (
          <div className="space-y-1">
            {groups.map(({ album, photos: inside }) => {
              const waiting = waitingFor(album)
              return (
                <Section
                  key={album?.id ?? UNCATEGORIZED}
                  album={album}
                  // Chưa có album nào: một lưới duy nhất, không cần tiêu đề mục. Vẫn dùng cùng cấu trúc để lúc tạo album
                  // đầu tiên React không phải dựng lại toàn bộ ô ảnh.
                  bare={albums.length === 0}
                  count={inside.length}
                  collapsed={albums.length > 0 && collapsedAlbums.includes(album?.id ?? UNCATEGORIZED)}
                  editing={!!album && renaming === album.id}
                  over={drag?.over === (album?.id ?? UNCATEGORIZED)}
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

      {/* Mẹo cho người mới: một dải mỏng ở đáy, đóng một lần là thôi; muốn xem lại thì bấm nút "?". */}
      {!tipSeen && photos.length > 0 && (
        <div className="flex animate-fade items-start gap-2 border-t border-line bg-card px-3 py-2 lg:px-4">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber" />
          <p className="min-w-0 flex-1 text-xs leading-snug text-soft">
            <b className="text-ink">Bấm</b> ảnh để ghép · <b className="text-ink">kéo</b> để xếp album · <b className="text-ink">chuột phải</b> để xem thêm
          </p>
          <button
            type="button"
            aria-label="Ẩn mẹo"
            title="Ẩn mẹo (xem lại bằng nút ?)"
            onClick={() => useStore.getState().set({ libraryTipSeen: true })}
            className="-mr-1 grid size-5 shrink-0 place-items-center rounded-full text-muted hover:bg-sand hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {tips && <TipsPopover x={tips.x} y={tips.y} onClose={closeTips} />}

      {/* Hình bay theo con trỏ khi kéo ảnh sang album khác. */}
      {drag &&
        createPortal(
          <div ref={ghost} className="pointer-events-none fixed left-0 top-0 z-50" style={{ transform: `translate(${press.current?.x ?? 0}px, ${press.current?.y ?? 0}px)` }}>
            <div className="relative size-14 animate-pop">
              <img src={thumbUrl(drag.ids[0])} alt="" className="size-full rounded-xl object-cover shadow-lift ring-2 ring-white" />
              {drag.ids.length > 1 && (
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
