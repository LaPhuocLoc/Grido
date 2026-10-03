import { Check, Images, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { designTitle, frameLabel } from '../lib/designs'
import { buildSpec, exportDesigns, hasPhotos } from '../lib/useCollage'
import { canvasSize, useStore, type ExportFormat } from '../store'
import { DesignThumb, THUMB_H } from './Designs'
import { Button, cx } from './ui'

const useBatchExport = create<{ open: boolean }>(() => ({ open: false }))
export const openBatchExport = () => useBatchExport.setState({ open: true })
const close = () => useBatchExport.setState({ open: false })

const FORMAT_NAME: Record<ExportFormat, string> = { 'image/jpeg': 'JPEG', 'image/png': 'PNG' }
const SHARPEN_NAME = { off: 'tắt', low: 'thấp', standard: 'vừa', high: 'cao' } as const

/** Số thiết kế xuất được (đã có ảnh): nút "Xuất nhiều" chỉ hiện khi có từ hai cái trở lên. */
export function useExportableCount() {
  const designs = useStore((s) => s.designs)
  const photos = useStore((s) => s.photos)
  return useMemo(() => designs.filter((d) => hasPhotos(buildSpec({ ...d.snapshot, photos }))).length, [designs, photos])
}

/**
 * Hộp chọn thiết kế để xuất một lượt: mặc định chọn hết, bỏ tích cái không cần rồi bấm Xuất. Mọi file dùng chung cài đặt
 * ở tab Xuất và lưu vào thư mục xuất.
 */
export function BatchExportDialog() {
  const open = useBatchExport((s) => s.open)
  const designs = useStore((s) => s.designs)
  const photos = useStore((s) => s.photos)
  const format = useStore((s) => s.exportFormat)
  const quality = useStore((s) => s.exportQuality)
  const sharpen = useStore((s) => s.exportSharpen)
  const ready = useMemo(() => designs.filter((d) => hasPhotos(buildSpec({ ...d.snapshot, photos }))), [designs, photos])
  const [picked, setPicked] = useState<Set<string>>(new Set())

  // Mỗi lần mở: chọn sẵn tất cả.
  useEffect(() => {
    if (!open) return
    setPicked(new Set(ready.map((d) => d.id)))
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  if (!open) return null

  const count = ready.filter((d) => picked.has(d.id)).length
  const all = count === ready.length
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return createPortal(
    <div className="no-drag fixed inset-0 z-[65] grid animate-overlay place-items-center bg-black/45 p-4 sm:p-6" onPointerDown={close}>
      <div
        role="dialog"
        aria-labelledby="batch-title"
        className="flex max-h-full w-full max-w-2xl animate-pop flex-col rounded-3xl border border-line bg-card shadow-lift"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 pt-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blush text-coral-dark">
            <Images className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="batch-title" className="font-display text-lg font-bold text-ink">
              Xuất nhiều thiết kế
            </h2>
            <p className="text-xs text-muted">
              {FORMAT_NAME[format]}
              {format !== 'image/png' && ` ${Math.round(quality * 100)}%`} · làm nét {SHARPEN_NAME[sharpen]} · đổi ở tab Xuất
            </p>
          </div>
          <button type="button" aria-label="Đóng" onClick={close} className="-mr-2 -mt-1 grid size-8 place-items-center rounded-full text-muted hover:bg-sand hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between px-6 text-[13px]">
          <span className="text-soft">
            Đã chọn <b className="text-ink tabular-nums">{count}</b>/{ready.length}
          </span>
          <button
            type="button"
            onClick={() => setPicked(all ? new Set() : new Set(ready.map((d) => d.id)))}
            className="font-semibold text-coral-dark hover:underline"
          >
            {all ? 'Bỏ chọn hết' : 'Chọn hết'}
          </button>
        </div>

        <ul className="scroll-soft mt-2 grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-2.5 gap-y-3 overflow-y-auto px-6 py-2">
          {ready.map((d) => {
            const on = picked.has(d.id)
            const title = designTitle(d.name, d.snapshot.texts)
            const size = canvasSize(d.snapshot)
            return (
              <li key={d.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={title}
                  onClick={() => toggle(d.id)}
                  className="group block w-full text-left"
                >
                  <span
                    className={cx(
                      'relative grid w-full place-items-center rounded-2xl border transition-all',
                      on ? 'border-coral bg-blush ring-2 ring-coral' : 'border-line bg-sand opacity-60 hover:opacity-100',
                    )}
                    style={{ height: THUMB_H + 20 }}
                  >
                    <DesignThumb snapshot={d.snapshot} photos={photos} />
                    <span
                      className={cx(
                        'absolute left-2 top-2 grid size-5.5 place-items-center rounded-md border-2 transition-colors',
                        on ? 'border-coral bg-coral text-white' : 'border-white/90 bg-black/30 text-transparent',
                      )}
                    >
                      <Check className="size-3.5" strokeWidth={3.5} />
                    </span>
                  </span>
                  <span className="block truncate px-0.5 pt-1.5 text-[13px] font-semibold text-ink">{title}</span>
                  <span className="block truncate px-0.5 text-[11px] text-muted">{frameLabel(d.snapshot.presetId, size.width, size.height)}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="border-t border-line px-6 py-4">
          <Button
            variant="primary"
            disabled={!count}
            className="h-11 w-full text-[14px]"
            onClick={() => {
              const ids = ready.filter((d) => picked.has(d.id)).map((d) => d.id)
              close()
              void exportDesigns(ids)
            }}
          >
            {count ? `Xuất ${count} ảnh` : 'Chọn thiết kế để xuất'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
