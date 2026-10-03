import { FolderLock, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { allowAccess, closeAccess, useAccessPrompt } from '../lib/useCollage'
import { Button } from './ui'

/**
 * Bản web: hiện ngay trước khi xuất, khi trình duyệt chưa cho đọc lại ảnh gốc / ghi vào thư mục xuất trong lần mở trang
 * này. Nói trước nên chọn gì ở hộp thoại của trình duyệt, để chỉ phải cho phép một lần cho mãi mãi.
 */
export function AccessDialog() {
  const open = useAccessPrompt((s) => s.open)
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!open) return setAsking(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && closeAccess()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])
  if (!open) return null

  return createPortal(
    <div className="no-drag fixed inset-0 z-[70] grid animate-overlay place-items-center bg-black/45 p-6" onPointerDown={() => !asking && closeAccess()}>
      <div
        role="dialog"
        aria-labelledby="access-title"
        className="w-full max-w-sm animate-pop rounded-3xl border border-line bg-card p-6 shadow-lift"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blush text-coral-dark">
            <FolderLock className="size-5" />
          </span>
          <button
            type="button"
            aria-label="Huỷ xuất ảnh"
            disabled={asking}
            onClick={() => closeAccess()}
            className="-mr-2 -mt-2 grid size-8 place-items-center rounded-full text-muted hover:bg-sand hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <h2 id="access-title" className="mt-3 font-display text-lg font-bold text-ink">
          Cho phép đọc ảnh gốc
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-soft">
          Trình duyệt cần bạn cho phép đọc lại ảnh gốc để xuất nét tối đa. Ở hộp thoại tiếp theo, chọn{' '}
          <b className="text-ink">“Cho phép mỗi lần truy cập”</b> để từ nay không phải hỏi lại.
        </p>
        <Button
          variant="primary"
          autoFocus
          disabled={asking}
          className="mt-5 h-11 w-full text-[14px]"
          onClick={() => {
            setAsking(true)
            void allowAccess()
          }}
        >
          Cho phép
        </Button>
      </div>
    </div>,
    document.body,
  )
}
