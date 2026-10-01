import { useStore, type Theme } from '../store'
import { desktop } from './desktop'

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

export const isDark = (theme: Theme) => theme === 'dark' || (theme === 'system' && systemDark.matches)

function apply() {
  const { theme } = useStore.getState()
  const dark = isDark(theme)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  // Cụm nút cửa sổ và hộp thoại của hệ điều hành đổi màu theo.
  desktop.app.setTheme(theme, dark)
}

/** Giữ thuộc tính data-theme khớp với lựa chọn của người dùng và với hệ điều hành (khi để "theo hệ thống"). */
export function watchTheme() {
  apply()
  useStore.subscribe((s, prev) => {
    if (s.theme !== prev.theme) apply()
  })
  systemDark.addEventListener('change', apply)
}
