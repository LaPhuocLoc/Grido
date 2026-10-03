import { ArrowLeftRight, Bookmark, Download, Eye, Folder, Heart, Image as ImageIcon, LoaderCircle, TriangleAlert, Type, X } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import { desktop } from '../lib/desktop'
import { placeImage } from '../lib/geometry'
import { collageLayout } from '../lib/imaging/exportCollage'
import { computeLayout } from '../lib/layout/compute'
import { parseLayout } from '../lib/layout/dsl'
import { getLayouts, totalLayoutCount } from '../lib/layout/registry'
import type { LayoutCategory, LayoutNode } from '../lib/layout/types'
import {
  BACKGROUNDS,
  CUSTOM_PRESET_ID,
  MAX_CANVAS,
  MIN_CANVAS,
  ORIGINAL_PRESET_ID,
  PLATFORMS,
  SIZE_PRESETS,
  type Platform,
} from '../lib/presets'
import { buildSpec, exportToFile, useExportProgress } from '../lib/useCollage'
import { canvasSize, originalCanvasOf, pctToPx, currentDesign, useStore, type ExportFormat, type ExportSharpen } from '../store'
import { FontPicker } from './FontPicker'
import { PresetArt } from './PresetArt'
import { styleTexts } from './TextLayer'
import { TemplatePicker } from './TemplatePicker'
import { Button, cx, Section, Segmented, Slider } from './ui'

/* ───────────── Khung ảnh ───────────── */

type PresetGroup = Platform | 'fav'

const PRESET_GROUPS: { id: PresetGroup; label: string }[] = [...PLATFORMS, { id: 'fav', label: 'Yêu thích' }]

