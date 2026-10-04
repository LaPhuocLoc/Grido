import { Check, Copy, Download, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { memo, useMemo, useRef, useState } from 'react'
import type { Photo } from '../../shared/types'
import { thumbUrl, useUrlVersion } from '../lib/desktop'
import { designTitle, sizeLabel } from '../lib/designs'
import { placeImage } from '../lib/geometry'
import { collageLayout } from '../lib/imaging/exportCollage'
import { textLayoutStyle } from '../lib/text'
import { buildSpec, canExportMany, useExportProgress } from '../lib/useCollage'
import { openBatchExport, useExportableCount } from './BatchExport'
import { isKeeper, outputSize, photosIn, useStore, type Design, type Snapshot } from '../store'
import { FrameBackdrop, FrameLayer } from './FrameLayer'
import { imageStyle } from './imageStyle'
import { Button, cx } from './ui'

/** Vùng dành cho ảnh thu nhỏ trong thẻ thiết kế (px); ảnh ghép nằm gọn bên trong, giữ đúng tỉ lệ khung. */
export const THUMB_W = 132
export const THUMB_H = 108

/** Bỏ dấu để gõ "da lat" vẫn ra "Đà Lạt". */
const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()

/** Ảnh thu nhỏ của một thiết kế, dựng từ thumbnail trong thư viện theo đúng bố cục, khung và chữ đã lưu; nằm gọn trong `width` × `height`. */
export const DesignThumb = memo(function DesignThumb({
  snapshot,
  photos,
  width = THUMB_W,
  height = THUMB_H,
}: {
  snapshot: Snapshot
  photos: Photo[]
  width?: number
  height?: number
}) {
  useUrlVersion()
  const spec = useMemo(() => buildSpec({ ...snapshot, photos }), [snapshot, photos])
  const layout = useMemo(() => (spec ? collageLayout(spec) : null), [spec])
  if (!spec || !layout) return null
  const k = Math.min(width / spec.width, height / spec.height)
  return (
    <span
      className="relative block overflow-hidden rounded-[3px] shadow-[0_2px_10px_rgb(0_0_0/0.28)]"
      style={{ width: spec.width * k, height: spec.height * k, background: spec.bg }}
    >
      <FrameBackdrop spec={spec} k={k} />
      {spec.cells.map((cell, i) => {
        const rect = layout.cells[i]
        if (!rect || !cell) return null
        const placed = placeImage(cell.photo.width, cell.photo.height, rect.w * k, rect.h * k, cell.adjust)
        return (
          <span
            key={cell.photo.id}
            className="absolute overflow-hidden"
            style={{
              left: rect.x * k,
              top: rect.y * k,
              width: rect.w * k,
              height: rect.h * k,
              borderRadius: Math.min(spec.radius, rect.w / 2, rect.h / 2) * k,
            }}
          >
            <img
              src={thumbUrl(cell.photo.id) || undefined}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="absolute left-0 top-0 max-w-none"
              style={imageStyle(placed, cell.adjust)}
            />
          </span>
        )
      })}
      <FrameLayer spec={spec} k={k} />
      {spec.texts.map((t) => (
        <span
          key={t.id}
          className="absolute"
          style={{
            left: t.x * spec.width * k,
            top: t.y * spec.height * k,
            transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
            ...textLayoutStyle(t, (Math.min(spec.width, spec.height) * t.size * k) / 100, t.width === null ? null : t.width * spec.width * k),
            minWidth: undefined,
            minHeight: undefined,
            opacity: t.opacity / 100,
            color: t.color,
          }}
        >
          {t.text}
        </span>
      ))}
    </span>
  )
})

function NameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const cancelled = useRef(false)
  return (
    <input
      autoFocus
      defaultValue={initial}
      maxLength={60}
      aria-label="Tên thiết kế"
      placeholder="Để trống = tự đặt theo chữ trên ảnh"
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
      className="h-7 w-full min-w-0 rounded-lg border border-coral bg-surface px-2 text-[13px] font-semibold text-ink outline-none ring-4 ring-coral/15 placeholder:font-normal placeholder:text-muted"
    />
  )
}

const action =
  'grid size-7 place-items-center rounded-full bg-card text-soft shadow-sm transition-all hover:scale-110 hover:text-ink active:scale-90'

