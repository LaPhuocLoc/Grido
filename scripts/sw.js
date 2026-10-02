// Service worker của bản web. Vite chèn hai hằng số BUILD và SHELL lên đầu file này lúc dựng (xem vite.config.ts).
//
// Mục đích: mở được app khi không có mạng, và font đã dùng không phải tải lại.
//   - Trang (index.html): luôn hỏi mạng trước để người đang có mạng nhận ngay bản mới nhất; mất mạng mới dùng bản đã giữ.
//   - /assets/* và các file vỏ app: tên file có hash nội dung nên giữ được mãi → lấy từ kho trước.
//   - /fonts/*: lấy từ kho trước; kho font giữ qua các bản dựng vì font hiếm khi đổi.
//   - /version.json: không bao giờ giữ, để app biết đã có bản mới.
// Ảnh của người dùng không đi qua đây: chúng là địa chỉ blob, không phải yêu cầu mạng.

const SHELL_CACHE = `shell-${BUILD}`
const FONT_CACHE = 'fonts-v1'

self.addEventListener('install', (event) => {
  // Không skipWaiting: tab đang mở tiếp tục chạy trọn vẹn bằng bản cũ, bản mới nhận quyền khi mọi tab đã đóng.
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('shell-') && name !== SHELL_CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) void cache.put(request, response.clone())
  return response
}

async function page(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) void cache.put('/', response.clone())
    return response
  } catch (err) {
    const saved = await cache.match('/')
    if (saved) return saved
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname === '/version.json' || url.pathname === '/sw.js') return
  if (request.mode === 'navigate') event.respondWith(page(request))
  else if (url.pathname.startsWith('/fonts/')) event.respondWith(cacheFirst(FONT_CACHE, request))
  else event.respondWith(cacheFirst(SHELL_CACHE, request))
})
