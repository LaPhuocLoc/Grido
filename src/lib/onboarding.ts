import type { TemplateItem } from './templates'

/**
 * Dẫn đường cho người mới: một chấm trên dải công cụ chỉ mục nên bấm tiếp theo, và từng gợi ý thao tác một trên khung
 * ghép. Tất cả là hàm thuần; trạng thái (đã ghé mục nào, đã biết thao tác nào) nằm trong store.
 */

/** Các mục chỉnh ảnh ghép, theo đúng thứ tự trên dải công cụ. */
export const GUIDE_TABS = ['layout', 'size', 'style', 'text'] as const
export type GuideTab = (typeof GUIDE_TABS)[number]

/** Chỗ đặt chấm: mục Ảnh, một mục chỉnh, hoặc nút Xuất ảnh. */
export type GuideTarget = 'library' | GuideTab | 'export'

/**
 * Mục nên bấm tiếp theo; null khi không cần chỉ nữa (đã xuất ảnh lần đầu). Chưa có ảnh trên khung thì là mục Ảnh; có rồi
 * thì lần lượt các mục chưa ghé, hết thì tới nút Xuất ảnh.
 */
export function nextStep(s: { done: boolean; cells: number; visited: readonly string[] }): GuideTarget | null {
  if (s.done) return null
  if (!s.cells) return 'library'
  // Một ảnh thì không có bố cục nào để chọn.
  return GUIDE_TABS.find((tab) => !s.visited.includes(tab) && (tab !== 'layout' || s.cells > 1)) ?? 'export'
}

export const HINTS = ['fill', 'pan', 'zoom', 'swap', 'resize', 'marquee'] as const
export type Hint = (typeof HINTS)[number]

/**
 * Gợi ý thao tác đang cần hiện trên khung ghép (mỗi lần một cái); làm được thao tác nào thì gợi ý đó không hiện lại.
 * `cells`: số ô của bố cục; `photos`: số ô đã có ảnh. `canPan`: có ảnh tràn ra ngoài ô của nó, tức là kéo thì ảnh mới dịch được. `texts`: số dòng chữ / nhóm chữ độc lập.
 */
export function nextHint(s: { cells: number; photos: number; texts: number; canPan: boolean; seen: readonly string[] }): Hint | null {
  if (!s.cells) return null
  const fits: Record<Hint, boolean> = {
    // Bố cục còn ô trống (chọn bố cục trước, đưa ảnh vào sau).
    fill: s.photos < s.cells,
    pan: s.canPan,
    zoom: s.photos > 0,
    swap: s.cells > 1 && s.photos > 0,
    resize: s.cells > 1,
    marquee: s.texts > 1,
  }
  // Vừa có nhiều dòng chữ thì chỉ cách chọn chung trước, kẻo người dùng bấm từng dòng một.
  const order: Hint[] = s.texts > 1 ? ['marquee', ...HINTS] : [...HINTS]
  return order.find((hint) => fits[hint] && !s.seen.includes(hint)) ?? null
}

/** Ảnh mẫu đóng kèm app (public/samples). */
export const SAMPLES = ['nui-phu-si', 'pho-tuyet', 'may-ban-nuoc', 'ponyo', 'hai-chu-meo', 'onomichi']

/**
 * Ảnh ghép dựng sẵn từ ảnh mẫu để người mới có ngay thứ để vọc: một ảnh ngang lớn, ba ảnh dọc bên dưới, khung bài đăng
 * Instagram 4:5 và một nhóm chữ (toạ độ theo tỉ lệ khung, cỡ chữ theo % cạnh ngắn).
 */
export const SAMPLE_COLLAGE: { cells: string[]; layout: string; preset: string; texts: TemplateItem[] } = {
  cells: ['onomichi', 'nui-phu-si', 'pho-tuyet', 'ponyo'],
  layout: 'V(2:*,H3)',
  preset: 'ig-portrait',
  texts: [
    { text: 'NHẬT BẢN', x: 0.5, y: 0.13, size: 13, color: '#ffffff', font: 'vn-1ftv-ranoya', shadow: true, bold: false },
    { text: 'những ngày rong chơi', x: 0.5, y: 0.225, size: 5, color: '#ffffff', font: 'vn-1ftv-ranoya', shadow: true, bold: false },
  ],
}
