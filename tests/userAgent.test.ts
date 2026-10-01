import { describe, expect, it } from 'vitest'
import { asciiUserAgent } from '../electron/userAgent'

describe('asciiUserAgent', () => {
  // Electron ghép tên app (bỏ khoảng trắng) vào User-Agent mặc định. Header có ký tự ngoài ASCII làm mọi fetch / <img>
  // tới grido:// báo "Failed to fetch": thư viện ảnh trắng trơn, không nhập, không xuất được (bản 1.4.0).
  const broken =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) TiệmGhépẢnh/1.4.0 Chrome/152.0.7977.130 Electron/44.5.1 Safari/537.36'

  it('thay phần tên app có dấu bằng tên không dấu', () => {
    expect(asciiUserAgent(broken, '1.4.1')).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) TiemGhepAnh/1.4.1 Chrome/152.0.7977.130 Electron/44.5.1 Safari/537.36',
    )
  })

  it('kết quả chỉ còn ký tự ASCII in được', () => {
    expect(asciiUserAgent(broken, '1.4.1')).toMatch(/^[\x20-\x7e]+$/)
    expect(asciiUserAgent('Tiệm Ghép Ảnh Ảnh/1 Chrome/1', '2.0.0')).toMatch(/^[\x20-\x7e]+$/)
  })

  it('giữ nguyên User-Agent vốn đã là ASCII', () => {
    const fine = 'Mozilla/5.0 Grido/1.3.0 Chrome/152.0.7977.130 Electron/44.5.1 Safari/537.36'
    expect(asciiUserAgent(fine, '1.4.1')).toBe(fine)
  })
})
