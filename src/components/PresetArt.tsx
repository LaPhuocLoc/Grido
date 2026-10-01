import type { Platform, SizePreset } from '../lib/presets'

const TONE: Record<Platform, { from: string; to: string; mark: string }> = {
  instagram: { from: '#fbad50', to: '#d6249f', mark: '#e1306c' },
  facebook: { from: '#6db3ff', to: '#1668e3', mark: '#1877f2' },
  tiktok: { from: '#25f4ee', to: '#fe2c55', mark: '#16161d' },
}

const VIEW_W = 120
const VIEW_H = 84
const LINE = '#d9dce3'
const DEVICE = { fill: '#ffffff', stroke: 'rgba(20,20,40,0.14)', strokeWidth: 0.8 }

/** Vùng ảnh: nền màu của nền tảng kèm hình núi + mặt trời để nhìn ra đây là chỗ ảnh ghép sẽ nằm. */
function Media({ x, y, w, h, rx = 0, fill }: { x: number; y: number; w: number; h: number; rx?: number; fill: string }) {
  const hills = [
    [0, 1],
    [0.3, 0.58],
    [0.5, 0.78],
    [0.72, 0.48],
    [1, 0.8],
    [1, 1],
  ]
    .map(([px, py]) => `${x + px * w},${y + py * h}`)
    .join(' ')
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} />
      <circle cx={x + w * 0.3} cy={y + h * 0.28} r={Math.min(w, h) * 0.09} fill="#fff" opacity={0.6} />
      <polygon points={hills} fill="#fff" opacity={0.32} />
    </>
  )
}

/** Hình minh hoạ: khung ảnh này trông thế nào khi đăng lên nền tảng (bảng tin, tin, ảnh hồ sơ, ảnh bìa). */
export function PresetArt({ preset }: { preset: SizePreset }) {
  const { platform, kind } = preset
  const tone = TONE[platform]
  const ratio = preset.width / preset.height
  const gradient = `preset-art-${platform}`
  const fill = `url(#${gradient})`
  let art

  if (kind === 'profile') {
    art = (
      <>
        <clipPath id="preset-art-avatar">
          <circle cx={60} cy={41} r={27} />
        </clipPath>
        <g clipPath="url(#preset-art-avatar)">
          <rect x={33} y={14} width={54} height={54} fill={fill} />
          <circle cx={60} cy={35} r={9} fill="#fff" opacity={0.6} />
          <ellipse cx={60} cy={66} rx={18} ry={15} fill="#fff" opacity={0.6} />
        </g>
        <circle cx={81} cy={61} r={7.5} {...DEVICE} />
        <circle cx={81} cy={61} r={4.6} fill={tone.mark} />
      </>
    )
  } else if (kind === 'cover') {
    const x = 14
    const y = 10
    const w = 92
    const h = 64
    const bandH = Math.min(w / ratio, 46)
    const bandW = bandH * ratio
    const profile = ratio > 2.2
    const lineX = profile ? x + 26 : x + 7
    art = (
      <>
        <clipPath id="preset-art-page">
          <rect x={x} y={y} width={w} height={h} rx={5} />
        </clipPath>
        <rect x={x} y={y} width={w} height={h} rx={5} {...DEVICE} />
        <g clipPath="url(#preset-art-page)">
          <Media x={x + (w - bandW) / 2} y={y} w={bandW} h={bandH} fill={fill} />
        </g>
        {profile && <circle cx={x + 14} cy={y + bandH + 2} r={8} fill={LINE} stroke="#fff" strokeWidth={2} />}
        <rect x={lineX} y={y + bandH + 5} width={30} height={3} rx={1.5} fill={LINE} />
        <rect x={lineX} y={y + bandH + 11} width={20} height={3} rx={1.5} fill={LINE} />
        <rect x={x + w - 25} y={y + bandH + 6} width={18} height={6} rx={3} fill={tone.mark} opacity={0.85} />
      </>
    )
  } else if (kind === 'full' || kind === 'reel') {
    const h = 72
    const w = h * ratio
    const x = (VIEW_W - w) / 2
    const y = 6
    art = (
      <>
        <Media x={x} y={y} w={w} h={h} rx={6} fill={fill} />
        <rect x={x} y={y} width={w} height={h} rx={6} fill="none" stroke="#fff" strokeWidth={1.6} />
        {kind === 'full' && platform !== 'tiktok' && <rect x={x + 4} y={y + 4} width={w - 8} height={1.4} rx={0.7} fill="#fff" opacity={0.85} />}
        <circle cx={x + 7} cy={y + 10.5} r={2.6} fill="none" stroke="#fff" strokeWidth={1.2} />
        <rect x={x + 12} y={y + 9.3} width={12} height={2.4} rx={1.2} fill="#fff" opacity={0.85} />
        <rect x={x + 5} y={y + h - 13} width={w - 18} height={2.6} rx={1.3} fill="#fff" opacity={0.9} />
        <rect x={x + 5} y={y + h - 8} width={w - 24} height={2.6} rx={1.3} fill="#fff" opacity={0.6} />
        {(kind === 'reel' || platform === 'tiktok') &&
          [0, 1, 2].map((i) => <circle key={i} cx={x + w - 6} cy={y + h - 28 + i * 7.5} r={2.2} fill="#fff" opacity={0.9} />)}
        {kind === 'reel' && (
          <>
            <circle cx={60} cy={y + h / 2} r={7} fill="#fff" opacity={0.92} />
            <polygon points={`58,${y + h / 2 - 3.6} 58,${y + h / 2 + 3.6} 64,${y + h / 2}`} fill={tone.mark} />
          </>
        )}
      </>
    )
  } else {
    // Bài đăng trên bảng tin: đầu bài, ảnh rộng hết màn hình, rồi tới chú thích.
    const w = 44
    const h = 76
    const x = (VIEW_W - w) / 2
    const y = 4
    const mediaH = Math.min(w / ratio, 54)
    const mediaW = mediaH * ratio
    const mediaY = y + 12
    let lineY = mediaY + mediaH + 4
    const dots = kind === 'carousel'
    if (dots) lineY += 5
    const lines = [26, 18, 22, 14].flatMap((width, i) => {
      const top = lineY + i * 5
      return top + 2.6 <= y + h - 3 ? [<rect key={i} x={x + 5} y={top} width={width} height={2.6} rx={1.3} fill={LINE} />] : []
    })
    art = (
      <>
        <rect x={x} y={y} width={w} height={h} rx={6} {...DEVICE} />
        <circle cx={x + 7} cy={y + 6.2} r={2.6} fill={tone.mark} />
        <rect x={x + 12} y={y + 4.9} width={15} height={2.6} rx={1.3} fill={LINE} />
        <Media x={x + (w - mediaW) / 2} y={mediaY} w={mediaW} h={mediaH} fill={fill} />
        {dots &&
          [-1, 0, 1].map((i) => (
            <circle key={i} cx={60 + i * 4} cy={mediaY + mediaH + 3.6} r={1.2} fill={i === -1 ? tone.mark : LINE} />
          ))}
        {lines}
      </>
    )
  }

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block w-full" aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={tone.from} />
          <stop offset="1" stopColor={tone.to} />
        </linearGradient>
      </defs>
      {art}
    </svg>
  )
}
