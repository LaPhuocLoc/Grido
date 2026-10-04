/**
 * Cách từng hãng viết tên mình: kiểu chữ, độ đậm, giãn cách, màu. App không đóng kèm logo của hãng nào; tên hãng được viết
 * bằng font có sẵn sao cho gần với cách hãng viết nhất.
 */
export interface Wordmark {
  family: 'sans' | 'serif'
  weight: number
  italic?: boolean
  /** Giãn cách chữ, theo cỡ chữ. */
  spacing: number
  /** Màu riêng của hãng; chỉ dùng khi người dùng để màu chữ tự động. */
  color?: string
  /** Một chữ cái có phần trên mang màu khác (chữ I của FUJIFILM). */
  accent?: { at: number; color: string }
}

const MARKS: Record<string, Wordmark> = {
  fujifilm: { family: 'sans', weight: 800, spacing: 0.01, accent: { at: 3, color: '#e60012' } },
  sony: { family: 'serif', weight: 700, spacing: 0.14 },
  canon: { family: 'serif', weight: 700, spacing: 0, color: '#cc0000' },
  nikon: { family: 'sans', weight: 800, italic: true, spacing: 0 },
  leica: { family: 'sans', weight: 700, spacing: 0.1, color: '#e2001a' },
  olympus: { family: 'sans', weight: 800, spacing: 0.05 },
  'om system': { family: 'sans', weight: 600, spacing: 0.16 },
  panasonic: { family: 'sans', weight: 700, spacing: 0 },
  lumix: { family: 'sans', weight: 800, spacing: 0.04 },
  ricoh: { family: 'sans', weight: 800, spacing: 0.04 },
  pentax: { family: 'sans', weight: 800, spacing: 0.04 },
  hasselblad: { family: 'sans', weight: 500, spacing: 0.24 },
  sigma: { family: 'sans', weight: 600, spacing: 0.18 },
  dji: { family: 'sans', weight: 800, italic: true, spacing: 0 },
}

/** Cách viết tên hãng `brand`; null nếu không có gì riêng (viết như chữ thường của khung). */
export const wordmark = (brand: string): Wordmark | null => MARKS[brand.trim().toLowerCase()] ?? null
