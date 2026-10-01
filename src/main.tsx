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

const root = createRoot(document.getElementById('root')!)

if (!window.grido) {
  // Mở nhầm địa chỉ dev server bằng trình duyệt thường: không có cầu nối sang Electron.
  root.render(<p style={{ padding: 32 }}>Grido là ứng dụng desktop. Chạy `npm run dev` để mở cửa sổ ứng dụng.</p>)
} else {
  // Nạp sau khi chắc chắn có cầu nối, vì store và theme gọi sang main process ngay lúc khởi tạo.
  const [{ default: App }, { watchTheme }] = await Promise.all([import('./App'), import('./lib/theme')])
  document.documentElement.dataset.platform = window.grido.platform
  watchTheme()
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
