import { Search, X } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { captureTemplate, type Box, type TextTemplate } from '../lib/templates'
import { countByGroup, searchFonts } from '../lib/fontSearch'
import { FONT_GROUPS, FONT_LANGS, fontInfo, FONTS, isSystemFont, type FontGroup, type FontLang, type TextItem } from '../lib/text'
import { outputSize, useStore } from '../store'
import { chip, LangSelect } from './FontPicker'
import { Button, cx } from './ui'

/** Bảng ở bề rộng mặc định xếp 2 cột; kéo rộng dần thì thêm cột, như lưới font. */
const GRID_COLUMNS = 'repeat(auto-fill, minmax(max(130px, calc((100% - 32px) / 5)), 1fr))'

// Dữ liệu mẫu nằm ở một chunk riêng, chỉ tải khi người dùng mở bảng Chữ.
let loading: Promise<TextTemplate[]> | null = null
const loadTemplates = () => (loading ??= import('../templates').then((m) => m.TEMPLATES))

const TemplateCard = memo(function TemplateCard({ template, onPick }: { template: TextTemplate; onPick: (template: TextTemplate) => void }) {
  const font = fontInfo(template.font)
  // Tải sẵn các font của mẫu khi rê chuột tới, để lúc bấm chữ hiện đúng font ngay.
  const warm = () => {
    for (const id of new Set(template.items.map((t) => t.font ?? 'round'))) void document.fonts.load(`500 16px ${fontInfo(id).family}`).catch(() => {})
  }
  return (
    <div className="group relative transition-transform duration-100 ease-[ease] hover:z-10 hover:scale-110 focus-within:z-10">
      <button
        type="button"
        aria-label={`Mẫu chữ ${font.label}`}
        onClick={() => onPick(template)}
        onPointerEnter={warm}
        onFocus={warm}
        className="relative block w-full overflow-hidden rounded-xl border border-line bg-card text-left transition-[border-color,box-shadow] duration-100 group-hover:border-edge group-hover:shadow-soft"
      >
        <img src={font.thumb} alt="" width={320} height={180} loading="lazy" decoding="async" draggable={false} className="block aspect-video w-full bg-sand object-cover" />
        <span className="absolute inset-x-0 bottom-0 truncate bg-card/60 px-2 py-1 text-[11px] font-semibold leading-4 text-ink opacity-0 backdrop-blur-[2px] transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100">
          {font.label}
        </span>
      </button>
    </div>
  )
})

/**
 * Lưới các mẫu chữ dựng sẵn: bấm một mẫu là chèn cả nhóm chữ của nó vào giữa ảnh.
 * Lọc như bảng phông chữ: tìm theo tên, theo ngôn ngữ và theo kiểu chữ của phông chính trong mẫu.
 */
export function TemplatePicker() {
  const [templates, setTemplates] = useState<TextTemplate[] | null>(null)
  useEffect(() => {
    let alive = true
    void loadTemplates().then((list) => alive && setTemplates(list))
    return () => {
      alive = false
    }
  }, [])
  const { insertTemplate } = useStore.getState()
  const [query, setQuery] = useState('')
  const [style, setStyle] = useState<FontGroup | 'all'>('all')
  const [lang, setLang] = useState<FontLang>('vi')

  /** Phông chính của từng mẫu: mẫu được xếp loại theo ngôn ngữ và kiểu chữ của phông này. */
  const fonts = useMemo(() => (templates ?? []).map((t) => fontInfo(t.font)), [templates])
  // Ngôn ngữ nào có mẫu thì mới hiện; chỉ một ngôn ngữ thì nút chọn ngôn ngữ ẩn đi.
  const langs = useMemo(() => FONT_LANGS.map((l) => l.id).filter((id) => fonts.some((f) => f.langs.includes(id))), [fonts])
  const byLang = langs.length > 1
  const matched = useMemo(() => searchFonts(byLang ? fonts.filter((f) => f.langs.includes(lang)) : fonts, query), [fonts, byLang, lang, query])
  const counts = useMemo(() => countByGroup(matched), [matched])
  const shown = useMemo(() => {
    const ids = new Set((style === 'all' ? matched : matched.filter((f) => f.group === style)).map((f) => f.id))
    return (templates ?? []).filter((t) => ids.has(t.font))
  }, [templates, matched, style])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <label className="relative block min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              // Bắt đầu gõ thì tìm trên mọi kiểu chữ, như bảng phông chữ.
              if (!query.trim() && e.target.value.trim()) setStyle('all')
              setQuery(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Escape' || !query) return
              e.stopPropagation()
              setQuery('')
            }}
            placeholder={templates ? `Tìm trong ${shown.length} mẫu chữ` : 'Tìm mẫu chữ'}
            aria-label="Tìm mẫu chữ"
            className="h-9 w-full rounded-full border border-line bg-surface pl-9 pr-8 text-[13px] focus:border-coral focus:outline-none focus:ring-4 focus:ring-coral/15"
          />
          {query && (
            <button
              type="button"
              aria-label="Xoá từ khoá"
              data-tip="Xoá từ khoá (Esc)"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:bg-sand hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
        {byLang && <LangSelect value={lang} langs={langs} onChange={setLang} tip="Mẫu chữ cho thứ tiếng nào" />}
      </div>

      {/* Kiểu chữ: bốn nút chia đều bề rộng; bấm lại nút đang bật để về mọi kiểu. */}
      <div className="flex gap-1" role="group" aria-label="Kiểu chữ">
        {FONT_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={style === g.id}
            data-tip={style === g.id ? 'Bấm lần nữa để xem mọi kiểu chữ' : `${counts[g.id]} mẫu chữ`}
            onClick={() => setStyle(style === g.id ? 'all' : g.id)}
            className={cx(chip(style === g.id), !counts[g.id] && style !== g.id && 'opacity-50')}
          >
            {g.label}
          </button>
        ))}
      </div>

      {import.meta.env.DEV && <SaveTemplate templates={templates ?? []} />}
      <div className="-mx-3 grid content-start gap-2 px-3 pb-3 pt-1" style={{ gridTemplateColumns: GRID_COLUMNS }}>
        {shown.map((t) => (
          <TemplateCard key={t.font} template={t} onPick={insertTemplate} />
        ))}
      </div>
      {templates && !shown.length && (
        <p className="px-3 py-6 text-center text-[13px] leading-relaxed text-muted">
          {query.trim() ? (
            <>
              Không có mẫu chữ nào khớp.{' '}
              <button type="button" className="font-semibold text-coral-dark hover:underline" onClick={() => setQuery('')}>
                Xoá từ khoá
              </button>
            </>
          ) : (
            'Chưa có mẫu chữ nào trong nhóm này.'
          )}
        </p>
      )}
    </div>
  )
}

