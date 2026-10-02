import { useSyncExternalStore } from 'react'
import type { GridoBridge } from '../../shared/types'
import { electronPlatform } from '../platform/electron'
import type { Platform, UrlKind } from '../platform/types'

declare global {
  interface Window {
    /** Cầu nối sang main process của Electron; không có khi app chạy trong trình duyệt. */
    grido: GridoBridge
  }
}

/**
 * Nền tảng app đang chạy trên đó (file trên đĩa, hộp thoại, cập nhật).
 * Bản desktop có sẵn ngay lúc nạp module; bản web được `main.tsx` gắn vào bằng `setPlatform` trước khi nạp giao diện.
 */
export let desktop: Platform = window.grido && electronPlatform(window.grido)

export function setPlatform(platform: Platform) {
  desktop = platform
}

/** Địa chỉ ảnh để hiển thị; chuỗi rỗng khi chưa sẵn sàng (bản web), dùng kèm `usePhotoUrl` / `useUrlVersion`. */
export const thumbUrl = (id: string) => desktop.images.url(id, 'thumb')
/** Bản xem trước dùng lúc dàn trang. */
export const fileUrl = (id: string) => desktop.images.url(id, 'preview')

const subscribe = (listener: () => void) => desktop.images.subscribe(listener)

/** Địa chỉ của một ảnh; component vẽ lại khi địa chỉ sẵn sàng. `undefined` trong lúc chờ để thẻ img không tải gì. */
export function usePhotoUrl(id: string, kind: UrlKind): string | undefined {
  return useSyncExternalStore(subscribe, () => desktop.images.url(id, kind)) || undefined
}

/** Cho component vẽ nhiều ảnh trong một vòng lặp: vẽ lại mỗi khi có thêm địa chỉ ảnh sẵn sàng. */
export const useUrlVersion = () => useSyncExternalStore(subscribe, () => desktop.images.version())

const prefetched = new Set<string>()
/** Giải mã trước bản xem trước khi người dùng sắp chọn ảnh (rê chuột) để lúc vào khung hiện ngay. */
export function prefetchFile(id: string) {
  if (prefetched.has(id)) return
  const url = fileUrl(id)
  // Bản web: địa chỉ đang được tạo, lần rê chuột sau sẽ có.
  if (!url) return
  prefetched.add(id)
  const img = new Image()
  img.decoding = 'async'
  img.src = url
}
