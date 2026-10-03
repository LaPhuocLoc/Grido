import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './ui'

export interface MenuItem {
  label: string
  /** Biểu tượng đứng trước nhãn. */
  icon?: ReactNode
  /** Phím tắt của thao tác, hiện mờ ở cuối dòng (vd. "Ctrl+D"). */
  shortcut?: string
  /** Menu chọn một trong nhiều (cỡ ảnh…): true = mục đang dùng, hiện một chấm ở đầu dòng. */
  checked?: boolean
  danger?: boolean
  /** Mục hiện mờ, không bấm được (vd. "Đặt lại" khi ảnh chưa bị chỉnh gì). */
  disabled?: boolean
  /** Kẻ một đường ngăn phía trên mục này. */
  divider?: boolean
  run: () => void
}
export interface MenuState {
  x: number
  y: number
  /** Menu bung về bên trái điểm neo (dùng cho nút nằm sát mép phải panel). */
  alignRight?: boolean
  items: MenuItem[]
}

/** Menu nhỏ bung ra tại con trỏ / dưới một nút. Gắn vào body vì panel bao ngoài cắt mọi thứ tràn ra. */
export function Menu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])
  const height = Math.min(menu.items.length * 36 + menu.items.filter((item) => item.divider).length * 8 + 12, window.innerHeight * 0.7)
  return createPortal(
    <div className="fixed inset-0 z-50" onPointerDown={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        role="menu"
        className="scroll-soft absolute max-h-[70vh] min-w-52 max-w-72 animate-pop overflow-y-auto rounded-2xl border border-line bg-card p-1.5 shadow-lift"
        style={{
          top: Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)),
          ...(menu.alignRight ? { right: Math.max(8, window.innerWidth - menu.x) } : { left: Math.max(8, Math.min(menu.x, window.innerWidth - 296)) }),
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {menu.items.map((item) => {
          const radio = item.checked !== undefined
          return (
            <button
              key={item.label}
              type="button"
              role={radio ? 'menuitemradio' : 'menuitem'}
              aria-checked={radio ? item.checked : undefined}
              disabled={item.disabled}
              onClick={() => {
                onClose()
                item.run()
              }}
              className={cx(
                'flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13px] font-medium transition-colors hover:bg-sand disabled:pointer-events-none disabled:opacity-40',
                item.danger ? 'text-danger' : 'text-ink',
                item.divider && 'relative mt-2 before:absolute before:inset-x-2 before:-top-1 before:h-px before:bg-line',
              )}
            >
              {radio && <span className={cx('size-1.5 shrink-0 rounded-full', item.checked ? 'bg-ink' : 'bg-transparent')} />}
              {item.icon && <span className={cx('grid shrink-0 place-items-center [&>svg]:size-4', item.danger ? 'text-danger' : 'text-soft')}>{item.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.shortcut && <kbd className="shrink-0 pl-3 font-sans text-[11px] font-medium text-muted">{item.shortcut}</kbd>}
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