/** Hình chữ nhật (px khung xuất) bao quanh một dòng chữ đang hiện trên khung ghép. */
function textBox(id: string, width: number): Box | null {
  const node = document.querySelector(`[data-text="${id}"]`)
  const origin = node?.parentElement?.getBoundingClientRect()
  if (!node || !origin) return null
  const k = origin.width / width
  const r = node.getBoundingClientRect()
  return { left: (r.left - origin.left) / k, top: (r.top - origin.top) / k, right: (r.right - origin.left) / k, bottom: (r.bottom - origin.top) / k }
}

/**
 * Chỉ có ở bản dev (`npm run dev:web`): lưu dòng chữ / nhóm chữ đang chọn thành mẫu của một font.
 * Dev server ghi thẳng vào src/templates/<id font>.json; xem mục "Sửa mẫu chữ" trong CLAUDE.md.
 */
function SaveTemplate({ templates }: { templates: TextTemplate[] }) {
  const members = useStore(
    useShallow((s): TextItem[] | null => {
      const active = s.texts.find((t) => t.id === s.activeText)
      return !active ? null : active.group ? s.texts.filter((t) => t.group === active.group) : [active]
    }),
  )
  // Mặc định lưu cho font của dòng chữ to nhất (tiêu đề).
  const lead = members ? [...members].sort((a, b) => b.size - a.size)[0].font : ''
  const [font, setFont] = useState(lead)
  useEffect(() => setFont(lead), [lead])
  if (!members) return <p className="rounded-xl border border-dashed border-edge p-3 text-xs text-muted">Dev: chọn một dòng chữ / nhóm chữ trên ảnh để lưu thành mẫu.</p>

  const save = async () => {
    const s = useStore.getState()
    const { width, height } = outputSize(s)
    const boxes = members.map((t) => textBox(t.id, width))
    if (boxes.some((b) => !b)) return s.toast('Không đo được vị trí chữ trên ảnh.', 'error')
    const bg = templates.find((t) => t.font === font)?.bg ?? '#f3ece4'
    const template = captureTemplate(members, boxes as Box[], width, height, font, bg)
    const res = await fetch('/__dev/template', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(template) }).catch(() => null)
    if (res?.ok) s.toast(`Đã lưu mẫu của font ${fontInfo(font).label} vào src/templates/${font}.json`, 'success')
    else s.toast('Không lưu được mẫu (chỉ lưu được khi chạy npm run dev:web).', 'error')
  }

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-edge p-3">
      <p className="text-xs font-semibold text-ink">Dev: lưu {members.length > 1 ? `nhóm ${members.length} dòng` : 'dòng chữ'} đang chọn thành mẫu</p>
      <select
        aria-label="Font của mẫu"
        value={font}
        onChange={(e) => setFont(e.target.value)}
        className={cx('h-8 w-full rounded-lg border border-line bg-surface px-2 text-[13px]', isSystemFont(font) && 'text-coral-dark')}
      >
        {FONTS.filter((f) => f.thumb).map((f) => (
          <option key={f.id} value={f.id}>
            {f.label} ({f.id}){templates.some((t) => t.font === f.id) ? ' · đã có mẫu' : ''}
          </option>
        ))}
      </select>
      <Button onClick={() => void save()} className="h-8 w-full text-[13px]">
        Lưu thành mẫu
      </Button>
    </div>
  )
}
