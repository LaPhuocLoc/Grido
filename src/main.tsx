import '@fontsource-variable/nunito/wght.css'
import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/500.css'
import '@fontsource/be-vietnam-pro/600.css'
import '@fontsource/be-vietnam-pro/700.css'
import '@fontsource/quicksand/500.css'
import '@fontsource/quicksand/600.css'
import '@fontsource/quicksand/700.css'
import '@fontsource/lora/500.css'
import '@fontsource/lora/700.css'
import '@fontsource/dancing-script/500.css'
import '@fontsource/dancing-script/700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './fonts.generated.css'

const root = createRoot(document.getElementById('root')!)

/** Nạp giao diện sau khi nền tảng đã sẵn sàng, vì store và theme gọi sang nền tảng ngay lúc khởi tạo. */
async function start() {
  const [{ default: App }, { watchTheme }, { desktop }] = await Promise.all([import('./App'), import('./lib/theme'), import('./lib/desktop')])
  document.documentElement.dataset.platform = desktop.platform
  watchTheme()
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

if (import.meta.env.DEV && new URLSearchParams(location.search).has('lab')) {
  // Bản dev: trang so sánh mẫu chữ với ảnh mẫu gốc của font (xem src/dev/Lab.tsx).
  const { Lab } = await import('./dev/Lab')
  root.render(<Lab />)
} else if (window.grido) {
  // Bản desktop: preload của Electron đã gắn sẵn cầu nối sang main process.
  await start()
} else {
  // Bản web: trang chạy thẳng trong trình duyệt, tự lo file bằng File System Access API.
  const [{ createWebPlatform, guardPage, isSupported }, { claimTab, takeOverTab }, { OtherTab, Unsupported }, { setPlatform }, { watchInstall }] =
    await Promise.all([
      import('./platform/web'),
      import('./platform/web/lock'),
      import('./platform/web/Notice'),
      import('./lib/desktop'),
      import('./lib/install'),
    ])
  watchInstall()
  const startWeb = async () => {
    setPlatform(await createWebPlatform())
    await start()
    const [{ useStore }, { useExportProgress }] = await Promise.all([import('./store'), import('./lib/useCollage')])
    guardPage(() => useExportProgress.getState().progress !== null || useStore.getState().imports.some((u) => u.status === 'processing'))
  }
  // Cho phép mở app khi không có mạng và cài thành ứng dụng. Chỉ ở bản đã dựng: lúc phát triển service worker chỉ gây vướng.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {})
  if (!isSupported()) root.render(<Unsupported />)
  else if (await claimTab()) await startWeb()
  else root.render(<OtherTab onTakeOver={() => void takeOverTab().then(startWeb)} />)
}
