import type { GridoBridge } from '../../shared/types'

declare global {
  interface Window {
    grido: GridoBridge
  }
}

/** Cầu nối sang main process của Electron (file trên đĩa, hộp thoại hệ điều hành, cập nhật). */
export const desktop = window.grido

const ORIGIN = 'grido://app'

export const thumbUrl = (id: string) => `${ORIGIN}/photo/${id}/thumb`
/** Bản xem trước dùng lúc dàn trang. */
export const fileUrl = (id: string) => `${ORIGIN}/photo/${id}/preview`
/** File gốc trên đĩa, dùng khi xuất ảnh. */
export const originalUrl = (id: string) => `${ORIGIN}/photo/${id}/original`
export const importUrl = (token: string) => `${ORIGIN}/import/${token}`

const prefetched = new Set<string>()
/** Giải mã trước bản xem trước khi người dùng sắp chọn ảnh (rê chuột) để lúc vào khung hiện ngay. */
export function prefetchFile(id: string) {
  if (prefetched.has(id)) return
  prefetched.add(id)
  const img = new Image()
  img.decoding = 'async'
  img.src = fileUrl(id)
}
