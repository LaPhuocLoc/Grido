import { FRAME_FIELDS, type FrameField, type FrameInfo } from './info'

/**
 * Khung thông số: lề quanh ảnh (đáy thường dày hơn để chứa chữ) cùng vài dòng chữ tự điền từ thông tin chụp.
 * Mọi số đo tính theo % cạnh ngắn của ảnh nên một mẫu dùng được cho ảnh dọc, ngang, vuông ở mọi độ phân giải. Màu khung là
 * màu nền của thiết kế, chữ tự đen / trắng theo màu đó, nên một mẫu dùng được cho cả khung sáng lẫn khung tối.
 */
export interface FrameTemplate {
  id: string
  label: string
  /** Màu khung khi vừa chọn mẫu. */
  bg: string
  pad: FramePad
  /** Chữ ở hai dải lùi vào so với mép ảnh bao nhiêu. */
  inset?: number
  blocks: FrameBlock[]
  /** Màu chữ riêng của mẫu, không theo màu khung (chữ trên nền ảnh mờ, chữ vàng mép phim). */
  ink?: string
  /** Nền là chính ảnh đó phóng to, làm mờ `blur` rồi phủ một lớp màu `tint`. */
  backdrop?: { blur: number; tint: string }
  /** Tấm nền ôm quanh ảnh, nằm trong lề ngoài; chữ nằm trên tấm này. Màu tấm là màu khung. */
  card?: { pad: FramePad; shadow?: boolean }
  /** Hoạ tiết vẽ lên phần lề: hạt và vệt loá sáng của mép phim. */
  texture?: 'film'
}

export interface FramePad {
  top: number
  side: number
  bottom: number
}

export interface FrameBlock {
  /** Trái / giữa / phải của dải, hoặc in đè lên đáy ảnh. */
  at: 'left' | 'center' | 'right' | 'over'
  /** Dải chứa cụm chữ; không ghi = dải đáy. */
  band?: 'top'
  lines: FrameLine[]
  /** Chữ lớn đứng trước các dòng, ngăn bằng một vạch dọc (tên hãng). */
  mark?: FrameLine
}

export interface FrameLine {
  /** Câu chữ với các mục trong ngoặc nhọn, vd "Shot on {model}". Mục nào trống thì cả dòng bị bỏ. */
  text: string
  /** Câu thay thế khi `text` có mục trống (ảnh xuất từ Lightroom không còn giả lập phim thì in tên máy). */
  or?: string
  size: number
  weight: 500 | 600 | 700
  upper?: boolean
  /** Chữ phụ, nhạt hơn. */
  muted?: boolean
  /** Giãn cách chữ, theo cỡ chữ. */
  spacing?: number
  /** Dấu ngăn giữa các thông số (tiêu cự, khẩu, tốc, ISO) thay cho khoảng trắng. */
  sep?: string
  /** Hình nhỏ đứng trước dòng chữ. */
  icon?: 'pin'
}

/** Một đoạn của dòng chữ đã điền; đoạn là tên hãng được viết theo cách của hãng (lib/frames/wordmark). */
export interface FrameRun {
  text: string
  brand?: boolean
}

export type FilledLine = FrameLine & { runs: FrameRun[] }