export function SizePanel() {
  const presetId = useStore((s) => s.presetId)
  const customW = useStore((s) => s.customW)
  const customH = useStore((s) => s.customH)
  const favoritePresets = useStore((s) => s.favoritePresets)
  const firstPhoto = useStore((s) => s.photos.find((p) => p.id === s.selected[0]))
  const { set, toggleFavoritePreset, applyOriginalSize } = useStore.getState()
  // Mở tab ở đúng nền tảng của khung đang dùng.
  const [group, setGroup] = useState<PresetGroup>(() => SIZE_PRESETS.find((p) => p.id === presetId)?.platform ?? 'instagram')
  const isCustom = presetId === CUSTOM_PRESET_ID
  const isOriginal = presetId === ORIGINAL_PRESET_ID
  const current = canvasSize({ presetId, customW, customH })
  const original = isOriginal ? current : firstPhoto && originalCanvasOf(firstPhoto)
  const favSet = useMemo(() => new Set(favoritePresets), [favoritePresets])
  const shown = SIZE_PRESETS.filter((p) => (group === 'fav' ? favSet.has(p.id) : p.platform === group))

  const dimension = (value: number, onChange: (v: number) => void, label: string) => (
    <label className="flex-1 space-y-1">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={MIN_CANVAS}
        max={MAX_CANVAS}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        onBlur={(e) => onChange(Math.min(MAX_CANVAS, Math.max(MIN_CANVAS, Math.round(Number(e.target.value) || MIN_CANVAS))))}
        className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm tabular-nums focus:border-coral focus:outline-none"
      />
    </label>
  )

  return (
    <div className="space-y-6">
      <button
        type="button"
        aria-pressed={isOriginal}
        disabled={!firstPhoto}
        onClick={applyOriginalSize}
        className={cx(
          'flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all disabled:opacity-60',
          isOriginal ? 'border-coral bg-blush shadow-sm' : 'border-line bg-card enabled:hover:border-edge enabled:hover:bg-surface',
        )}
      >
        <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl', isOriginal ? 'bg-coral/15 text-coral-dark' : 'bg-sand text-soft')}>
          <ImageIcon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">Ảnh gốc</span>
          <span className="block text-[11px] leading-snug text-muted">
            {firstPhoto ? 'Theo ảnh đầu tiên' : 'Chọn ảnh để dùng kích thước gốc'}
          </span>
        </span>
        {original && (
          <span className={cx('shrink-0 text-xs font-bold tabular-nums', isOriginal ? 'text-coral-dark' : 'text-soft')}>
            {original.width}×{original.height}
          </span>
        )}
      </button>

      <Section title="Khung theo nền tảng">
        <div className="flex gap-1.5">
          {PRESET_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={group === g.id}
              onClick={() => setGroup(g.id)}
              className={cx(
                'flex h-8 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-semibold transition-colors active:scale-95',
                group === g.id ? 'bg-ink text-paper' : 'bg-sand text-soft hover:text-ink',
              )}
            >
              {g.id === 'fav' && <Heart className="size-3 shrink-0" />}
              {g.label}
              {g.id === 'fav' && <span className="font-normal opacity-60">{favoritePresets.length}</span>}
            </button>
          ))}
        </div>

        {shown.length ? (
          <div key={group} className="grid animate-fade grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
            {shown.map((p) => {
              const active = p.id === presetId
              const fav = favSet.has(p.id)
              return (
                <div key={p.id} className="group relative">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => set({ presetId: p.id })}
                    className={cx(
                      'block w-full overflow-hidden rounded-2xl border text-left transition-all',
                      active ? 'border-coral bg-blush shadow-sm' : 'border-line bg-card hover:border-edge hover:shadow-sm',
                    )}
                  >
                    <span className={cx('block', active ? 'bg-coral/10' : 'bg-sand')}>
                      <PresetArt preset={p} />
                    </span>
                    <span className="block px-2.5 py-2">
                      {group === 'fav' && (
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">
                          {PLATFORMS.find((x) => x.id === p.platform)?.label}
                        </span>
                      )}
                      <span className="block truncate text-[13px] font-semibold">{p.label}</span>
                      <span className="block text-[11px] tabular-nums text-muted">
                        <b className={active ? 'text-coral-dark' : 'text-soft'}>{p.ratio}</b> · {p.width}×{p.height}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={fav}
                    aria-label={fav ? `Bỏ thích khung ${p.label}` : `Thích khung ${p.label}`}
                    data-tip={fav ? 'Bỏ khỏi Yêu thích' : 'Thêm vào Yêu thích'}
                    onClick={() => toggleFavoritePreset(p.id)}
                    className={cx(
                      'absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-card shadow-sm transition-all hover:scale-110 active:scale-90 focus-visible:opacity-100',
                      fav ? 'text-coral' : 'text-soft opacity-0 hover:text-coral group-hover:opacity-100 [@media(hover:none)]:opacity-60',
                    )}
                  >
                    <Heart key={String(fav)} className={cx('size-3.5', fav && 'animate-pop fill-current')} />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="rounded-2xl bg-sand p-4 text-[13px] leading-relaxed text-soft">
            Chưa có khung yêu thích nào. Bấm biểu tượng <Heart className="inline size-3.5 align-[-2px]" /> ở góc một khung để thêm vào đây.
          </p>
        )}
      </Section>

      <Section title="Tuỳ chỉnh">
        <div
          className={cx(
            'rounded-2xl border p-3 transition-colors',
            isCustom ? 'border-coral bg-blush' : 'border-line bg-card',
          )}
        >
          <div className="flex items-end gap-2">
            {dimension(
              isCustom ? customW : current.width,
              (v) => set({ presetId: CUSTOM_PRESET_ID, customW: v, customH: isCustom ? customH : current.height }),
              'Rộng (px)',
            )}
            <button
              type="button"
              aria-label="Đảo chiều rộng và cao"
              data-tip="Đảo chiều"
              onClick={() => set({ presetId: CUSTOM_PRESET_ID, customW: current.height, customH: current.width })}
              className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-full text-soft hover:bg-surface hover:text-ink"
            >
              <ArrowLeftRight className="size-4" />
            </button>
            {dimension(
              isCustom ? customH : current.height,
              (v) => set({ presetId: CUSTOM_PRESET_ID, customH: v, customW: isCustom ? customW : current.width }),
              'Cao (px)',
            )}
          </div>
        </div>
      </Section>
    </div>
  )
}

/* ───────────── Bố cục ───────────── */

type CategoryId = LayoutCategory | 'all' | 'fav' | 'saved'

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'fav', label: 'Yêu thích' },
  { id: 'saved', label: 'Đã lưu' },
  { id: 'grid', label: 'Lưới' },
  { id: 'hero', label: 'Nổi bật' },
  { id: 'mosaic', label: 'Khảm' },
]

