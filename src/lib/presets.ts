export type Platform = 'instagram' | 'facebook' | 'tiktok'

/** Ảnh sẽ hiện ở đâu trên nền tảng; quyết định hình minh hoạ của khung. */
export type PresetKind = 'post' | 'carousel' | 'full' | 'reel' | 'profile' | 'cover'

export interface SizePreset {
  id: string
  platform: Platform
  kind: PresetKind
  label: string
  ratio: string
  width: number
  height: number
}

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
]

/** Nhóm "Phổ biến": những khung hay dùng nhất, gom lại một chỗ với tên ghi rõ nền tảng. */
export const POPULAR_PRESETS: { id: string; label: string }[] = [
  { id: 'ig-portrait', label: 'Bài đăng Instagram' },
  { id: 'fb-portrait', label: 'Ảnh dọc Facebook' },
  { id: 'fb-landscape', label: 'Ảnh ngang Facebook' },
  { id: 'story', label: 'Tin story' },
]

export const SIZE_PRESETS: SizePreset[] = [
  { id: 'ig-portrait', platform: 'instagram', kind: 'post', label: 'Bài đăng dọc', ratio: '4:5', width: 1080, height: 1350 },
  { id: 'ig-tall', platform: 'instagram', kind: 'post', label: 'Bài đăng 3:4', ratio: '3:4', width: 1080, height: 1440 },
  { id: 'ig-square', platform: 'instagram', kind: 'post', label: 'Bài đăng vuông', ratio: '1:1', width: 1080, height: 1080 },
  { id: 'ig-landscape', platform: 'instagram', kind: 'post', label: 'Bài đăng ngang', ratio: '1.91:1', width: 1080, height: 566 },
  { id: 'ig-carousel', platform: 'instagram', kind: 'carousel', label: 'Carousel', ratio: '4:5', width: 1080, height: 1350 },
  { id: 'story', platform: 'instagram', kind: 'full', label: 'Tin', ratio: '9:16', width: 1080, height: 1920 },
  { id: 'ig-reel', platform: 'instagram', kind: 'reel', label: 'Reel', ratio: '9:16', width: 1080, height: 1920 },
  { id: 'ig-profile', platform: 'instagram', kind: 'profile', label: 'Ảnh hồ sơ', ratio: '1:1', width: 1080, height: 1080 },

  { id: 'fb-post', platform: 'facebook', kind: 'post', label: 'Bài đăng ngang', ratio: '1.91:1', width: 1200, height: 630 },
  { id: 'fb-post-square', platform: 'facebook', kind: 'post', label: 'Bài đăng vuông', ratio: '1:1', width: 1080, height: 1080 },
  { id: 'fb-post-portrait', platform: 'facebook', kind: 'post', label: 'Bài đăng dọc', ratio: '4:5', width: 1080, height: 1350 },
  { id: 'fb-landscape', platform: 'facebook', kind: 'post', label: 'Ảnh ngang', ratio: '3:2', width: 2048, height: 1365 },
  { id: 'fb-portrait', platform: 'facebook', kind: 'post', label: 'Ảnh dọc', ratio: '2:3', width: 1365, height: 2048 },
  { id: 'fb-square', platform: 'facebook', kind: 'post', label: 'Vuông nét cao', ratio: '1:1', width: 2048, height: 2048 },
  { id: 'fb-story', platform: 'facebook', kind: 'full', label: 'Tin', ratio: '9:16', width: 1080, height: 1920 },
  { id: 'fb-cover', platform: 'facebook', kind: 'cover', label: 'Ảnh bìa', ratio: '2.63:1', width: 1640, height: 624 },
  { id: 'fb-event', platform: 'facebook', kind: 'cover', label: 'Bìa sự kiện', ratio: '1.91:1', width: 1920, height: 1005 },
  { id: 'fb-profile', platform: 'facebook', kind: 'profile', label: 'Ảnh hồ sơ', ratio: '1:1', width: 1080, height: 1080 },

  { id: 'tt-video', platform: 'tiktok', kind: 'full', label: 'Ảnh / video dọc', ratio: '9:16', width: 1080, height: 1920 },
  { id: 'tt-carousel', platform: 'tiktok', kind: 'carousel', label: 'Ảnh carousel', ratio: '4:5', width: 1080, height: 1350 },
  { id: 'tt-square', platform: 'tiktok', kind: 'post', label: 'Ảnh vuông', ratio: '1:1', width: 1080, height: 1080 },
  { id: 'tt-profile', platform: 'tiktok', kind: 'profile', label: 'Ảnh hồ sơ', ratio: '1:1', width: 1080, height: 1080 },
]

