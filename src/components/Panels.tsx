import {
  ArrowLeftRight,
  Bookmark,
  ChevronRight,
  CircleCheck,
  Download,
  Flame,
  Folder,
  Heart,
  Image as ImageIcon,
  Images,
  LoaderCircle,
  RectangleHorizontal,
  RectangleVertical,
  Sparkles,
  Square,
  TriangleAlert,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react'
import { memo, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { desktop } from '../lib/desktop'
import { placeImage } from '../lib/geometry'
import { collageLayout } from '../lib/imaging/exportCollage'
import { computeLayout } from '../lib/layout/compute'
import { countCells, parseLayout } from '../lib/layout/dsl'
import { getLayouts, layoutLook, MAX_PHOTOS, suggestLayouts } from '../lib/layout/registry'
import type { LayoutDef, LayoutNode } from '../lib/layout/types'
import {
  BACKGROUNDS,
  CUSTOM_PRESET_ID,
  MAX_CANVAS,
  MIN_CANVAS,
  ORIGINAL_PRESET_ID,
  orientationOf,
  PLATFORMS,
  POPULAR_PRESETS,
  SIZE_PRESETS,
  type Orientation,
  type Platform,
} from '../lib/presets'
import { buildSpec, canExportMany, exportToFile, useExportProgress } from '../lib/useCollage'
import { canvasSize, originalCanvasOf, pctToPx, currentDesign, photosIn, slotAspects, useStore, type ExportFormat, type ExportSharpen } from '../store'
import { openBatchExport, useExportableCount } from './BatchExport'
import { BrandIcon } from './BrandIcon'
import { FontPicker } from './FontPicker'
import { PresetArt } from './PresetArt'
import { styleTexts } from './TextLayer'
import { TemplatePicker } from './TemplatePicker'
import { Button, cx, Section, Segmented, Slider } from './ui'

/* ───────────── Khung ảnh ───────────── */

type PresetGroup = 'popular' | Platform | 'fav'

const PRESET_GROUPS: { id: PresetGroup; label: string }[] = [{ id: 'popular', label: 'Phổ biến' }, ...PLATFORMS, { id: 'fav', label: 'Yêu thích' }]
const POPULAR_IDS = new Set(POPULAR_PRESETS.map((p) => p.id))

export function SizePanel() {
  const presetId = useStore((s) => s.presetId)
  const customW = useStore((s) => s.customW)
  const customH = useStore((s) => s.customH)
  const favoritePresets = useStore((s) => s.favoritePresets)
  const firstPhoto = useStore((s) => s.photos.find((p) => p.id === photosIn(s.selected)[0]))
  const { set, toggleFavoritePreset, applyOriginalSize } = useStore.getState()
  // Mở tab có khung đang dùng: "Phổ biến" nếu khung nằm trong đó, không thì đúng nền tảng của khung.
  const [group, setGroup] = useState<PresetGroup>(() =>
    POPULAR_IDS.has(presetId) ? 'popular' : (SIZE_PRESETS.find((p) => p.id === presetId)?.platform ?? 'popular'),
  )
  const isCustom = presetId === CUSTOM_PRESET_ID
  const isOriginal = presetId === ORIGINAL_PRESET_ID
  const current = canvasSize({ presetId, customW, customH })
  const original = isOriginal ? current : firstPhoto && originalCanvasOf(firstPhoto)
  const favSet = useMemo(() => new Set(favoritePresets), [favoritePresets])
  const shown =
    group === 'popular'
      ? POPULAR_PRESETS.flatMap(({ id, label }) => SIZE_PRESETS.filter((p) => p.id === id).map((p) => ({ ...p, label })))
      : SIZE_PRESETS.filter((p) => (group === 'fav' ? favSet.has(p.id) : p.platform === group))

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
        {/* Tab đang mở hiện cả tên; các tab khác chỉ còn icon (rê chuột để xem tên) để cả hàng vừa một dòng. */}
        <div className="flex gap-1.5">
          {PRESET_GROUPS.map((g) => {
            const on = group === g.id
            const name = g.id === 'fav' ? `Yêu thích (${favoritePresets.length})` : g.label
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={on}
                aria-label={name}
                data-tip={on ? undefined : name}
                onClick={() => setGroup(g.id)}
                className={cx(
                  'flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-xs font-semibold transition-colors active:scale-95',
                  on ? 'flex-[3_1_auto] bg-ink px-3 text-paper' : 'flex-[1_1_auto] bg-sand px-2.5 text-soft hover:text-ink',
                )}
              >
                {g.id === 'popular' ? (
                  <Flame className="size-3.5 shrink-0" />
                ) : g.id === 'fav' ? (
                  <Heart className="size-3.5 shrink-0" />
                ) : (
                  <BrandIcon platform={g.id} className="size-3.5 shrink-0" />
                )}
                {on && <span>{g.id === 'fav' ? 'Yêu thích' : g.label}</span>}
                {g.id === 'fav' && favoritePresets.length > 0 && <span className="font-normal opacity-70">{favoritePresets.length}</span>}
              </button>
            )
          })}
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

type CategoryId = 'all' | 'fav' | 'saved'

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'all', label: 'Gợi ý' },
  { id: 'fav', label: 'Yêu thích' },
  { id: 'saved', label: 'Đã lưu' },
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

/**
 * Bố cục chỉ chia ô, còn dọc hay ngang là do khung. Mở một ảnh ngang thì khung ngang theo ảnh, nên mọi bố cục trong danh
 * sách đều hiện ngang: công tắc này nằm ngay trên danh sách để đổi chiều khung mà không phải sang mục Khung.
 */
const ORIENTATIONS: { id: Orientation; label: string; icon: LucideIcon }[] = [
  { id: 'portrait', label: 'Dọc', icon: RectangleVertical },
  { id: 'square', label: 'Vuông', icon: Square },
  { id: 'landscape', label: 'Ngang', icon: RectangleHorizontal },
]

/** Mở mục Bố cục khi khung còn trống thì đứng sẵn ở số ảnh này. */
const DEFAULT_LAYOUT_COUNT = 3

/** Bố cục đã thả tim cho n ảnh. Id chính là chuỗi DSL nên bố cục cũ không còn trong danh sách vẫn dựng lại được. */
function lovedLayouts(favorites: string[], n: number): LayoutDef[] {
  return favorites.flatMap((id) => {
    try {
      return countCells(parseLayout(id)) === n ? [{ id, n }] : []
    } catch {
      return []
    }
  })
}

export function LayoutPanel() {
  // Số ô của bố cục đang nằm trên khung (0 = khung trống).
  const cells = useStore((s) => s.selected.length)
  // Số ảnh đang xem bố cục: mặc định theo khung, nhưng chọn được số khác để lấy bố cục trước rồi đưa ảnh vào sau.
  const [n, setCount] = useState(cells || DEFAULT_LAYOUT_COUNT)
  useEffect(() => {
    if (cells) setCount(cells)
  }, [cells])
  const tree = useStore((s) => s.tree)
  const selected = useStore((s) => s.selected)
  const photos = useStore((s) => s.photos)
  const favorites = useStore((s) => s.favorites)
  const savedLayouts = useStore((s) => s.savedLayouts)
  const presetId = useStore((s) => s.presetId)
  const customW = useStore((s) => s.customW)
  const customH = useStore((s) => s.customH)
  const { setLayout, toggleFavorite, saveLayout, applySavedLayout, removeSavedLayout, setOrientation } = useStore.getState()
  const size = canvasSize({ presetId, customW, customH })
  const frame = size.width / size.height
  const orientation = orientationOf(size)
  const [category, setCategory] = useState<CategoryId>('all')

  // Ảnh nào sẽ nằm ở ô nào nếu chọn một bố cục n ô (như lúc đổi bố cục thật): nhiều ô hơn thì thêm ô trống, ít ô hơn thì
  // dồn ảnh lên trước.
  const aspects = useMemo(() => {
    const now = slotAspects(photos, selected)
    const kept = n < now.length ? now.filter((a) => a !== null).slice(0, n) : now
    return [...kept, ...Array<null>(n - kept.length).fill(null)]
  }, [photos, selected, n])
  // Hai nhóm: bố cục ôm sát những ảnh đang chọn, rồi các bố cục đẹp của khung này (xem lib/layout/curate.ts).
  const fitting = useMemo(() => suggestLayouts(aspects, frame), [aspects, frame])
  const favSet = useMemo(() => new Set(favorites), [favorites])
  const loved = useMemo(() => lovedLayouts(favorites, n), [favorites, n])
  const looks = useMemo(() => {
    const map = new Map<string, string>()
    for (const l of [...fitting, ...getLayouts(n, frame), ...loved]) if (!map.has(l.id)) map.set(l.id, layoutLook(parseLayout(l.id), frame))
    return map
  }, [fitting, loved, n, frame])
  const others = useMemo(() => {
    const taken = new Set(fitting.map((l) => looks.get(l.id)))
    return getLayouts(n, frame).filter((l) => !taken.has(looks.get(l.id)))
  }, [fitting, looks, n, frame])
  // Ô nào trong danh sách đang nằm trên khung: so bằng dáng nhìn, nên kéo lệch đường viền một chút ô đó vẫn sáng.
  const look = useMemo(() => (tree && n === cells ? layoutLook(tree, frame) : null), [tree, n, cells, frame])
  const saved = useMemo(() => savedLayouts.filter((l) => l.n === n), [savedLayouts, n])
  // Bố cục đã lưu đang được dùng nếu cây hiện tại giống hệt (kể cả tỉ lệ ô đã kéo).
  const treeSignature = useMemo(() => JSON.stringify(tree), [tree])
  // Khung quá dẹt/quá cao thì thumbnail vẫn giữ trong khoảng dễ nhìn.
  const ratio = Math.min(2, Math.max(0.56, frame))

  const counts: Record<CategoryId, number> = { all: fitting.length + others.length, fav: loved.length, saved: saved.length }
  const grid = 'grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] items-start gap-2'
  const caption = 'flex items-center gap-1.5 text-xs font-semibold text-soft'

  /** Một nhóm ô bố cục; `from` là số thứ tự của ô đầu nhóm trong cả danh sách. */
  const tiles = (list: LayoutDef[], from: number) => (
    <div className={grid}>
      {list.map((l, i) => {
        const active = look !== null && looks.get(l.id) === look
        const fav = favSet.has(l.id)
        const number = from + i + 1
        return (
          <div key={l.id} className="group relative">
            <button type="button" aria-pressed={active} aria-label={`Bố cục ${number}`} onClick={() => setLayout(l.id)} className={tile(active)}>
              <LayoutThumb id={l.id} ratio={ratio} active={active} />
            </button>
            <button
              type="button"
              aria-pressed={fav}
              aria-label={fav ? `Bỏ thích bố cục ${number}` : `Thích bố cục ${number}`}
              data-tip={fav ? 'Bỏ khỏi Yêu thích' : 'Thêm vào Yêu thích'}
              onClick={() => toggleFavorite(l.id)}
              className={cx(
                tileAction,
                fav ? 'text-coral' : 'text-soft opacity-0 hover:text-coral group-hover:opacity-100 [@media(hover:none)]:opacity-60',
              )}
            >
              <Heart key={String(fav)} className={cx('size-3.5', fav && 'animate-pop fill-current')} />
            </button>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-5">
      <Section
        title="Chiều khung"
        hint={
          <button
            type="button"
            data-tip="Chọn đúng cỡ cho Instagram, Facebook, TikTok hoặc tự nhập"
            onClick={() => useStore.setState({ tab: 'size' })}
            className="flex items-center font-semibold text-soft hover:text-ink"
          >
            Cỡ khác
            <ChevronRight className="size-3.5" />
          </button>
        }
      >
        <div role="radiogroup" aria-label="Chiều khung" className="flex gap-1 rounded-full bg-sand p-1">
          {ORIENTATIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === orientation}
              onClick={() => setOrientation(id)}
              className={cx(
                'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-all duration-200 active:scale-95',
                id === orientation ? 'bg-surface text-ink shadow-sm' : 'text-soft hover:text-ink',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Số ảnh">
        <div role="radiogroup" aria-label="Số ảnh của bố cục" className="grid grid-cols-10 gap-1">
          {Array.from({ length: MAX_PHOTOS }, (_, i) => i + 1).map((count) => (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={count === n}
              aria-label={`${count} ảnh`}
              onClick={() => setCount(count)}
              className={cx(
                'relative grid aspect-square place-items-center rounded-full text-[13px] font-semibold tabular-nums transition-colors active:scale-90',
                count === n ? 'bg-ink text-paper' : 'bg-sand text-soft hover:text-ink',
              )}
            >
              {count}
              {/* Chấm nhỏ: bố cục trên khung đang có bấy nhiêu ô. */}
              {count === cells && count !== n && <span className="absolute -bottom-0.5 size-1 rounded-full bg-coral" />}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
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
          ))}
        </div>

        {tree && n === cells && (
          <Button
            className="h-9 w-full text-[13px]"
            onClick={() => {
              if (saveLayout()) setCategory('saved')
            }}
          >
            <Bookmark className="size-4" />
            Lưu bố cục đang dùng
          </Button>
        )}

        {category === 'saved' ? (
          saved.length ? (
            <div key="saved" className={cx(grid, 'animate-fade')}>
              {saved.map((l, i) => {
                const active = n === cells && JSON.stringify(l.tree) === treeSignature
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
        ) : category === 'fav' ? (
          loved.length ? (
            <div key="fav" className="animate-fade">
              {tiles(loved, 0)}
            </div>
          ) : (
            <p className="rounded-2xl bg-sand p-4 text-[13px] leading-relaxed text-soft">
              Chưa có bố cục yêu thích nào cho {n} ảnh. Bấm biểu tượng <Heart className="inline size-3.5 align-[-2px]" /> ở góc một bố cục
              để thêm vào đây.
            </p>
          )
        ) : (
          <div key={`${n}`} className="animate-fade space-y-3">
            {fitting.length > 0 && (
              <>
                <p className={caption} data-tip="Ô nào cũng gần đúng tỉ lệ của ảnh nằm trong đó, nên ảnh ít bị cắt nhất">
                  <Sparkles className="size-3.5 text-coral-dark" />
                  Hợp với ảnh đang chọn
                </p>
                {tiles(fitting, 0)}
                <p className={caption}>Bố cục khác</p>
              </>
            )}
            {tiles(others, fitting.length)}
          </div>
        )}
      </Section>
    </div>
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
]

/** Một dòng ngắn dưới bảng cài đặt: định dạng này hợp cho việc gì. */
const FORMAT_NOTES: Record<ExportFormat, string> = {
  'image/jpeg': 'Đăng mạng xã hội · sRGB, giữ EXIF như Lightroom',
  'image/png': 'Không nén mất dữ liệu · file nặng',
}

const SHARPEN_LEVELS: { value: ExportSharpen; label: string }[] = [
  { value: 'off', label: 'Tắt' },
  { value: 'low', label: 'Thấp' },
  { value: 'standard', label: 'Vừa' },
  { value: 'high', label: 'Cao' },
]

/** Một dòng của bảng cài đặt xuất: nhãn (rê chuột vào để xem giải thích) bên trái, điều khiển bên phải. */
function ExportRow({ label, tip, children }: { label: string; tip: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-2 px-3.5 py-2">
      {/* Gạch chân chấm: dấu hiệu quen thuộc của "rê chuột vào để xem giải thích", không tốn chỗ như icon. */}
      <span
        data-tip={tip}
        className="w-[76px] shrink-0 cursor-help whitespace-nowrap text-[13px] font-semibold text-ink underline decoration-edge decoration-dotted decoration-[1.5px] underline-offset-4"
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">{children}</div>
    </div>
  )
}

/** Cảnh báo ngắn một dòng; phần giải thích nằm trong chú thích khi rê chuột. */
function ExportWarning({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <li
      data-tip={tip}
      className="flex cursor-help items-center gap-2 rounded-xl bg-[#fff4dc] px-3 py-2 text-[12.5px] font-medium text-[#8a5a00] dark:bg-[#3a2c10] dark:text-[#ffcf70]"
    >
      <TriangleAlert className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  )
}

/** `onLeave`: gọi khi người dùng rời bảng này sang hộp thoại khác (bảng đang nằm trong một popup thì đóng popup lại). */
export function ExportPanel({ onLeave }: { onLeave?: () => void } = {}) {
  const state = useStore()
  const { exportFormat, exportQuality, exportSharpen, set } = state
  const progress = useExportProgress((s) => s.progress)
  const batch = useExportProgress((s) => s.batch)
  const exportable = useExportableCount()
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

  // Ảnh mất file gốc (bị dời / xoá) phải xuất từ bản xem trước. Ảnh chỉ đang chờ trình duyệt cho phép đọc thì không
  // tính: lúc bấm xuất app sẽ hỏi.
  const missingIds = new Set(state.photos.filter((p) => p.missing && !p.locked).map((p) => p.id))
  const missing = state.tree ? photosIn(state.selected).filter((id) => missingIds.has(id)).length : 0
  const emptyCells = state.tree ? state.selected.length - photosIn(state.selected).length : 0
  const quality = Math.round(exportQuality * 100)

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[15px] font-bold text-ink">Ảnh xuất</h3>
        <span className="text-xs tabular-nums text-muted">
          {size.width} × {size.height} px
        </span>
      </div>

      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        <ExportRow label="Định dạng" tip="JPEG để đăng mạng xã hội, PNG khi cần nét tuyệt đối.">
          <Segmented small value={exportFormat} options={FORMATS} onChange={(v) => set({ exportFormat: v })} />
        </ExportRow>
        {exportFormat !== 'image/png' && (
          <ExportRow
            label="Chất lượng"
            tip="100% giữ trọn chi tiết như bản Lightroom. 90–95% nhẹ hơn nhiều nhưng ảnh nhiều lá, cỏ sẽ mất chi tiết nhỏ."
          >
            <input
              type="range"
              aria-label="Chất lượng"
              min={70}
              max={100}
              step={1}
              value={quality}
              style={{ '--fill': `${((quality - 70) / 30) * 100}%` } as CSSProperties}
              onChange={(e) => set({ exportQuality: Number(e.target.value) / 100 })}
              className="min-w-0 flex-1"
            />
            <span className="w-9 shrink-0 text-right text-[13px] font-semibold tabular-nums text-ink">{quality}%</span>
          </ExportRow>
        )}
        <ExportRow
          label="Làm nét"
          tip="Bù chi tiết mất đi khi thu nhỏ ảnh, như Output Sharpening: Screen của Lightroom (Cao = High). Tắt = giống Lightroom khi không bật làm nét. Không đụng tới ảnh bị phóng to hay giữ nguyên cỡ."
        >
          <Segmented small value={exportSharpen} options={SHARPEN_LEVELS} onChange={(v) => set({ exportSharpen: v })} />
        </ExportRow>
      </div>
      <p className="-mt-1.5 px-1 text-xs leading-relaxed text-muted">{FORMAT_NOTES[exportFormat]}</p>

      {(upscaled > 0 || missing > 0 || emptyCells > 0) && (
        <ul className="space-y-1.5">
          {emptyCells > 0 && (
            <ExportWarning tip="Ô chưa có ảnh sẽ chỉ có màu nền của khung. Bấm vào ô trống rồi chọn ảnh trong thư viện, hoặc chọn bố cục ít ô hơn.">
              Còn {emptyCells} ô trống
            </ExportWarning>
          )}
          {upscaled > 0 && (
            <ExportWarning tip="Ảnh bị phóng to quá độ phân giải của chính nó nên có thể hơi mềm. Giảm zoom ảnh trong ô hoặc chọn khung nhỏ hơn.">
              {upscaled} ảnh bị phóng to quá cỡ gốc
            </ExportWarning>
          )}
          {missing > 0 && (
            <ExportWarning tip="File gốc đã bị di chuyển, đổi tên hoặc xoá nên app dùng bản xem trước 2560px. Thêm lại ảnh từ vị trí mới để xuất nét tối đa.">
              {missing} ảnh mất file gốc, sẽ xuất từ bản xem trước
            </ExportWarning>
          )}
        </ul>
      )}

      <div className="space-y-2 pt-1">
        <Button
          variant="primary"
          className="h-12 w-full text-[15px]"
          disabled={!state.tree || emptyCells === state.selected.length || progress !== null}
          onClick={() => void exportToFile()}
        >
          {progress !== null ? <LoaderCircle className="size-5 animate-spin" /> : <Download className="size-5" />}
          {progress !== null
            ? batch
              ? `Đang xuất ${Math.min(batch.done + 1, batch.total)}/${batch.total}… ${Math.round(progress * 100)}%`
              : `Đang xuất… ${Math.round(progress * 100)}%`
            : desktop.exportFile.folder
              ? 'Xuất ảnh'
              : 'Xuất ảnh ghép…'}
        </Button>
        {canExportMany() && exportable > 1 && (
          <Button className="h-10 w-full text-[13px]" disabled={progress !== null}
            onClick={() => {
              onLeave?.()
              openBatchExport()
            }}
          >
            <Images className="size-4" />
            Xuất nhiều thiết kế…
          </Button>
        )}
        <ExportFolder busy={progress !== null} />
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
    <div className="space-y-1 text-center text-xs text-muted">
      <p className="flex items-center justify-center gap-1.5">
        <Folder className="size-3.5 shrink-0" />
        {name ? (
          <span className="min-w-0 truncate">
            Lưu vào <b className="font-semibold text-soft">{name}</b>
          </span>
        ) : (
          <span>Lần xuất đầu sẽ hỏi chỗ lưu</span>
        )}
        <span aria-hidden>·</span>
        <button type="button" disabled={busy} onClick={() => void change()} className="shrink-0 font-semibold text-coral-dark hover:underline">
          {name ? 'Đổi' : 'Chọn thư mục'}
        </button>
      </p>
      {last && last.folder === name && (
        <p className="flex items-center justify-center gap-1.5">
          <CircleCheck className="size-3.5 shrink-0 text-[#2f9e5b] dark:text-[#5fd08a]" />
          <span className="min-w-0 truncate">
            Vừa xuất <span className="font-medium text-soft">{last.file}</span>
          </span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => void desktop.exportFile.view?.(last.target)}
            data-tip="Mở ảnh vừa xuất trong tab mới"
            className="shrink-0 font-semibold text-coral-dark hover:underline"
          >
            Xem
          </button>
        </p>
      )}
    </div>
  )
}