const LayoutThumb = memo(function LayoutThumb({
  id,
  tree,
  ratio,
  active,
}: {
  id: string
  /** Bố cục đã lưu truyền thẳng cây; bố cục có sẵn thì dựng từ id (chuỗi DSL). */
  tree?: LayoutNode
  ratio: number
  active: boolean
}) {
  const w = 100
  const h = Math.round(w / ratio)
  const { cells } = useMemo(
    () => computeLayout(tree ?? parseLayout(id), { x: 5, y: 5, w: w - 10, h: h - 10 }, 4),
    [id, tree, h],
  )
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full" aria-hidden>
      {cells.map((c, i) => (
        <rect
          key={i}
          x={c.x}
          y={c.y}
          width={Math.max(1, c.w)}
          height={Math.max(1, c.h)}
          rx={3}
          className={cx('transition-colors', active ? 'fill-coral' : 'fill-edge group-hover:fill-muted')}
        />
      ))}
    </svg>
  )
})

const tile = (active: boolean) =>
  cx(
    'block w-full rounded-xl border bg-card p-1 transition-all duration-200 hover:-translate-y-0.5 active:scale-95',
    active ? 'border-coral bg-blush shadow-sm' : 'border-line hover:border-edge hover:shadow-sm',
  )

// Nút nhỏ nằm ở góc ô bố cục (tim / xoá). Màn cảm ứng không có hover nên luôn hiện mờ.
const tileAction =
  'absolute right-0.5 top-0.5 grid size-6 place-items-center rounded-full bg-card shadow-sm transition-all hover:scale-110 active:scale-90 focus-visible:opacity-100'

