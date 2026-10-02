// Kiểm tra bản web trên Chrome / Edge thật, với file thật trên đĩa: `npm run test:e2e:web`.
//
// Vì sao không dùng test thường: phần đáng lo nhất của bản web là File System Access API (đọc file tại chỗ, quyền đọc mất
// sau khi tải lại trang), service worker và màn hình cho trình duyệt không hỗ trợ; những thứ này chỉ có ở trình duyệt thật.
// Không cần cài thêm gì: script tự mở Chrome đã cài trên máy qua cổng debug (CDP) với một hồ sơ tạm.
//
// Không tự động hoá được: hộp thoại chọn file và hộp hỏi quyền của trình duyệt. Thay vào đó file được "thả" vào trang
// (đi cùng đường xử lý), còn bước bấm "Cho phép" phải thử tay.
//
// Chrome từ chối đọc thư mục nằm trong AppData / Temp, nên ảnh thử đặt ở release/_e2e (đã được git bỏ qua).
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { preview } from 'vite'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PORT = 4173
const DEBUG_PORT = 9444
const APP = `http://localhost:${PORT}/`
const photos = path.join(root, 'release', '_e2e')

const browser = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p))
if (!browser) throw new Error('Không tìm thấy Chrome / Edge. Đặt biến môi trường CHROME_PATH trỏ tới file chạy của trình duyệt.')
if (!existsSync(path.join(root, 'dist', 'sw.js'))) throw new Error('Chưa có bản dựng: chạy `npm run build:web` trước.')

// ---- Ảnh thử trên đĩa: 3 ảnh (một cái trong thư mục con) và một file không phải ảnh ----
rmSync(photos, { recursive: true, force: true })
mkdirSync(path.join(photos, 'sub'), { recursive: true })
cpSync(path.join(root, 'public', 'icon-512.png'), path.join(photos, 'a.png'))
cpSync(path.join(root, 'public', 'icon-192.png'), path.join(photos, 'b.png'))
cpSync(path.join(root, 'public', 'logo.png'), path.join(photos, 'sub', 'c.png'))
writeFileSync(path.join(photos, 'notes.txt'), 'not a photo')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(path.join(os.tmpdir(), 'tga-e2e-'))

async function launch() {
  const child = spawn(browser, [`--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--window-size=1360,860', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
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
  let id = 0
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const me = ++id
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
  // Cần bật miền Page thì script chèn trước khi trang chạy (addScriptToEvaluateOnNewDocument) mới có hiệu lực.
  await send('Page.enable')
  return {
    send,
    evaluate: async (body) => {
      const r = await send('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    },
    goto: async (url) => {
      await send('Page.navigate', { url })
      await wait(2500)
    },
    drop: async (file) => {
      const data = { items: [], files: [file], dragOperationsMask: 1 }
      for (const type of ['dragEnter', 'dragOver', 'drop']) await send('Input.dispatchDragEvent', { type, x: 700, y: 400, data })
    },
    close: async () => {
      ws.close()
      child.kill()
      await wait(1500)
    },
  }
}

/** Những gì người dùng thấy trong thư viện. */
const LIBRARY = `
  const tiles = [...document.querySelectorAll('[data-photo]')]
  return {
    tiles: tiles.length,
    names: tiles.map((t) => t.querySelector('img')?.dataset.tip).sort(),
    locked: document.querySelectorAll('[data-photo] [data-tip^="Trình duyệt chưa"]').length,
    banner: /ảnh cần được cho phép/.test(document.body.innerText),
    text: document.body.innerText,
  }`

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) failed++
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : `\n      ${detail}`}`)
}

const server = await preview({ root, preview: { port: PORT, strictPort: true } })
let chrome
try {
  console.log('Phiên 1: mở app, thả thư mục ảnh thật')
  chrome = await launch()
  await chrome.goto(APP)
  const boot = await chrome.evaluate(`return { platform: document.documentElement.dataset.platform, sw: !!(await navigator.serviceWorker.getRegistration()) }`)
  check('app chạy ở chế độ web', boot.platform === 'web')
  check('service worker đã đăng ký', boot.sw)

  await chrome.drop(photos)
  await wait(5000)
  let lib = await chrome.evaluate(LIBRARY)
  check('nhận đủ 3 ảnh, kể cả ảnh trong thư mục con, bỏ qua file không phải ảnh', lib.tiles === 3, JSON.stringify(lib.names))
  check('ảnh vừa thêm đọc được file gốc (không bị khoá)', lib.locked === 0)

  await chrome.drop(photos)
  await wait(2500)
  lib = await chrome.evaluate(LIBRARY)
  check('thả lại thư mục đó thì báo trùng, không thêm ảnh', lib.tiles === 3 && /3 ảnh đã có sẵn/.test(lib.text))

  await chrome.send('Network.enable')
  await chrome.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
  await chrome.goto(APP)
  lib = await chrome.evaluate(LIBRARY)
  check('mất mạng vẫn mở được app và thư viện', lib.tiles === 3)
  await chrome.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await chrome.close()

  console.log('Phiên 2: tắt hẳn trình duyệt rồi mở lại')
  chrome = await launch()
  await chrome.goto(APP)
  lib = await chrome.evaluate(LIBRARY)
  check('thư viện còn nguyên sau khi mở lại', lib.tiles === 3)
  check('ảnh ở trạng thái khoá và có dải "Cho phép"', lib.locked === 3 && lib.banner)

  const { identifier } = await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: 'delete window.showOpenFilePicker; delete Window.prototype.showOpenFilePicker;' })
  await chrome.goto(APP)
  const notice = await chrome.evaluate(`return { heading: document.querySelector('h1')?.innerText ?? '', editor: !!document.querySelector('nav[aria-label="Công cụ"]') }`)
  check('trình duyệt không có API đọc file thì hiện màn hình hướng dẫn, không vào app', /Chrome hoặc Edge/.test(notice.heading) && !notice.editor, notice.heading)
  await chrome.send('Page.removeScriptToEvaluateOnNewDocument', { identifier })

  await chrome.goto(APP)
  const { installabilityErrors } = await chrome.send('Page.getInstallabilityErrors')
  check('cài được thành ứng dụng', installabilityErrors.length === 0, JSON.stringify(installabilityErrors))
} finally {
  await chrome?.close().catch(() => {})
  await new Promise((resolve) => server.httpServer.close(resolve))
  rmSync(photos, { recursive: true, force: true })
  // Chrome đôi khi còn giữ file trong hồ sơ tạm thêm vài giây sau khi tắt: dọn không được cũng không làm hỏng kết quả.
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  } catch {}
}

console.log(failed ? `\n${failed} bước không đạt.` : '\nTất cả đều đạt.')
process.exit(failed ? 1 : 0)