/** Khung dùng khi chưa có ảnh nào trong bản ghép. */
export const DEFAULT_PRESET_ID = 'ig-portrait'

/** Khung đã gỡ khỏi danh sách; bản nháp cũ đang dùng thì chuyển sang "Tuỳ chỉnh" với đúng kích thước này. */
export const RETIRED_PRESETS: Record<string, { width: number; height: number }> = {
  wide: { width: 1920, height: 1080 },
  pin: { width: 1000, height: 1500 },
  a4: { width: 2480, height: 3508 },
}

export const CUSTOM_PRESET_ID = 'custom'
/** Khung lấy theo tỉ lệ và độ phân giải file gốc của ảnh đầu tiên; kích thước nằm ở customW/customH. */
export const ORIGINAL_PRESET_ID = 'original'
export const MIN_CANVAS = 200
/** Cạnh dài tối đa của khung, cũng là của file xuất ra. Đủ lớn để "Ảnh gốc" giữ nguyên độ phân giải ảnh máy ảnh (vd 4672×7008). */
export const MAX_CANVAS = 10000

/** Chiều của khung: dọc, vuông hay ngang. */
export type Orientation = 'portrait' | 'square' | 'landscape'

export const orientationOf = ({ width, height }: { width: number; height: number }): Orientation =>
  width === height ? 'square' : width < height ? 'portrait' : 'landscape'

/** Khung vuông không có cạnh dài để đảo: đổi sang dọc / ngang thì lấy 4:5, tỉ lệ bài đăng quen thuộc nhất. */
const FROM_SQUARE = 1.25

/**
 * Khung width×height đổi sang chiều `to`, giữ nguyên độ phân giải: dọc ↔ ngang là đảo hai cạnh, vuông là lấy cạnh ngắn.
 * `squareRatio` là tỉ lệ cạnh dài / cạnh ngắn dùng khi khung đang vuông (mặc định 4:5).
 */
export function orientCanvas(
  size: { width: number; height: number },
  to: Orientation,
  squareRatio = FROM_SQUARE,
): { width: number; height: number } {
  let short = Math.min(size.width, size.height)
  let long = Math.max(size.width, size.height)
  if (to === 'square') return { width: short, height: short }
  if (long === short) {
    long = Math.min(MAX_CANVAS, Math.round(short * squareRatio))
    short = Math.round(long / squareRatio)
  }
  return to === 'portrait' ? { width: short, height: long } : { width: long, height: short }
}

/** Khung có sẵn đúng cỡ width×height, ưu tiên cùng nền tảng với khung đang dùng. */
export function presetOfSize({ width, height }: { width: number; height: number }, platform?: Platform): SizePreset | undefined {
  const same = SIZE_PRESETS.filter((p) => p.width === width && p.height === height)
  return same.find((p) => p.platform === platform) ?? same[0]
}

export const BACKGROUNDS =['#ffffff', '#faf6f0', '#f1e4d3', '#e8d5c4', '#d9e2d5', '#cfd9e6', '#2b2622', '#000000']

/** Khung "Ảnh gốc" cho một ảnh width×height: giữ tỉ lệ, thu lại nếu vượt giới hạn khung. */
export function originalCanvas(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_CANVAS / Math.max(width, height))
  const fit = (v: number) => Math.min(MAX_CANVAS, Math.max(MIN_CANVAS, Math.round(v * scale)))
  return { width: fit(width), height: fit(height) }
}