export function LayoutPanel() {
  const n = useStore((s) => s.selected.length)
  const layoutId = useStore((s) => s.layoutId)
  const tree = useStore((s) => s.tree)
  const favorites = useStore((s) => s.favorites)
  const savedLayouts = useStore((s) => s.savedLayouts)
  const presetId = useStore((s) => s.presetId)
  const customW = useStore((s) => s.customW)
  const customH = useStore((s) => s.customH)
  const { setLayout, toggleFavorite, saveLayout, applySavedLayout, removeSavedLayout } = useStore.getState()
  const size = canvasSize({ presetId, customW, customH })
  const [category, setCategory] = useState<CategoryId>('all')

  const all = useMemo(() => (n ? getLayouts(n) : []), [n])
  const total = useMemo(totalLayoutCount, [])
  const favSet = useMemo(() => new Set(favorites), [favorites])
  const saved = useMemo(() => savedLayouts.filter((l) => l.n === n), [savedLayouts, n])
  // Bố cục đã lưu đang được dùng nếu cây hiện tại giống hệt (kể cả tỉ lệ ô đã kéo).
  const treeSignature = useMemo(() => JSON.stringify(tree), [tree])
  // Khung quá dẹt/quá cao thì thumbnail vẫn giữ trong khoảng dễ nhìn.
  const ratio = Math.min(2, Math.max(0.56, size.width / size.height))

  if (!n)
    return (
      <div className="rounded-2xl bg-sand p-5 text-center">
        <p className="font-display text-base font-bold">Chưa chọn ảnh nào</p>
        <p className="mt-1 text-[13px] leading-relaxed text-soft">
          Chọn từ 1 đến 12 ảnh trong thư viện, Tiệm Ghép Ảnh có sẵn <b>{total}</b> bố cục để bạn thử.
        </p>
      </div>
    )

  const counts: Record<CategoryId, number> = {
    all: all.length,
    fav: all.filter((l) => favSet.has(l.id)).length,
    saved: saved.length,
    grid: all.filter((l) => l.category === 'grid').length,
    hero: all.filter((l) => l.category === 'hero').length,
    mosaic: all.filter((l) => l.category === 'mosaic').length,
  }
  const shown =
    category === 'all'
      ? all
      : category === 'fav'
        ? all.filter((l) => favSet.has(l.id))
        : category === 'saved'
          ? []
          : all.filter((l) => l.category === category)
  const grid = 'grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] items-start gap-2'

  return (
    <Section title={`Bố cục cho ${n} ảnh`} hint={`${all.length} kiểu`}>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const personal = c.id === 'fav' || c.id === 'saved'
          // Mục cá nhân luôn hiện (kể cả khi trống) để người dùng biết có tính năng này.
          if (!counts[c.id] && !personal) return null
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
              className={cx(
                'flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition-colors active:scale-95',
                category === c.id ? 'bg-ink text-paper' : 'bg-sand text-soft hover:text-ink',
              )}
            >
              {c.id === 'fav' && <Heart className="size-3.5" />}
              {c.id === 'saved' && <Bookmark className="size-3.5" />}
              {c.label} <span className="font-normal opacity-60">{counts[c.id]}</span>
            </button>
          )
        })}
      </div>

      <Button
        className="h-9 w-full text-[13px]"
        onClick={() => {
          if (saveLayout()) setCategory('saved')
        }}
      >
        <Bookmark className="size-4" />
        Lưu bố cục đang dùng
      </Button>

      {category === 'saved' ? (
        saved.length ? (
          <div key="saved" className={cx(grid, 'animate-fade')}>
            {saved.map((l, i) => {
              const active = JSON.stringify(l.tree) === treeSignature
              return (
                <div key={l.id} className="group relative">
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={`Bố cục đã lưu ${i + 1}`}
                    onClick={() => applySavedLayout(l.id)}
                    className={tile(active)}
                  >
                    <LayoutThumb id={l.id} tree={l.tree} ratio={ratio} active={active} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Xoá bố cục đã lưu ${i + 1}`}
                    data-tip="Xoá khỏi mục Đã lưu"
                    onClick={() => removeSavedLayout(l.id)}
                    className={cx(tileAction, 'text-soft opacity-0 hover:text-coral-dark group-hover:opacity-100 [@media(hover:none)]:opacity-80')}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="rounded-2xl bg-sand p-4 text-[13px] leading-relaxed text-soft">
            Chưa lưu bố cục nào cho {n} ảnh. Kéo các đường viền để chỉnh tỉ lệ ô theo ý bạn, rồi bấm{' '}
            <b className="text-ink">Lưu bố cục đang dùng</b> để lần sau chọn lại.
          </p>
        )
      ) : shown.length ? (
        <div key={category} className={cx(grid, 'animate-fade')}>
          {shown.map((l, i) => {
            const active = l.id === layoutId
            const fav = favSet.has(l.id)
            return (
              <div key={l.id} className="group relative">
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={`Bố cục ${i + 1}`}
                  onClick={() => setLayout(l.id)}
                  className={tile(active)}
                >
                  <LayoutThumb id={l.id} ratio={ratio} active={active} />
                </button>
                <button
                  type="button"
                  aria-pressed={fav}
                  aria-label={fav ? `Bỏ thích bố cục ${i + 1}` : `Thích bố cục ${i + 1}`}
                  data-tip={fav ? 'Bỏ khỏi Yêu thích' : 'Thêm vào Yêu thích'}
                  onClick={() => toggleFavorite(l.id)}
                  className={cx(
                    tileAction,
                    fav
                      ? 'text-coral'
                      : 'text-soft opacity-0 hover:text-coral group-hover:opacity-100 [@media(hover:none)]:opacity-60',
                  )}
                >
                  <Heart key={String(fav)} className={cx('size-3.5', fav && 'animate-pop fill-current')} />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="rounded-2xl bg-sand p-4 text-[13px] leading-relaxed text-soft">
          Chưa có bố cục yêu thích nào cho {n} ảnh. Bấm biểu tượng <Heart className="inline size-3.5 align-[-2px]" /> ở góc
          một bố cục để thêm vào đây.
        </p>
      )}
    </Section>
  )
}

/* ───────────── Tinh chỉnh ───────────── */

export function StylePanel() {
  const state = useStore()
  const { margin, gap, radius, bg, set } = state
  const { width, height } = canvasSize(state)
  const px = (pct: number) => `${pctToPx(pct, width, height)} px`

  return (
    <div className="space-y-6">
      <Section title="Viền & khoảng cách">
        <div className="space-y-4">
          <Slider label="Viền ngoài" value={margin} min={0} max={10} step={0.1} display={px(margin)} onChange={(v) => set({ margin: v })} />
          <Slider label="Khoảng cách giữa ảnh" value={gap} min={0} max={8} step={0.1} display={px(gap)} onChange={(v) => set({ gap: v })} />
          <Slider label="Bo góc ảnh" value={radius} min={0} max={12} step={0.1} display={px(radius)} onChange={(v) => set({ radius: v })} />
        </div>
      </Section>

      <Section title="Màu nền">
        <div className="flex flex-wrap items-center gap-2">
          {BACKGROUNDS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Màu nền ${color}`}
              aria-pressed={bg === color}
              onClick={() => set({ bg: color })}
              className={cx(
                'size-9 rounded-full border border-black/10 transition-transform hover:scale-110',
                bg === color && 'ring-2 ring-coral ring-offset-2 ring-offset-card',
              )}
              style={{ background: color }}
            />
          ))}
          <label
            className="relative grid size-9 cursor-pointer place-items-center overflow-hidden rounded-full border border-black/10 text-xs font-bold text-white"
            style={{ background: 'conic-gradient(#f2603c, #ffb23e, #8fe0a8, #6aa8ff, #c58bff, #f2603c)' }}
            data-tip="Chọn màu khác"
          >
            <input
              type="color"
              aria-label="Chọn màu nền khác"
              value={bg}
              onChange={(e) => set({ bg: e.target.value })}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      </Section>

      <p className="rounded-2xl bg-sand p-4 text-[13px] leading-relaxed text-soft">
        <b className="text-ink">Mẹo:</b> bấm vào một ảnh trong khung để zoom, xoay, lật hoặc thay ảnh khác. Kéo
        đường viền giữa các ảnh để đổi kích thước ô.
      </p>
    </div>
  )
}

/* ───────────── Chữ ───────────── */

export function TextPanel() {
  const texts = useStore((s) => s.texts)
  const activeText = useStore((s) => s.activeText)
  // Thiết kế đang mở mà đã bỏ hết ảnh vẫn có khung để đặt chữ.
  const hasCollage = useStore((s) => !!s.tree || currentDesign(s) !== null)
  const view = useStore((s) => s.textView)
  const { addText, setPreviewFont } = useStore.getState()
  const item = texts.find((t) => t.id === activeText)

  if (!hasCollage)
    return (
      <div className="rounded-2xl bg-sand p-5 text-center">
        <p className="font-display text-base font-bold">Chưa có ảnh ghép</p>
        <p className="mt-1 text-[13px] leading-relaxed text-soft">Chọn ảnh trước, rồi quay lại đây để chèn chữ lên ảnh.</p>
      </div>
    )

  return (
    <div className="space-y-3">
      <Button variant="primary" onClick={addText} className="h-11 w-full">
        <Type className="size-[18px]" />
        Thêm chữ
      </Button>

      <Segmented
        value={view}
        options={[
          { value: 'templates', label: 'Mẫu chữ' },
          { value: 'font', label: 'Phông chữ' },
        ]}
        onChange={(textView) => useStore.setState({ textView })}
      />

      {view === 'templates' ? (
        <TemplatePicker />
      ) : item ? (
        <FontPicker
          value={item.font}
          text={item.text}
          onChange={(font) => styleTexts(item.id, { font })}
          onPreview={(font) => setPreviewFont(font ? { id: item.id, font } : null)}
        />
      ) : (
        <p className="rounded-2xl bg-sand p-4 text-[13px] leading-relaxed text-soft">
          {texts.length ? (
            <>
              Bấm vào một dòng chữ trên ảnh để chọn và đổi kiểu chữ; bấm lần nữa để sửa nội dung. Kéo các tay nắm để đổi cỡ, bề rộng và xoay.
            </>
          ) : (
            <>
              Bấm <b className="text-ink">Thêm chữ</b> rồi gõ thẳng trên ảnh. Kéo các tay nắm để đổi cỡ, bề rộng và xoay.
            </>
          )}
        </p>
      )}
    </div>
  )
}

/* ───────────── Xuất ảnh ───────────── */

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WebP' },
]

