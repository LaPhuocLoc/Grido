import { create } from 'zustand'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

/**
 * Cài trang thành ứng dụng (bản web). App đã cài được Chrome / Edge giữ quyền đọc ảnh và ghi thư mục xuất, nên không bị
 * hỏi lại mỗi lần mở.
 * - `none`: không áp dụng (bản desktop).
 * - `app`: đang chạy trong cửa sổ app đã cài.
 * - `installed`: đã cài nhưng đang mở trong tab trình duyệt.
 * - `ready`: trình duyệt cho cài ngay bằng một cú bấm.
 * - `manual`: chưa biết cài được chưa (trình duyệt chưa báo); bấm thì chỉ cách cài từ thanh địa chỉ.
 */
export type InstallState = 'none' | 'app' | 'installed' | 'ready' | 'manual'

export const useInstall = create<{ state: InstallState }>(() => ({ state: 'none' }))

let deferred: InstallEvent | null = null

const standalone = () => ['standalone', 'window-controls-overlay', 'minimal-ui'].some((m) => matchMedia(`(display-mode: ${m})`).matches)

/** Gọi sớm lúc mở trang: trình duyệt chỉ báo "cài được" một lần, bỏ lỡ là mất. */
export function watchInstall() {
  if (standalone()) return useInstall.setState({ state: 'app' })
  useInstall.setState({ state: 'manual' })
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
    useInstall.setState({ state: 'ready' })
  })
  addEventListener('appinstalled', () => {
    deferred = null
    useInstall.setState({ state: 'installed' })
  })
  // Đã cài từ trước (trình duyệt không báo "cài được" nữa): nhận ra qua related_applications trong manifest.
  const related = (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps
  void related
    ?.call(navigator)
    .then((apps) => apps.length && useInstall.getState().state === 'manual' && useInstall.setState({ state: 'installed' }))
    .catch(() => {})
}

/** Cách cài tay khi trình duyệt chưa cho cài bằng một cú bấm. */
export const installHint = (state: InstallState) =>
  state === 'installed'
    ? 'Tiệm Ghép Ảnh đã được cài trên máy này. Mở app từ Start menu hoặc màn hình chính để không bị hỏi quyền lại.'
    : 'Bấm biểu tượng cài đặt ở cuối thanh địa chỉ, hoặc mở menu ⋮ của trình duyệt rồi chọn cài trang này thành ứng dụng.'

/** Bấm "Cài app": mở hộp cài của trình duyệt. Trả về `false` khi không mở được (người gọi chỉ cách cài tay). */
export async function installApp() {
  const e = deferred
  if (!e) return false
  // Hộp cài chỉ mở được một lần cho mỗi lần trình duyệt báo.
  deferred = null
  await e.prompt()
  const { outcome } = await e.userChoice
  useInstall.setState({ state: outcome === 'accepted' ? 'installed' : 'manual' })
  return true
}
