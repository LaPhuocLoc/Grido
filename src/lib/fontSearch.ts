import { FONT_GROUPS, FONT_LANGS, type FontGroup, type FontInfo, type FontLang } from './text'

/** Bỏ dấu để gõ "viet tay" vẫn ra "Viết tay". */
export const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()

/** Tên kiểu chữ bằng tiếng Anh, để gõ "script" hay "serif" cũng ra đúng nhóm. */
const GROUP_WORDS: Record<FontGroup, string> = {
  sans: 'sans sans-serif',
  serif: 'serif',
  script: 'script handwriting brush',
  display: 'display decorative',
}
const GROUP_KEYS = Object.fromEntries(FONT_GROUPS.map((g) => [g.id, `${plain(g.label)} ${GROUP_WORDS[g.id]}`])) as Record<FontGroup, string>

/** Tên font ở hai dạng: nguyên từ và viết liền, để "helveticaneue" hay "svn gilroy" đều khớp "SVN-Helvetica Neue" / "SVN-Gilroy". */
const nameKey = (label: string) => {
  const name = plain(label)
  return `${name} ${name.replace(/[^a-z0-9]/g, '')}`
}

/**
 * Lọc font theo từ khoá: mọi từ phải khớp tên font hoặc tên kiểu chữ. Font khớp bằng tên đứng trước font chỉ khớp nhờ kiểu chữ;
 * trong mỗi nhóm giữ nguyên thứ tự ban đầu.
 */
export function searchFonts(fonts: FontInfo[], query: string): FontInfo[] {
  const words = plain(query).split(/\s+/).filter(Boolean)
  if (!words.length) return fonts
  const byName: FontInfo[] = []
  const byStyle: FontInfo[] = []
  for (const font of fonts) {
    const name = nameKey(font.label)
    if (words.every((w) => name.includes(w))) byName.push(font)
    else if (words.every((w) => name.includes(w) || GROUP_KEYS[font.group].includes(w))) byStyle.push(font)
  }
  return [...byName, ...byStyle]
}

export function countByGroup(fonts: FontInfo[]): Record<FontGroup, number> {
  const counts = Object.fromEntries(FONT_GROUPS.map((g) => [g.id, 0])) as Record<FontGroup, number>
  for (const font of fonts) counts[font.group]++
  return counts
}

/** Các ngôn ngữ mà kho font có, theo thứ tự hiển thị. */
export const availableLangs = (fonts: FontInfo[]): FontLang[] => FONT_LANGS.map((l) => l.id).filter((id) => fonts.some((f) => f.langs.includes(id)))

/** Đoán ngôn ngữ của dòng chữ để mở sẵn đúng nhóm font. Chữ Hàn có thể lẫn chữ Hán nên Hangul được xét trước. */
export function detectLang(text: string): FontLang {
  if (/[ᄀ-ᇿ㄰-㆏가-힯]/.test(text)) return 'ko'
  if (/[぀-ヿ㐀-䶿一-鿿]/.test(text)) return 'ja'
  return 'vi'
}

const SAMPLE_FALLBACK = 'Xin chào Việt Nam'
const SAMPLE_MAX = 40

/** Câu chữ mẫu cho danh sách "chữ của bạn": dòng đầu tiên có nội dung của dòng chữ đang chọn. */
export function sampleLine(text: string | undefined): string {
  const line = (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  return line ? [...line].slice(0, SAMPLE_MAX).join('') : SAMPLE_FALLBACK
}