const FORMAT_NOTES: Record<ExportFormat, string> = {
  'image/jpeg':
    'Hợp nhất để đăng mạng xã hội. Màu giữ đủ độ phân giải (4:4:4) và gắn hồ sơ màu sRGB như khi xuất từ Lightroom / Photoshop. Mức 100% giữ trọn chi tiết như bản Lightroom; 90–95% nhẹ hơn nhiều nhưng ảnh nhiều lá, cỏ sẽ mất chi tiết nhỏ.',
  'image/png': 'Không nén mất dữ liệu, nét tuyệt đối nhưng file nặng. Mạng xã hội thường sẽ tự nén lại.',
  'image/webp': 'File nhẹ hơn JPEG ở cùng chất lượng. Một số nền tảng cũ chưa nhận WebP.',
}

const SHARPEN_LEVELS: { value: ExportSharpen; label: string }[] = [
  { value: 'off', label: 'Tắt' },
  { value: 'low', label: 'Thấp' },
  { value: 'standard', label: 'Tiêu chuẩn' },
  { value: 'high', label: 'Cao' },
]

export function ExportPanel() {
  const state = useStore()
  const { exportFormat, exportQuality, exportSharpen, set } = state
  const progress = useExportProgress((s) => s.progress)
  const size = canvasSize(state)

  // Đếm số ảnh sẽ bị phóng to quá độ phân giải gốc ở kích thước khung hiện tại.
  const upscaled = useMemo(() => {
    const spec = buildSpec(state)
    if (!spec) return 0
    return collageLayout(spec).cells.filter((rect, i) => {
      const cell = spec.cells[i]
      if (!cell) return false
      // Còn file gốc trên đĩa thì tính theo độ phân giải gốc, không phải bản xem trước.
      const { photo } = cell
      const [width, height] = photo.missing ? [photo.width, photo.height] : [photo.sourceWidth, photo.sourceHeight]
      return placeImage(width, height, rect.w, rect.h, cell.adjust).scale > 1.08
    }).length
  }, [state])

  const inCollage = state.tree ? state.selected.length : 0
  const missing = new Set(state.photos.filter((p) => p.missing).map((p) => p.id))
  const fromOriginal = state.selected.filter((id) => !missing.has(id)).length
  // Bản web: ảnh còn file gốc nhưng trình duyệt chưa được cấp lại quyền đọc trong phiên này.
  const lockedIds = new Set(state.photos.filter((p) => p.locked).map((p) => p.id))
  const lockedInCollage = state.selected.filter((id) => lockedIds.has(id)).length

  return (
    <div className="space-y-6">
      <Section title="Định dạng" hint={`${size.width} × ${size.height} px`}>
        <Segmented value={exportFormat} options={FORMATS} onChange={(v) => set({ exportFormat: v })} />
        <p className="text-[13px] leading-relaxed text-soft">{FORMAT_NOTES[exportFormat]}</p>
        {exportFormat !== 'image/png' && (
          <Slider
            label="Chất lượng"
            value={Math.round(exportQuality * 100)}
            min={70}
            max={100}
            step={1}
            display={`${Math.round(exportQuality * 100)}%`}
            onChange={(v) => set({ exportQuality: v / 100 })}
          />
        )}
      </Section>

      <Section title="Làm nét đầu ra">
        <Segmented value={exportSharpen} options={SHARPEN_LEVELS} onChange={(v) => set({ exportSharpen: v })} />
        <p className="text-[13px] leading-relaxed text-soft">
          Tắt: ảnh thu nhỏ giống hệt Lightroom khi không bật Output Sharpening. Bật lên để bù lại chi tiết như Output
          Sharpening: Screen của Lightroom (Cao = High). Chỉ áp dụng cho ảnh được thu nhỏ, không đụng tới ảnh bị phóng to
          hay giữ nguyên cỡ.
        </p>
      </Section>

      {inCollage > 0 && (
        <p className="rounded-2xl bg-sand p-4 text-[13px] leading-relaxed text-soft">
          {fromOriginal === inCollage ? (
            <>
              <b className="text-ink">Xuất từ file gốc.</b> Cả {inCollage} ảnh trong khung đều lấy thẳng từ file gốc
              trên máy, không qua bản nén nào.
            </>
          ) : (
            <>
              <b className="text-ink">
                {fromOriginal}/{inCollage} ảnh xuất từ file gốc.
              </b>{' '}
              {lockedInCollage > 0 ? (
                <>
                  Trình duyệt chưa được phép đọc file gốc của {lockedInCollage} ảnh trong lần mở này; khi bấm xuất, app sẽ hỏi
                  bạn cho phép.
                </>
              ) : (
                <>
                  Ảnh còn lại không còn file gốc ở chỗ cũ (đã bị di chuyển, đổi tên hoặc xoá) nên dùng bản xem trước 2560px.
                  Muốn nét tối đa, hãy thêm lại những ảnh đó từ vị trí mới.
                </>
              )}
            </>
          )}
        </p>
      )}

      {upscaled > 0 && (
        <p className="flex gap-2.5 rounded-2xl bg-[#fff4dc] p-4 text-[13px] leading-relaxed text-[#8a5a00] dark:bg-[#3a2c10] dark:text-[#ffcf70]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {upscaled} ảnh đang bị phóng to quá độ phân giải của chính nó nên có thể hơi mềm. Giảm zoom hoặc chọn khung
            nhỏ hơn.
          </span>
        </p>
      )}

      <div className="space-y-2.5">
        <ExportFolder busy={progress !== null} />
        <Button
          variant="primary"
          className="h-12 w-full text-[15px]"
          disabled={!state.tree || progress !== null}
          onClick={() => void exportToFile()}
        >
          {progress !== null ? <LoaderCircle className="size-5 animate-spin" /> : <Download className="size-5" />}
          {progress !== null ? `Đang xuất… ${Math.round(progress * 100)}%` : desktop.exportFile.folder ? 'Xuất ảnh' : 'Xuất ảnh ghép…'}
        </Button>
      </div>
    </div>
  )
}

