import { memo, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { captureTemplate, type Box, type TextTemplate } from '../lib/templates'
import { fontInfo, FONTS, isSystemFont, type TextItem } from '../lib/text'
import { canvasSize, useStore } from '../store'
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

/** Lưới các mẫu chữ dựng sẵn: bấm một mẫu là chèn cả nhóm chữ của nó vào giữa ảnh. */
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

  return (
    <div className="space-y-2.5">
      <p className="text-xs leading-relaxed text-muted">Bấm một mẫu để chèn vào ảnh, rồi bấm vào từng dòng chữ để thay nội dung của bạn.</p>
      {import.meta.env.DEV && <SaveTemplate templates={templates ?? []} />}
      <div className="-mx-3 grid content-start gap-2 px-3 pb-3 pt-1" style={{ gridTemplateColumns: GRID_COLUMNS }}>
        {templates?.map((t) => <TemplateCard key={t.font} template={t} onPick={insertTemplate} />)}
      </div>
      {templates && !templates.length && <p className="px-3 py-6 text-center text-[13px] text-muted">Chưa có mẫu chữ nào.</p>}
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
    const { width, height } = canvasSize(s)
    const boxes = members.map((t) => textBox(t.id, width))
    if (boxes.some((b) => !b)) return s.toast('Không đo được vị trí chữ trên khung.', 'error')
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
