import { Aperture, LayoutDashboard, Save, ShieldCheck, Type, WifiOff, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Một điểm đặc biệt của app: icon + vài chữ, đọc lướt là hiểu. */
function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="rounded-2xl bg-sand p-3">
      <span className="grid size-8 place-items-center rounded-xl bg-blush text-coral-dark [&>svg]:size-[18px]">{icon}</span>
      <p className="mt-2 text-[13px] font-bold leading-snug text-ink">{title}</p>
      <p className="mt-0.5 text-xs leading-snug text-soft">{children}</p>
    </li>
  )
}

/**
 * Bản web: giới thiệu ngắn những điểm chỉ Tiệm Ghép Ảnh có, viết cho người dùng phổ thông (ít chữ, đọc lướt), kèm một
 * dòng về dữ liệu trang giữ trong trình duyệt.
 */
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
        <div className="flex items-start gap-3">
          <img src="/logo.png" alt="" className="size-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 id="about-title" className="font-display text-lg font-bold text-ink">
              Tiệm Ghép Ảnh
            </h2>
            <p className="text-xs text-muted">Miễn phí · không cần tài khoản · bản {version}</p>
          </div>
          <button type="button" aria-label="Đóng" onClick={onClose} className="-mr-2 -mt-1 grid size-8 place-items-center rounded-full text-muted hover:bg-sand hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        <ul className="mt-5 grid grid-cols-2 gap-2">
          <Feature icon={<ShieldCheck />} title="Ảnh không rời máy bạn">
            Không tải lên mạng, không ai xem được.
          </Feature>
          <Feature icon={<Aperture />} title="Xuất nét như Lightroom">
            Lấy thẳng từ ảnh gốc, giữ đúng màu và độ nét.
          </Feature>
          <Feature icon={<LayoutDashboard />} title="Hơn 600 bố cục">
            Ghép tới 12 ảnh, khung chuẩn Facebook, Instagram, TikTok.
          </Feature>
          <Feature icon={<Type />} title="Hơn 500 phông chữ">
            Kèm hơn 400 mẫu chữ đẹp sẵn, bấm là dùng.
          </Feature>
          <Feature icon={<Save />} title="Tự lưu mọi thiết kế">
            Đóng trang, mở lại vẫn còn nguyên.
          </Feature>
          <Feature icon={<WifiOff />} title="Chạy cả khi mất mạng">
            Mở một lần là dùng được offline.
          </Feature>
        </ul>

        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-muted">
          Thiết kế và album nằm trong trình duyệt này. Xoá dữ liệu trang là mất, nên thỉnh thoảng sao lưu ở mục Dữ liệu &amp; sao lưu.
        </p>
      </div>
    </div>,
    document.body,
  )
}
