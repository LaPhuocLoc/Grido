import type { ReactNode } from 'react'

/** Màn hình thông báo toàn trang của bản web, hiện thay cho app (trình duyệt không hỗ trợ, app đang mở ở tab khác). */
export function Notice({ title, children, action }: { title: string; children: ReactNode; action?: { label: string; run: () => void } }) {
  return (
    <div className="grid h-dvh place-items-center bg-paper p-6">
      <div className="w-full max-w-md animate-pop rounded-3xl border border-line bg-card p-8 text-center shadow-lift">
        <img src="/logo.png" alt="" className="mx-auto size-14" />
        <h1 className="mt-5 font-display text-xl font-bold text-ink">{title}</h1>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-soft">{children}</div>
        {action && (
          <button
            type="button"
            autoFocus
            onClick={action.run}
            className="mt-6 h-11 rounded-full btn-primary px-6 text-sm font-semibold transition active:scale-95"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}

export const Unsupported = () => (
  <Notice title="Hãy mở bằng Chrome hoặc Edge trên máy tính">
    <p>
      Tiệm Ghép Ảnh dùng ảnh ngay tại chỗ trên máy bạn, không tải lên đâu cả. Trình duyệt này chưa cho phép trang web đọc file
      theo cách đó.
    </p>
    <p>Bạn mở lại địa chỉ này bằng Google Chrome hoặc Microsoft Edge trên máy tính là dùng được ngay.</p>
  </Notice>
)

export const OtherTab = ({ onTakeOver }: { onTakeOver: () => void }) => (
  <Notice title="Tiệm Ghép Ảnh đang mở ở tab khác" action={{ label: 'Dùng ở tab này', run: onTakeOver }}>
    <p>Mỗi lúc chỉ một tab được mở app, để ảnh ghép đang làm dở không bị hai tab ghi đè lên nhau.</p>
    <p>Bạn quay lại tab kia, hoặc chuyển sang dùng ở tab này (tab kia sẽ tự dừng).</p>
  </Notice>
)
