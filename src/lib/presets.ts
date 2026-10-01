export interface SizePreset {
  id: string
  group: string
  label: string
  ratio: string
  width: number
  height: number
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: 'ig-portrait', group: 'Instagram', label: 'Bài đăng dọc', ratio: '4:5', width: 1080, height: 1350 },
  { id: 'ig-tall', group: 'Instagram', label: 'Bài đăng 3:4', ratio: '3:4', width: 1080, height: 1440 },
  { id: 'ig-square', group: 'Instagram', label: 'Vuông', ratio: '1:1', width: 1080, height: 1080 },
  { id: 'ig-landscape', group: 'Instagram', label: 'Ngang', ratio: '1.91:1', width: 1080, height: 566 },
  { id: 'story', group: 'Story · Reels · TikTok', label: 'Toàn màn hình', ratio: '9:16', width: 1080, height: 1920 },
  { id: 'fb-landscape', group: 'Facebook', label: 'Ảnh ngang', ratio: '3:2', width: 2048, height: 1365 },
  { id: 'fb-portrait', group: 'Facebook', label: 'Ảnh dọc', ratio: '2:3', width: 1365, height: 2048 },
  { id: 'fb-square', group: 'Facebook', label: 'Vuông', ratio: '1:1', width: 2048, height: 2048 },
  { id: 'fb-cover', group: 'Facebook', label: 'Ảnh bìa', ratio: '2.63:1', width: 1640, height: 624 },
  { id: 'wide', group: 'Khác', label: 'YouTube · màn hình ngang', ratio: '16:9', width: 1920, height: 1080 },
  { id: 'pin', group: 'Khác', label: 'Pinterest', ratio: '2:3', width: 1000, height: 1500 },
  { id: 'a4', group: 'Khác', label: 'In A4 dọc (300dpi)', ratio: 'A4', width: 2480, height: 3508 },
]

export const CUSTOM_PRESET_ID = 'custom'
export const MIN_CANVAS = 200
export const MAX_CANVAS = 6000
/** Cạnh dài tối đa của file xuất ra (sau khi nhân hệ số). */
export const MAX_EXPORT_EDGE = 10000

export const BACKGROUNDS = ['#ffffff', '#faf6f0', '#f1e4d3', '#e8d5c4', '#d9e2d5', '#cfd9e6', '#2b2622', '#000000']
