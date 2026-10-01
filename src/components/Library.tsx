import { CircleAlert, FolderOpen, ImagePlus, TriangleAlert, X } from 'lucide-react'
import { memo, useState } from 'react'
import type { Photo } from '../../shared/types'
import { desktop, prefetchFile, thumbUrl } from '../lib/desktop'
import { MAX_PHOTOS } from '../lib/layout/registry'
import { useStore } from '../store'
import { cx } from './ui'

/** Số ô đầu tiên được hiện lần lượt khi mở app; phần còn lại hiện cùng lúc để không phải chờ. */
const STAGGER = 14

/**
 * Một ảnh trong thư viện. memo: chọn / bỏ chọn một ảnh chỉ vẽ lại đúng những ô có số thứ tự đổi,
 * không vẽ lại cả thư viện vài trăm ảnh.
 */
const Tile = memo(function Tile({ photo, order, index }: { photo: Photo; order: number; index: number }) {
  const [loaded, setLoaded] = useState(false)
  const isSelected = order >= 0
  const { toggleSelect, deletePhotos } = useStore.getState()
  return (
    <li className="tile group relative animate-tile" style={{ animationDelay: `${Math.min(index, STAGGER) * 22}ms` }}>
      <button
        type="button"
        aria-pressed={isSelected}
        aria-label={`${isSelected ? 'Bỏ chọn' : 'Chọn'} ảnh ${photo.name}`}
        onPointerEnter={() => prefetchFile(photo.id)}
        onClick={() => toggleSelect(photo.id)}
        className={cx(
          'relative block aspect-square w-full overflow-hidden rounded-xl bg-sand transition-[transform,box-shadow] duration-200 ease-glide',
          isSelected ? 'scale-[0.94] ring-[3px] ring-coral ring-offset-2 ring-offset-paper' : 'hover:scale-[1.03] hover:shadow-soft active:scale-[0.97]',
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
          className={cx('size-full object-cover transition-[opacity,transform] duration-300 ease-out', loaded ? 'opacity-100' : 'scale-105 opacity-0')}
        />
        {photo.missing && (
          <span
            title="Không tìm thấy file gốc (đã bị di chuyển hoặc xoá): xuất ảnh sẽ dùng bản xem trước"
            className="absolute bottom-1 left-1 grid size-5 place-items-center rounded-full bg-amber text-ink"
          >
            <TriangleAlert className="size-3" />
          </span>
        )}
        {isSelected && (
          <span className="absolute left-1.5 top-1.5 grid size-6 animate-pop place-items-center rounded-full gradient-brand text-xs font-bold shadow">
            {order + 1}
          </span>
        )}
      </button>
      <div className="absolute right-1 top-1 flex translate-y-0.5 gap-1 opacity-0 transition-[opacity,transform] duration-150 focus-within:translate-y-0 focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100">
        {!photo.missing && (
          <button
            type="button"
            aria-label={`Mở thư mục chứa ảnh ${photo.name}`}
            title="Mở thư mục chứa ảnh"
            onClick={() => void desktop.library.reveal(photo.id)}
            className="grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/80"
          >
            <FolderOpen className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          aria-label={`Gỡ ảnh ${photo.name} khỏi thư viện`}
          title="Gỡ khỏi thư viện (file gốc vẫn còn nguyên trên máy)"
          onClick={() => void deletePhotos([photo.id])}
          className="grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-danger"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </li>
  )
})

export function Library() {
  const photos = useStore((s) => s.photos)
  const imports = useStore((s) => s.imports)
  const selected = useStore((s) => s.selected)
  const replacing = useStore((s) => s.activeCell !== null)
  const { pickPhotos, dismissImport, clearSelection } = useStore.getState()

  const pending = imports.filter((u) => u.status === 'processing')
  const failed = imports.filter((u) => u.status === 'error')

  return (
    <div className="flex h-full flex-col">
      <div className="p-3 lg:p-4 lg:pb-3">
        <button
          type="button"
          onClick={() => void pickPhotos()}
          className="group flex w-full min-w-0 items-center gap-3 rounded-2xl border-2 border-dashed border-edge bg-card px-3 py-2.5 text-left transition-all duration-200 hover:border-coral hover:bg-surface active:scale-[0.98] lg:px-4 lg:py-4"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full gradient-brand glow-brand transition-transform duration-300 ease-glide group-hover:rotate-6 group-hover:scale-110 lg:size-11">
            <ImagePlus className="size-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Thêm ảnh</span>
            <span className="hidden text-xs text-muted lg:block">Bấm để chọn, hoặc kéo thả ảnh / thư mục vào cửa sổ</span>
          </span>
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-line px-3 py-2 lg:px-4 lg:py-2.5">
        <p className="text-[13px] text-soft">
          {replacing ? (
            <b className="text-coral-dark">Bấm ảnh để đưa vào ô đang chọn</b>
          ) : selected.length ? (
            <>
              Đã chọn <b className="text-ink">{selected.length}</b>/{MAX_PHOTOS} ảnh
            </>
          ) : pending.length ? (
            <>Đang thêm {pending.length} ảnh…</>
          ) : (
            <>{photos.length} ảnh · bấm để chọn</>
          )}
        </p>
        {selected.length > 0 && (
          <button type="button" onClick={clearSelection} className="shrink-0 whitespace-nowrap pl-2 text-[13px] font-semibold text-coral-dark hover:underline">
            Bỏ chọn
          </button>
        )}
      </div>

      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-1 lg:px-4">
        {failed.length > 0 && (
          <ul className="mb-3 space-y-1.5">
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

        {photos.length === 0 && imports.length === 0 ? (
          <div className="mt-10 animate-rise px-4 text-center">
            <p className="font-display text-base font-bold">Thư viện đang trống</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Thêm vài tấm ảnh để bắt đầu ghép. Ảnh được dùng ngay tại chỗ trên máy bạn, không sao chép và không tải đi
              đâu cả.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-3">
            {/* Ảnh đang được chuẩn bị giữ sẵn chỗ trong lưới, xong cái nào hiện cái đó. */}
            {pending.map((u) => (
              <li key={`pending-${u.key}`} title={`Đang chuẩn bị ${u.name}…`} className="shimmer aspect-square animate-tile rounded-xl" />
            ))}
            {photos.map((photo, index) => (
              <Tile key={photo.id} photo={photo} order={selected.indexOf(photo.id)} index={index} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
