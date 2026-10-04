import { X } from 'lucide-react'
import { Fragment, useEffect } from 'react'
import { createPortal } from 'react-dom'

const GROUPS: { title: string; rows: [keys: string[], action: string][] }[] = [
  {
    title: 'Chung',
    rows: [
      [['Ctrl', 'O'], 'Thêm ảnh'],
      [['Ctrl', 'V'], 'Dán ảnh vào thư viện'],
      [['Ctrl', 'E'], 'Xuất ảnh'],
      [['Ctrl', 'Z'], 'Hoàn tác'],
      [['Ctrl', 'Shift', 'Z'], 'Làm lại'],
      [['Ctrl', 'Lăn chuột'], 'Thu phóng vùng làm việc'],
      [['Esc'], 'Bỏ chọn'],
    ],
  },
  {
    title: 'Ảnh',
    rows: [
      [['Lăn chuột'], 'Phóng ảnh trong ô'],
      [['Delete'], 'Bỏ ảnh đang chọn khỏi bố cục'],
      [['Ctrl', 'A'], 'Chọn hết ảnh (đang ở chế độ Chọn)'],
      [['Shift', 'Bấm'], 'Chọn một dãy ảnh trong thư viện'],
    ],
  },
  {
    title: 'Chữ',
    rows: [
      [['Ctrl', 'B'], 'Đậm'],
      [['Ctrl', 'I'], 'Nghiêng'],
      [['Ctrl', 'U'], 'Gạch chân'],
      [['Ctrl', 'D'], 'Nhân bản'],
      [['Ctrl', 'G'], 'Nhóm'],
      [['Ctrl', 'Shift', 'G'], 'Bỏ nhóm'],
      [['Shift', 'Kéo'], 'Khoanh vùng chọn nhiều dòng chữ'],
      [['Delete'], 'Xoá chữ đang chọn'],
    ],
  },
]

/** Bảng phím tắt, mở từ menu Ứng dụng. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return createPortal(
    <div className="no-drag fixed inset-0 z-[70] grid animate-overlay place-items-center bg-black/45 p-6" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-labelledby="keys-title"
        className="max-h-full w-full max-w-2xl animate-pop overflow-y-auto rounded-3xl border border-line bg-card p-6 shadow-lift"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="keys-title" className="font-display text-lg font-bold text-ink">
            Phím tắt
          </h2>
          <button type="button" aria-label="Đóng" onClick={onClose} className="-mr-2 grid size-8 place-items-center rounded-full text-muted hover:bg-sand hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-3">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-xs font-bold text-muted">{group.title}</h3>
              <dl className="mt-2 space-y-2">
                {group.rows.map(([keys, action]) => (
                  <div key={action}>
                    <dt className="flex flex-wrap items-center gap-1">
                      {keys.map((k, i) => (
                        <Fragment key={k}>
                          {i > 0 && <span className="text-[11px] text-muted">+</span>}
                          <kbd className="rounded-md border border-line bg-sand px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink">{k}</kbd>
                        </Fragment>
                      ))}
                    </dt>
                    <dd className="mt-0.5 text-[13px] leading-snug text-soft">{action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
