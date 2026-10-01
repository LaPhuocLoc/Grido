/**
 * Electron ghép tên app vào User-Agent mặc định. Tên app có dấu ("Tiệm Ghép Ảnh") biến header này thành không phải
 * ASCII, và Chromium từ chối mọi fetch / <img> gửi kèm nó tới scheme của app ("Failed to fetch"): ảnh trong thư viện
 * không hiện, không nhập, không xuất được. Thay phần tên có dấu bằng tên không dấu.
 */
export function asciiUserAgent(userAgent: string, version: string): string {
  let named = false
  return userAgent
    .split(' ')
    .flatMap((token) => {
      if (/^[\x20-\x7e]*$/.test(token)) return [token]
      if (named) return []
      named = true
      return [`TiemGhepAnh/${version}`]
    })
    .join(' ')
}
