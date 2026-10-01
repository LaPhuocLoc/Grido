import { net, protocol } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { IMAGE_TYPES, photoFile, stagedPath } from './library'

/**
 * Scheme riêng `grido://app/…` phục vụ cả giao diện đã build lẫn ảnh trong thư viện, để mọi thứ cùng một origin
 * (fetch, Web Worker, canvas đều chạy như trên web mà không cần máy chủ).
 *
 *   /photo/<id>/thumb|preview|original   ảnh trong thư viện
 *   /import/<token>                      file đang chờ nhập
 *   còn lại                              file tĩnh của giao diện
 */

export const APP_ORIGIN = 'grido://app'

const STATIC_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
  json: 'application/json',
  woff2: 'font/woff2',
  woff: 'font/woff',
  png: 'image/png',
  webp: 'image/webp',
  wasm: 'application/wasm',
}

const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; " +
  "img-src 'self' blob: data:; connect-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'"

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'grido', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ])
}

async function serve(file: string, type: string | undefined, extra?: Record<string, string>): Promise<Response> {
  try {
    const res = await net.fetch(pathToFileURL(file).toString())
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': type ?? 'application/octet-stream',
        // Lúc phát triển giao diện chạy ở http://localhost nên ảnh là cross-origin.
        'Access-Control-Allow-Origin': '*',
        ...extra,
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

const imageType = (file: string) => IMAGE_TYPES[path.extname(file).slice(1).toLowerCase()]

export function handleScheme(staticDir: string) {
  protocol.handle('grido', (request) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)

    if (parts[0] === 'photo') {
      const file = photoFile(parts[1], parts[2])
      if (!file) return new Response('Not found', { status: 404 })
      // Thumbnail và bản xem trước gắn với id ảnh và không bao giờ đổi nội dung → cho trình duyệt giữ lại, khỏi đọc đĩa
      // mỗi lần ô ảnh được dựng lại (cuộn, chuyển album, đổi tab). File gốc thì người dùng có thể sửa bất cứ lúc nào.
      const cache = parts[2] === 'original' ? 'no-cache' : 'private, max-age=31536000, immutable'
      return serve(file, imageType(file), { 'Cache-Control': cache })
    }
    if (parts[0] === 'import') {
      const file = stagedPath(parts[1])
      return file ? serve(file, imageType(file)) : new Response('Not found', { status: 404 })
    }

    const file = path.join(staticDir, ...(parts.length ? parts : ['index.html']))
    if (path.relative(staticDir, file).startsWith('..')) return new Response('Forbidden', { status: 403 })
    const ext = path.extname(file).slice(1)
    return serve(file, STATIC_TYPES[ext], ext === 'html' ? { 'Content-Security-Policy': CSP } : undefined)
  })
}