function DesignCard({ design, photos, current }: { design: Design; photos: Photo[]; current: boolean }) {
  const { openDesign, renameDesign, duplicateDesign, removeDesign } = useStore.getState()
  const [renaming, setRenaming] = useState(false)
  const { snapshot } = design
  const title = designTitle(design.name, snapshot.texts)
  const size = outputSize(snapshot)
  const count = photosIn(snapshot.selected).length

  return (
    <div className="group relative">
      <button
        type="button"
        aria-pressed={current}
        aria-label={current ? `${title} (đang mở)` : `Mở thiết kế ${title}`}
        onClick={() => openDesign(design.id)}
        className={cx(
          'grid w-full place-items-center rounded-2xl border transition-all',
          current ? 'border-coral bg-blush shadow-sm' : 'border-line bg-sand hover:border-edge hover:shadow-sm',
        )}
        style={{ height: THUMB_H + 20 }}
      >
        {count ? (
          <DesignThumb snapshot={snapshot} photos={photos} />
        ) : (
          // Đã bỏ hết ảnh: thiết kế vẫn còn (khung, viền, chữ), chỉ chờ chọn ảnh khác.
          <span className="grid place-items-center rounded-[3px] border border-dashed border-edge px-2 text-center text-[11px] font-medium leading-snug text-muted" style={{ width: THUMB_W * 0.62, height: THUMB_H }}>
            Chưa có ảnh
          </span>
        )}
      </button>
      {current && (
        <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-coral px-2 py-0.5 text-[10px] font-bold text-white shadow">
          <Check className="size-3" strokeWidth={3} />
          Đang mở
        </span>
      )}
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <button type="button" aria-label={`Đổi tên ${title}`} data-tip="Đổi tên" className={action} onClick={() => setRenaming(true)}>
          <Pencil className="size-3.5" />
        </button>
        <button type="button" aria-label={`Nhân bản ${title}`} data-tip="Nhân bản" className={action} onClick={() => duplicateDesign(design.id)}>
          <Copy className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Xoá ${title}`}
          data-tip="Xoá thiết kế (ảnh vẫn còn trong thư viện)"
          className={cx(action, 'hover:!text-coral-dark')}
          onClick={() => removeDesign(design.id)}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="px-0.5 pt-1.5">
        {renaming ? (
          <NameInput
            initial={design.name ?? ''}
            onDone={(name) => {
              setRenaming(false)
              if (name !== null) renameDesign(design.id, name)
            }}
          />
        ) : (
          <p
            className="truncate text-[13px] font-semibold text-ink"
            data-tip={design.name ? title : `${title} · bấm đúp để đặt tên`}
            onDoubleClick={() => setRenaming(true)}
          >
            {title}
          </p>
        )}
        <p className="truncate text-[11px] text-muted">
          {sizeLabel(snapshot.presetId, size.width, size.height)} · {count ? `${count} ảnh` : 'chưa có ảnh'}
        </p>
      </div>
    </div>
  )
}

/** Mục "Thiết kế": mọi ảnh ghép đều tự lưu ở đây, bấm để chuyển qua lại mà không mất cái đang làm dở. */
export function DesignsPanel() {
  const designs = useStore((s) => s.designs)
  const current = useStore((s) => s.currentDesignId)
  const photos = useStore((s) => s.photos)
  const { newDesign } = useStore.getState()
  const exportable = useExportableCount()
  const exporting = useExportProgress((s) => s.progress !== null)
  const [query, setQuery] = useState('')

  // Thiết kế vừa bị bỏ hết ảnh vẫn có mặt (còn chữ hoặc tên): người dùng phải thấy nó vẫn còn đó. Cái trống trơn thì không.
  const listed = useMemo(() => designs.filter(isKeeper), [designs])
  const q = plain(query.trim())
  const shown = q ? listed.filter((d) => plain(designTitle(d.name, d.snapshot.texts)).includes(q)) : listed

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="primary" className="h-11 flex-1" onClick={newDesign}>
          <Plus className="size-[18px]" />
          Thiết kế mới
        </Button>
        {canExportMany() && exportable > 1 && (
          <Button
            aria-label="Xuất nhiều thiết kế"
            data-tip="Xuất nhiều thiết kế cùng lúc"
            disabled={exporting}
            className="h-11 w-11 shrink-0 px-0"
            onClick={() => openBatchExport()}
          >
            <Download className="size-[18px]" />
          </Button>
        )}
      </div>

      {listed.length > 6 && (
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Tìm trong ${listed.length} thiết kế`}
            aria-label="Tìm thiết kế"
            className="h-9 w-full rounded-full border border-line bg-surface pl-9 pr-3 text-[13px] focus:border-coral focus:outline-none focus:ring-4 focus:ring-coral/15"
          />
        </label>
      )}

      {shown.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(144px,1fr))] gap-x-2.5 gap-y-4">
          {shown.map((d) => (
            <DesignCard key={d.id} design={d} photos={photos} current={d.id === current} />
          ))}
        </div>
      ) : listed.length ? (
        <p className="py-6 text-center text-[13px] text-muted">Không có thiết kế nào khớp.</p>
      ) : (
        <div className="rounded-2xl bg-sand p-5 text-center">
          <p className="font-display text-base font-bold">Chưa có thiết kế nào</p>
          <p className="mt-1 text-[13px] leading-relaxed text-soft">
            Chọn ảnh ở mục Ảnh để bắt đầu. Tiệm Ghép Ảnh tự lưu mọi thay đổi vào đây, nên bạn chuyển sang thiết kế khác lúc nào cũng được.
          </p>
        </div>
      )}

      {listed.length > 0 && (
        <p className="text-center text-[11px] leading-relaxed text-muted">
          Mọi thay đổi được lưu tự động. Bỏ hết ảnh không làm mất thiết kế; muốn làm cái khác thì bấm Thiết kế mới. Tên lấy theo chữ trên ảnh,
          bấm đúp vào tên để tự đặt.
        </p>
      )}
    </div>
  )
}
