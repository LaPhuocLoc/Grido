// Chụp trang so sánh mẫu chữ (`/?lab=…` của bản dev) ra file PNG: `node scripts/template-lab.mjs <ảnh ra> <id font>…`
//
// Mỗi hàng của ảnh: ảnh mẫu gốc của font · mẫu chữ vẽ bằng đúng hàm xuất ảnh của app · hai ảnh chồng lên nhau.
// Dùng khi dựng / sửa file src/templates/<id font>.json mà muốn so với ảnh gốc không cần mở trình duyệt.
// Không cần cài thêm gì: script tự chạy dev server và mở Chrome đã cài trên máy qua cổng debug (CDP) với một hồ sơ tạm.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const [out, ...ids] = process.argv.slice(2)
if (!out || !ids.length) throw new Error('Cách dùng: node scripts/template-lab.mjs <ảnh ra.png> <id font>…')
const PORT = 5188
const DEBUG_PORT = 9455

const browser = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p))
if (!browser) throw new Error('Không tìm thấy Chrome / Edge. Đặt biến môi trường CHROME_PATH trỏ tới file chạy của trình duyệt.')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(path.join(os.tmpdir(), 'tga-lab-'))
const server = await createServer({ root, logLevel: 'error', server: { port: PORT, strictPort: true } })
await server.listen()
const chrome = spawn(browser, [`--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--window-size=1420,900', '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' })
try {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
      break
    } catch {
      await wait(250)
    }
  }
  const page = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let seq = 0
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const me = ++seq
      const onMessage = (e) => {
        const m = JSON.parse(e.data)
        if (m.id !== me) return
        ws.removeEventListener('message', onMessage)
        if (m.error) reject(new Error(`${method}: ${m.error.message}`))
        else resolve(m.result)
      }
      ws.addEventListener('message', onMessage)
      ws.send(JSON.stringify({ id: me, method, params }))
    })
  await send('Page.enable')
  await send('Page.navigate', { url: `http://localhost:${PORT}/?lab=${ids.join(',')}` })
  // Chờ mọi mẫu vẽ xong (font tải qua mạng nội bộ) và ảnh gốc hiện đủ.
  for (let i = 0; i < 240; i++) {
    const { result } = await send('Runtime.evaluate', {
      expression: `window.__labDone === ${ids.length} && [...document.images].every((i) => i.complete)`,
      returnByValue: true,
    })
    if (result.value) break
    await wait(250)
  }
  await wait(300)
  const { cssContentSize } = await send('Page.getLayoutMetrics')
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.ceil(cssContentSize.width), height: Math.ceil(cssContentSize.height), scale: 1 },
  })
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(`${out}: ${ids.length} mẫu`)
  ws.close()
} finally {
  chrome.kill()
  await server.close()
  await wait(800)
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
  } catch {}
}
process.exit(0)
