import { DatabaseBackup, Eraser, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { desktop } from '../lib/desktop'
import type { StorageUsage } from '../platform/types'
import { restoreState, savedState, useStore } from '../store'
import { Button } from './ui'

const megabytes = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`)

/**
 * Bản web: thư viện, thiết kế và cài đặt nằm trong bộ nhớ của trình duyệt (không có thư mục dữ liệu để mở như bản desktop).
 * Hộp thoại này cho xem đang dùng bao nhiêu, và sao lưu / khôi phục ra file để không mất khi xoá dữ liệu duyệt web hay đổi máy.
 */
export function DataDialog({ onClose }: { onClose: () => void }) {
  const data = desktop.data!
  const { toast } = useStore.getState()
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  /** Đang hỏi lại trước khi khôi phục (thay toàn bộ thiết kế, album, cài đặt hiện tại). */
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = () => void data.usage().then(setUsage, () => {})
  useEffect(refresh, [data])
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  /** Chạy một việc, khoá các nút trong lúc chờ và báo lỗi nếu có. */
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
    } catch (err) {
      toast((err as Error).message || 'Không làm được, thử lại nhé.', 'error')
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const backup = () =>
    run(async () => {
      if (await data.backup(savedState())) toast('Đã lưu file sao lưu. Ảnh gốc không nằm trong file này: chúng vẫn ở nguyên trên máy bạn.', 'success')
    })

  const restore = () =>
    run(async () => {
      const restored = await data.restore()
      setConfirming(false)
      if (!restored) return
      await restoreState(restored.state)
      toast(
        restored.photos
          ? `Đã khôi phục. ${restored.photos} ảnh đang chờ nối lại: thêm lại thư mục chứa ảnh gốc để dùng tiếp.`
          : 'Đã khôi phục thiết kế, album và cài đặt.',
        'success',
      )
      onClose()
    })

  const cleanup = () =>
    run(async () => {
      const removed = await data.cleanup()
      toast(removed ? `Đã dọn ${removed} file thừa.` : 'Không có file thừa nào để dọn.', 'success')
    })

  const row = 'flex items-start gap-3 rounded-2xl border border-line p-3.5'
  return createPortal(
    <div className="no-drag fixed inset-0 z-[70] grid animate-overlay place-items-center bg-black/45 p-6" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-labelledby="data-title"
        className="w-full max-w-md animate-pop rounded-3xl border border-line bg-card p-6 shadow-lift"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="data-title" className="font-display text-lg font-bold text-ink">
            Dữ liệu & sao lưu
          </h2>
          <button type="button" aria-label="Đóng" onClick={onClose} className="grid size-8 place-items-center rounded-full text-muted hover:bg-sand hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 flex gap-2 text-[13px] leading-relaxed text-soft">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-coral-dark" />
          <span>
            Ảnh gốc nằm nguyên trên máy bạn và không tải lên đâu cả. Trình duyệt này chỉ giữ thiết kế, album, cài đặt, và bản xem trước của
            ảnh trong thư viện.
          </span>
        </p>

        <p className="mt-4 rounded-2xl bg-sand px-3.5 py-3 text-[13px] leading-relaxed text-soft">
          {usage ? (
            <>
              <b className="text-ink">{usage.photos} ảnh</b> trong thư viện · đang dùng <b className="text-ink">{megabytes(usage.used)}</b>
              {usage.quota > 0 && <> trong {megabytes(usage.quota)} trình duyệt cho phép</>}.{' '}
              {usage.persisted ? 'Trình duyệt đã cam kết không tự dọn dữ liệu này.' : 'Trình duyệt có thể tự dọn dữ liệu này khi ổ đĩa gần đầy, nên hãy sao lưu.'}
            </>
          ) : (
            'Đang tính dung lượng…'
          )}
        </p>

        <div className="mt-4 space-y-2.5">
          <div className={row}>
            <DatabaseBackup className="mt-0.5 size-5 shrink-0 text-soft" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Sao lưu ra file</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-soft">Thiết kế, album, bố cục đã lưu, cài đặt và danh mục thư viện. Không gồm ảnh.</p>
            </div>
            <Button className="h-8 shrink-0 px-3 text-[13px]" disabled={busy} onClick={() => void backup()}>
              Sao lưu…
            </Button>
          </div>

          <div className={row}>
            <RotateCcw className="mt-0.5 size-5 shrink-0 text-soft" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Khôi phục từ file sao lưu</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-soft">
                {confirming
                  ? 'Thiết kế, album và cài đặt hiện tại sẽ bị thay bằng nội dung trong file. Ảnh trong thư viện được giữ nguyên.'
                  : 'Dùng khi đổi máy, đổi trình duyệt hoặc sau khi xoá dữ liệu duyệt web. Sau đó thêm lại thư mục ảnh để nối lại ảnh gốc.'}
              </p>
            </div>
            {confirming ? (
              <div className="flex shrink-0 flex-col gap-1.5">
                <Button variant="primary" className="h-8 px-3 text-[13px]" disabled={busy} onClick={() => void restore()}>
                  Chọn file…
                </Button>
                <Button className="h-8 px-3 text-[13px]" disabled={busy} onClick={() => setConfirming(false)}>
                  Huỷ
                </Button>
              </div>
            ) : (
              <Button className="h-8 shrink-0 px-3 text-[13px]" disabled={busy} onClick={() => setConfirming(true)}>
                Khôi phục…
              </Button>
            )}
          </div>

          <div className={row}>
            <Eraser className="mt-0.5 size-5 shrink-0 text-soft" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Dọn file thừa</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-soft">Xoá bản xem trước không còn ảnh nào dùng tới. Không đụng tới thư viện và file gốc.</p>
            </div>
            <Button className="h-8 shrink-0 px-3 text-[13px]" disabled={busy} onClick={() => void cleanup()}>
              Dọn
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