/**
 * Bản web: ảnh xuất được lưu thẳng vào một thư mục chọn một lần. Trình duyệt không mở được trình quản lý file, nên ở đây
 * luôn ghi rõ thư mục đó và file vừa xuất (bấm để xem lại).
 */
function ExportFolder({ busy }: { busy: boolean }) {
  const folder = desktop.exportFile.folder
  const last = useExportProgress((s) => s.last)
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    if (!busy) void folder?.current().then((f) => setName(f?.name ?? null))
  }, [folder, busy])
  if (!folder) return null
  const change = async () => {
    try {
      const chosen = await folder.choose()
      if (chosen) setName(chosen)
    } catch (err) {
      useStore.getState().toast((err as Error).message, 'error')
    }
  }
  return (
    <div className="rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-[13px]">
      <div className="flex items-center gap-2">
        <Folder className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-soft">
          {name ? (
            <>
              Lưu vào <b className="text-ink">{name}</b>
            </>
          ) : (
            'Lần xuất đầu tiên sẽ hỏi thư mục lưu ảnh'
          )}
        </span>
        <button type="button" disabled={busy} onClick={() => void change()} className="shrink-0 font-semibold text-coral-dark hover:underline">
          {name ? 'Đổi' : 'Chọn thư mục'}
        </button>
      </div>
      {last && last.folder === name && (
        <button
          type="button"
          onClick={() => void desktop.exportFile.view?.(last.target)}
          data-tip="Mở ảnh vừa xuất trong tab mới"
          className="mt-1.5 flex w-full items-center gap-2 text-left text-muted hover:text-ink"
        >
          <Eye className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            Vừa xuất: <span className="font-medium">{last.file}</span>
          </span>
        </button>
      )}
    </div>
  )
}
