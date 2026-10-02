import type { TextTemplate } from '../lib/templates'

// Mỗi font có mẫu là một file <id font>.json trong thư mục này (agent dựng từ ảnh mẫu của font, hoặc lưu từ chế độ dev).
const files = import.meta.glob<TextTemplate>('./*.json', { eager: true, import: 'default' })

/** Các mẫu chữ dựng sẵn, theo thứ tự id font. */
export const TEMPLATES: TextTemplate[] = Object.keys(files)
  .sort()
  .map((path) => files[path])
