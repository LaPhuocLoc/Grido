import { HardDrive, ShieldCheck, WifiOff, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-coral-dark">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-soft">{children}</p>
      </div>
    </div>
  )
}

/** Bản web: nói rõ ảnh của người dùng đi đâu (không đi đâu cả) và trang giữ những gì trong trình duyệt. */
export function AboutDialog({ version, onClose }: { version: string; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return createPortal(
    <div className="no-drag fixed inset-0 z-[70] grid animate-overlay place-items-center bg-black/45 p-6" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-labelledby="about-title"
        className="max-h-full w-full max-w-md animate-pop overflow-y-auto rounded-3xl border border-line bg-card p-6 shadow-lift"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="about-title" className="font-display text-lg font-bold text-ink">
              Tiệm Ghép Ảnh
            </h2>
            <p className="text-xs text-muted">Phiên bản {version} · miễn phí, không cần tài khoản</p>
          </div>
          <button type="button" aria-label="Đóng" onClick={onClose} className="grid size-8 place-items-center rounded-full text-muted hover:bg-sand hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <Point icon={<ShieldCheck className="size-5" />} title="Ảnh của bạn không rời khỏi máy">
            Trang đọc ảnh ngay tại chỗ trên máy bạn và ghép ảnh bằng chính trình duyệt này. Không có máy chủ nào nhận ảnh, và trang được cài
            đặt để trình duyệt chặn mọi kết nối gửi dữ liệu ra ngoài.
          </Point>
          <Point icon={<HardDrive className="size-5" />} title="Trình duyệt giữ những gì">
            Thiết kế, album, cài đặt, và bản xem trước thu nhỏ của ảnh trong thư viện. File gốc không bị sao chép hay sửa đổi; xoá ảnh khỏi thư
            viện cũng không đụng tới file gốc. Xoá dữ liệu duyệt web của trang này sẽ xoá những thứ trên, nên hãy sao lưu ở mục Dữ liệu &amp;
            sao lưu.
          </Point>
          <Point icon={<WifiOff className="size-5" />} title="Dùng được khi không có mạng">
            Sau lần mở đầu tiên, trang chạy được cả khi mất mạng. Mạng chỉ cần để tải những phông chữ bạn chưa từng dùng và để nhận bản mới.
          </Point>
        </div>

        <p className="mt-5 rounded-2xl bg-sand px-3.5 py-3 text-[12.5px] leading-relaxed text-soft">
          Mỗi lần mở lại trang, trình duyệt sẽ hỏi lại quyền đọc ảnh gốc: đó là cách trình duyệt bảo vệ file của bạn, không phải lỗi. Chưa cho
          phép thì bạn vẫn ghép và xuất được bằng bản xem trước.
        </p>
      </div>
    </div>,
    document.body,
  )
}
