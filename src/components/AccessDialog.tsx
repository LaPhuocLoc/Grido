import { Check, Images, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { allowAccess, closeAccess, useAccessPrompt } from '../lib/useCollage'
import { Button, cx } from './ui'

/** Ba lựa chọn trong hộp thoại xin quyền của Chrome / Edge; mục đầu là mục nên chọn. */
const BROWSER_CHOICES = ['Cho phép mỗi lần truy cập', 'Cho phép lần này', 'Không cho phép']

/**
 * Bản web: hiện ngay trước khi xuất, khi trình duyệt chưa cho đọc lại ảnh gốc / ghi vào thư mục xuất trong lần mở trang
 * này. Vẽ lại hộp thoại của trình duyệt và tô sẵn mục nên chọn, để người dùng nhận ra ngay và chỉ phải cho phép một lần.
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
        aria-describedby="access-text"
        className="w-full max-w-sm animate-pop rounded-3xl border border-line bg-card p-6 shadow-lift"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blush text-coral-dark">
            <Images className="size-5" />
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
        <p id="access-text" className="mt-1 text-[13px] leading-relaxed text-soft">
          Để xuất đủ nét, trình duyệt sẽ hỏi quyền đọc ảnh trên máy, với 3 lựa chọn như dưới đây.
        </p>

        {/* Lời nhắc + mũi tên chỉ thẳng vào lựa chọn cần bấm. */}
        <p className="mt-3 flex items-end justify-end gap-1 pr-3 text-[13px] font-bold leading-tight text-coral-dark">
          <span className="pb-1 text-right">Nhớ chọn dòng này để ảnh xuất ra nét nhất</span>
          <svg viewBox="0 0 32 34" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="size-8 shrink-0 animate-bob" aria-hidden>
            <path d="M3 5c13-2 22 6 21 24" />
            <path d="m17.5 23.5 6.5 6.5 5.5-7.5" />
          </svg>
        </p>
        {/* Bản vẽ lại hộp thoại của trình duyệt, chỉ để minh hoạ (không bấm được). */}
        <ol aria-hidden className="space-y-1 rounded-2xl border border-line bg-surface p-1.5 text-[13px]">
          {BROWSER_CHOICES.map((label, i) => (
            <li
              key={label}
              className={cx(
                'flex h-9 items-center gap-2.5 rounded-xl px-3',
                i === 0 ? 'bg-blush font-semibold text-ink ring-2 ring-coral' : 'text-muted',
              )}
            >
              <span
                className={cx(
                  'grid size-4 shrink-0 place-items-center rounded-full border-2',
                  i === 0 ? 'border-coral bg-coral text-white' : 'border-edge',
                )}
              >
                {i === 0 && <Check className="size-2.5" strokeWidth={4} />}
              </span>
              {label}
            </li>
          ))}
        </ol>
        <p className="mt-2.5 text-xs leading-relaxed text-muted">Hỏi một lần cho cả thư viện. Ảnh vẫn nằm trên máy bạn, không tải đi đâu.</p>

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
          Tiếp tục
        </Button>
      </div>
    </div>,
    document.body,
  )
}
