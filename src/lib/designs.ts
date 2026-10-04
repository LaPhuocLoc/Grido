import { CUSTOM_PRESET_ID, ORIGINAL_PRESET_ID, PLATFORMS, SIZE_PRESETS } from './presets'
import type { TextItem } from './text'

export const UNTITLED = 'Thiết kế không tên'
const MAX_NAME = 40

/** Tên tự đặt cho thiết kế: dòng đầu tiên của dòng chữ đầu tiên có nội dung. Null nếu trên ảnh chưa có chữ. */
export function autoName(texts: Pick<TextItem, 'text'>[]): string | null {
  for (const { text } of texts) {
    const line = text
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .find(Boolean)
    if (line) return line.length > MAX_NAME ? `${line.slice(0, MAX_NAME - 1).trimEnd()}…` : line
  }
  return null
}

/** Tên hiển thị: tên người dùng tự đặt, không thì lấy theo chữ trên ảnh, không có chữ thì "Thiết kế không tên". */
export const designTitle = (name: string | null, texts: Pick<TextItem, 'text'>[]) => name ?? autoName(texts) ?? UNTITLED

/** Dòng mô tả cỡ ảnh của thiết kế, vd "Instagram · Bài đăng dọc (4:5)" hoặc "4672 × 7008 px". */
export function sizeLabel(presetId: string, width: number, height: number): string {
  const preset = presetId === CUSTOM_PRESET_ID || presetId === ORIGINAL_PRESET_ID ? undefined : SIZE_PRESETS.find((p) => p.id === presetId)
  if (!preset) return `${width} × ${height} px`
  return `${PLATFORMS.find((p) => p.id === preset.platform)?.label} · ${preset.label} (${preset.ratio})`
}

/** Tên cho bản sao: "X (bản sao)", "X (bản sao 2)"… sao cho không trùng tên nào đang có. */
export function copyName(title: string, taken: string[]): string {
  const base = title.replace(/ \(bản sao(?: \d+)?\)$/, '')
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${base} (bản sao)` : `${base} (bản sao ${n})`
    if (!taken.includes(name)) return name
  }
}
