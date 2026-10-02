import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const here = (path: string) => new URL(path, import.meta.url)
const { version } = JSON.parse(readFileSync(here('./package.json'), 'utf8')) as { version: string }
/** Mã của lần dựng này. Bản web so nó với /version.json trên máy chủ để biết đã có bản mới hơn hay chưa. */
const build = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')

const versionFile = (): Plugin => ({
  name: 'version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, build }) })
  },
})

/**
 * Tên file font không có hash nội dung. Gắn `?v=<hash>` vào địa chỉ trong @font-face để bản web giữ font trong cache mãi mãi
 * mà vẫn nhận được file mới khi một font được dựng lại. (Bản desktop bỏ qua phần `?v=`.)
 */
const fontVersions = (): Plugin => ({
  name: 'font-versions',
  enforce: 'pre',
  transform(code, id) {
    if (!id.split('?')[0].endsWith('fonts.generated.css')) return
    return code.replace(/url\('(\/fonts\/vn\/[^']+\.woff2)'\)/g, (_all, path: string) => {
      const hash = createHash('md5').update(readFileSync(here(`./public${path}`))).digest('hex').slice(0, 8)
      return `url('${path}?v=${hash}')`
    })
  },
})

/** File vỏ app được giữ sẵn để mở được khi không có mạng. Bộ font chữ của ảnh ghép không nằm ở đây: font nào dùng thì giữ font đó. */
const SHELL_PUBLIC = ['/', '/theme.js', '/favicon.png', '/logo.png', '/icon-192.png', '/manifest.webmanifest']

/** Service worker của bản web: scripts/sw.js cộng với danh sách file của đúng bản dựng này. */
const serviceWorker = (): Plugin => ({
  name: 'service-worker',
  generateBundle(_options, bundle) {
    const assets = Object.keys(bundle)
      .filter((file) => /\.(js|css|wasm|woff2)$/.test(file))
      .map((file) => `/${file}`)
    const header = `const BUILD = ${JSON.stringify(build)}\nconst SHELL = ${JSON.stringify([...SHELL_PUBLIC, ...assets])}\n`
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: header + readFileSync(here('./scripts/sw.js'), 'utf8') })
  },
})

export default defineConfig({
  plugins: [fontVersions(), react(), tailwindcss(), versionFile(), serviceWorker()],
  define: { __APP_VERSION__: JSON.stringify(version), __BUILD_ID__: JSON.stringify(build) },
  worker: { format: 'es' },
  // Bộ mã hoá MozJPEG tự nạp file .wasm cạnh nó; để Vite gộp trước thì đường dẫn ấy bị gãy.
  optimizeDeps: { exclude: ['@jsquash/jpeg'] },
  server: { port: 5173, strictPort: true },
  test: { include: ['tests/**/*.test.ts'], restoreMocks: true },
})