export const FRAMES: FrameTemplate[] = [
  {
    id: 'giua',
    label: 'Giữa',
    bg: '#ffffff',
    pad: { top: 2, side: 2, bottom: 15 },
    blocks: [
      {
        at: 'center',
        lines: [
          { text: '{brand}', size: 3.4, weight: 700, spacing: 0.04 },
          { text: '{settings}', size: 1.9, weight: 500, muted: true },
        ],
      },
    ],
  },
  {
    id: 'shot-on',
    label: 'Shot on',
    bg: '#ffffff',
    pad: { top: 2, side: 2, bottom: 18 },
    blocks: [
      {
        at: 'center',
        lines: [
          { text: '{brand}', size: 4.4, weight: 700, spacing: 0.04 },
          { text: 'Shot on {model}', size: 1.9, weight: 500 },
          { text: '{lens}', size: 1.9, weight: 500, muted: true },
        ],
      },
    ],
  },
  {
    id: 'hai-ben',
    label: 'Hai bên',
    bg: '#ffffff',
    pad: { top: 3, side: 3, bottom: 13 },
    inset: 1.5,
    blocks: [
      { at: 'left', lines: [{ text: '{brand}', size: 2.8, weight: 700, spacing: 0.04 }] },
      { at: 'right', lines: [{ text: '{film}', or: '{model}', size: 2.1, weight: 600, upper: true, spacing: 0.03 }] },
    ],
  },
  {
    id: 'chi-tiet',
    label: 'Chi tiết',
    bg: '#ffffff',
    pad: { top: 0, side: 0, bottom: 10 },
    inset: 3,
    blocks: [
      {
        at: 'left',
        lines: [
          { text: '{model}', size: 2.3, weight: 700 },
          { text: '{date}', size: 1.6, weight: 500, muted: true },
        ],
      },
      {
        at: 'right',
        mark: { text: '{brand}', size: 2.6, weight: 700, spacing: 0.04 },
        lines: [
          { text: '{settings}', size: 2.1, weight: 700 },
          { text: '{note}', size: 1.6, weight: 500, muted: true },
        ],
      },
    ],
  },
  {
    id: 'dai-day',
    label: 'Dải đáy',
    bg: '#000000',
    pad: { top: 0, side: 0, bottom: 9 },
    inset: 3,
    blocks: [
      { at: 'left', lines: [{ text: '{film}', or: '{model}', size: 2.1, weight: 600, upper: true, spacing: 0.06 }] },
      { at: 'right', lines: [{ text: '{settings}', size: 2.1, weight: 500 }] },
    ],
  },
  {
    id: 'in-de',
    label: 'In đè',
    bg: '#ffffff',
    pad: { top: 1.5, side: 1.5, bottom: 1.5 },
    blocks: [{ at: 'over', lines: [{ text: '{settings}', size: 2.3, weight: 600 }] }],
  },
  {
    id: 'logo',
    label: 'Chỉ tên hãng',
    bg: '#ffffff',
    pad: { top: 8, side: 5, bottom: 13 },
    blocks: [{ at: 'center', lines: [{ text: '{brand}', size: 2.6, weight: 700, spacing: 0.04 }] }],
  },
  {
    id: 'dia-diem',
    label: 'Địa điểm',
    bg: '#000000',
    pad: { top: 3, side: 3, bottom: 19 },
    blocks: [
      {
        at: 'center',
        lines: [
          { text: '{brand}  {model}', or: '{model}', size: 3, weight: 700, spacing: 0.04 },
          { text: '{note}', size: 1.9, weight: 500, muted: true, icon: 'pin' },
        ],
      },
    ],
  },
  {
    id: 'kinh-mo',
    label: 'Kính mờ',
    bg: '#000000',
    ink: '#ffffff',
    backdrop: { blur: 3.5, tint: 'rgba(0, 0, 0, 0.22)' },
    pad: { top: 4, side: 4, bottom: 18 },
    blocks: [
      {
        at: 'center',
        lines: [
          { text: '{brand}', size: 3, weight: 700, spacing: 0.04 },
          { text: 'Shot on {model}', size: 1.7, weight: 500, muted: true },
          { text: '{settings}', size: 1.8, weight: 500, sep: '   |   ' },
        ],
      },
    ],
  },
  {
    id: 'the-mo',
    label: 'Nền mờ',
    bg: '#111111',
    backdrop: { blur: 3.5, tint: 'rgba(255, 255, 255, 0.3)' },
    pad: { top: 9, side: 9, bottom: 9 },
    card: { pad: { top: 1.2, side: 1.2, bottom: 6.5 }, shadow: true },
    inset: 1,
    blocks: [
      { at: 'left', lines: [{ text: '{brand}', size: 2.1, weight: 700, spacing: 0.04 }] },
      { at: 'right', lines: [{ text: '{film}', or: '{model}', size: 1.5, weight: 600, upper: true, spacing: 0.04 }] },
    ],
  },
  {
    id: 'phim',
    label: 'Dải phim',
    bg: '#171614',
    ink: '#f0b33c',
    texture: 'film',
    pad: { top: 5.5, side: 2.6, bottom: 5.5 },
    inset: 4,
    blocks: [
      { at: 'center', band: 'top', lines: [{ text: '{film}', size: 1.5, weight: 600, upper: true, spacing: 0.14 }] },
      { at: 'right', band: 'top', lines: [{ text: '{model}', size: 1.5, weight: 600, upper: true, spacing: 0.14 }] },
      { at: 'left', lines: [{ text: '{settings}', size: 1.5, weight: 600, upper: true, spacing: 0.1 }] },
      { at: 'right', lines: [{ text: '{date}', size: 1.5, weight: 600, spacing: 0.1 }] },
    ],
  },
  {
    id: 'dien-anh',
    label: 'Điện ảnh',
    bg: '#000000',
    pad: { top: 12, side: 0, bottom: 12 },
    blocks: [],
  },
]

const BY_ID = new Map(FRAMES.map((f) => [f.id, f]))
export const frameTemplate = (id: string): FrameTemplate | null => BY_ID.get(id) ?? null

const FIELD = /\{(\w+)\}/g

/** Điền các mục vào câu chữ, tách riêng đoạn là tên hãng; null nếu có mục trống. */
function fill(line: FrameLine, text: string, info: FrameInfo): FrameRun[] | null {
  const runs: FrameRun[] = []
  const put = (piece: string, brand = false) => {
    const s = line.upper ? piece.toUpperCase() : piece
    const last = runs[runs.length - 1]
    if (!s) return
    if (brand) runs.push({ text: s, brand: true })
    else if (last && !last.brand) last.text += s
    else runs.push({ text: s })
  }
  let at = 0
  for (const match of text.matchAll(FIELD)) {
    const field = match[1] as FrameField
    let value = info[field] ?? ''
    if (!value) return null
    if (field === 'settings' && line.sep) value = value.replace(/\s{2,}/g, line.sep)
    put(text.slice(at, match.index))
    put(value, field === 'brand')
    at = match.index + match[0].length
  }
  put(text.slice(at))
  return runs
}

/** Các dòng thật sự được in: đã điền chữ, bỏ dòng thiếu thông tin. */
export function frameLines(lines: FrameLine[], info: FrameInfo): FilledLine[] {
  return lines.flatMap((line) => {
    const runs = fill(line, line.text, info) ?? (line.or ? fill(line, line.or, info) : null)
    return runs?.length ? [{ ...line, runs, text: runs.map((r) => r.text).join('') }] : []
  })
}

/** Những mục mà mẫu này có in (kể cả câu thay thế), theo thứ tự cố định: để chỉ hiện đúng các ô sửa cần thiết. */
export function frameFields(template: FrameTemplate): FrameField[] {
  const used = new Set<string>()
  for (const block of template.blocks)
    for (const line of [...block.lines, ...(block.mark ? [block.mark] : [])])
      for (const [, field] of `${line.text} ${line.or ?? ''}`.matchAll(FIELD)) used.add(field)
  return FRAME_FIELDS.filter((f) => used.has(f))
}
