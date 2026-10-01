// Chạy app lúc phát triển: Vite phục vụ giao diện (có HMR), Electron mở cửa sổ trỏ vào đó.
// Tham số thừa được chuyển cho Electron, vd. `npm run dev -- --remote-debugging-port=9222`.
import { spawn } from 'node:child_process'
import electron from 'electron'
import { createServer } from 'vite'
import { buildElectron } from './build-electron.mjs'

const server = await createServer()
await server.listen()
const url = server.resolvedUrls.local[0]
await buildElectron(true)

const child = spawn(electron, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, GRIDO_DEV_URL: url },
})
child.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})
