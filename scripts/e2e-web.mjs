// Kiểm tra bản web trên Chrome / Edge thật, với file thật trên đĩa: `npm run test:e2e:web`.
//
// Vì sao không dùng test thường: phần đáng lo nhất của bản web là File System Access API (đọc file tại chỗ, quyền đọc mất
// sau khi tải lại trang), service worker và màn hình cho trình duyệt không hỗ trợ; những thứ này chỉ có ở trình duyệt thật.
// Không cần cài thêm gì: script tự mở Chrome đã cài trên máy qua cổng debug (CDP) với một hồ sơ tạm.
//
// Không tự động hoá được: hộp thoại chọn file và hộp hỏi quyền của trình duyệt. Thay vào đó file được "thả" vào trang
// (đi cùng đường xử lý), còn bước bấm "Cho phép" khi xuất ảnh phải thử tay.
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
    /** Giữ chuột trái ở (x0, y0), kéo tới (x1, y1) rồi thả, như người dùng kéo một ảnh. */
    drag: async (x0, y0, x1, y1) => {
      const mouse = (type, x, y, buttons = 1) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 })
      await mouse('mouseMoved', x0, y0, 0)
      await mouse('mousePressed', x0, y0)
      for (let i = 1; i <= 10; i++) await mouse('mouseMoved', x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10)
      await wait(200)
      await mouse('mouseReleased', x1, y1, 0)
      await wait(600)
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
    locked: document.querySelectorAll('[data-photo][data-locked]').length,
    banner: /ảnh cần được cho phép/.test(document.body.innerText),
    text: document.body.innerText,
  }`

/** Màn hình của người mới: lời mời ở khung làm việc, dải công cụ và nút Xuất ảnh trên thanh tiêu đề. */
const FIRST_RUN = `
  const buttons = [...document.querySelectorAll('button')]
  return {
    text: document.querySelector('main').innerText,
    samples: buttons.some((b) => b.textContent.includes('Thử với ảnh mẫu')),
    exportDisabled: !!buttons.find((b) => b.textContent.includes('Xuất ảnh'))?.disabled,
    rail: [...document.querySelectorAll('nav[aria-label="Công cụ"] button[aria-pressed]')].map((b) => b.innerText.trim()),
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

  const first = await chrome.evaluate(FIRST_RUN)
  check('lần đầu mở: lời mời thả ảnh, nút thử ảnh mẫu, nút Xuất ảnh còn khoá', /Thả ảnh vào đây/.test(first.text) && first.samples && first.exportDisabled, JSON.stringify(first))
  check('dải công cụ theo thứ tự làm việc, không còn mục Xuất', first.rail.join(' ') === 'Ảnh Bố cục Cỡ Khung Chữ Thiết kế', first.rail.join(' '))

  // Chọn bố cục trước khi có ảnh: khung hiện các ô trống, chưa xuất được.
  const layoutFirst = await chrome.evaluate(`
    const click = (find) => [...document.querySelectorAll('button')].find(find).click()
    const pause = () => new Promise((r) => setTimeout(r, 500))
    click((b) => b.textContent.includes('chọn bố cục trước'))
    await pause()
    click((b) => b.getAttribute('aria-label') === '3 ảnh')
    await pause()
    click((b) => b.getAttribute('aria-label') === 'Bố cục 1')
    await pause()
    const seen = {
      slots: document.querySelectorAll('main button[aria-label^="Ô trống"]').length,
      exportDisabled: [...document.querySelectorAll('header button')].find((b) => b.textContent.includes('Xuất ảnh')).disabled,
    }
    // Công tắc chiều khung ngay trên danh sách bố cục: đổi khung dọc sang ngang rồi trả lại.
    const turn = (label) => [...document.querySelectorAll('[aria-label="Chiều ảnh"] [role=radio]')].find((b) => b.textContent.trim() === label).click()
    const frame = () => document.querySelector('main [data-frame]').getBoundingClientRect()
    seen.portrait = frame().width < frame().height
    turn('Ngang')
    await pause()
    seen.landscape = frame().width > frame().height
    turn('Dọc')
    await pause()
    seen.back = frame().width < frame().height
    // Quay lại mục Ảnh để các bước sau nhìn thấy thư viện.
    click((b) => b.closest('nav') && b.textContent.trim() === 'Ảnh')
    await pause()
    return seen`)
  check('chọn bố cục 3 ảnh khi chưa có ảnh: khung có 3 ô trống, chưa xuất được', layoutFirst.slots === 3 && layoutFirst.exportDisabled, JSON.stringify(layoutFirst))
  check('mục Bố cục đổi được khung dọc sang ngang và ngược lại', layoutFirst.portrait && layoutFirst.landscape && layoutFirst.back, JSON.stringify(layoutFirst))

  await chrome.drop(photos)
  await wait(5000)
  let lib = await chrome.evaluate(LIBRARY)
  check('nhận đủ 3 ảnh, kể cả ảnh trong thư mục con, bỏ qua file không phải ảnh', lib.tiles === 3, JSON.stringify(lib.names))
  check('ảnh vừa thêm đọc được file gốc (không bị khoá)', lib.locked === 0)

  await chrome.drop(photos)
  await wait(2500)
  lib = await chrome.evaluate(LIBRARY)
  check('thả lại thư mục đó thì báo trùng, không thêm ảnh', lib.tiles === 3 && /3 ảnh đã có sẵn/.test(lib.text))

  // Mở một ảnh: nút Xuất ảnh trên thanh tiêu đề bật lên, bấm thì bung bảng cài đặt xuất ngay bên dưới.
  const popup = await chrome.evaluate(`
    document.querySelector('[data-photo] button').click()
    await new Promise((r) => setTimeout(r, 800))
    const slotsLeft = document.querySelectorAll('main button[aria-label^="Ô trống"]').length
    const button = [...document.querySelectorAll('header button')].find((b) => b.textContent.includes('Xuất ảnh'))
    const enabled = !button.disabled
    button.click()
    await new Promise((r) => setTimeout(r, 500))
    const text = document.querySelector('[role=dialog][aria-label="Xuất ảnh"]')?.innerText ?? ''
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    return { enabled, text, slotsLeft }`)
  check('bấm một ảnh trong thư viện là ảnh vào ô trống kế tiếp', popup.slotsLeft === 2, String(popup.slotsLeft))
  check('có ảnh trên khung thì nút Xuất ảnh mở bảng xuất (JPEG / PNG), có nhắc còn ô trống', popup.enabled && /JPEG/.test(popup.text) && /PNG/.test(popup.text) && !/WebP/.test(popup.text) && /Còn 2 ô trống/.test(popup.text), popup.text)

  // Kéo một ảnh từ thư viện thả vào ô trống cuối cùng (không phải ô trống kế tiếp).
  const aim = await chrome.evaluate(`
    const middle = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }
    const free = [...document.querySelectorAll('[data-photo]')].find((t) => t.querySelector('button').getAttribute('aria-pressed') !== 'true')
    return { from: middle(free), to: middle(document.querySelector('main [data-cell="2"]')) }`)
  await chrome.drag(aim.from.x, aim.from.y, aim.to.x, aim.to.y)
  const dropped = await chrome.evaluate(`
    return {
      slotsLeft: document.querySelectorAll('main button[aria-label^="Ô trống"]').length,
      lastFilled: !!document.querySelector('main [data-cell="2"] img'),
      middleEmpty: document.querySelector('main [data-cell="1"]').tagName === 'BUTTON',
    }`)
  check('kéo ảnh từ thư viện thả vào ô nào thì ảnh vào đúng ô đó', dropped.slotsLeft === 1 && dropped.lastFilled && dropped.middleEmpty, JSON.stringify(dropped))

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
  // Không còn dải nhắc mỗi lần mở app: quyền chỉ được hỏi lúc bấm Xuất (hộp nhắc của app rồi tới hộp thoại của trình duyệt).
  check('ảnh ở trạng thái khoá, không hiện dải nhắc lúc mở app', lib.locked === 3 && !lib.banner)

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
