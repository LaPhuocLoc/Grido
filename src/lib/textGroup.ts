import { MAX_TEXT_SIZE, MIN_TEXT_SIZE, type TextItem } from './text'

/** Thay đổi của từng dòng chữ trong nhóm, theo id. */
export type TextPatches = Record<string, Partial<TextItem>>

const round = (v: number, digits: number) => Number(v.toFixed(digits))

/** Dời cả nhóm một đoạn (dx, dy) tính theo tỉ lệ khung. */
export function moveGroup(items: TextItem[], dx: number, dy: number): TextPatches {
  return Object.fromEntries(items.map((t) => [t.id, { x: round(t.x + dx, 4), y: round(t.y + dy, 4) }]))
}

/** Hệ số phóng lớn nhất / nhỏ nhất mà mọi dòng trong nhóm còn nằm trong giới hạn cỡ chữ. */
export function clampGroupScale(items: TextItem[], factor: number): number {
  const max = Math.min(...items.map((t) => MAX_TEXT_SIZE / t.size))
  const min = Math.max(...items.map((t) => MIN_TEXT_SIZE / t.size))
  return Math.min(max, Math.max(min, factor))
}

/** Phóng to / thu nhỏ cả nhóm quanh tâm (cx, cy) tính bằng px trên khung `width` × `height`. */
export function scaleGroup(items: TextItem[], cx: number, cy: number, factor: number, width: number, height: number): TextPatches {
  const f = clampGroupScale(items, factor)
  return Object.fromEntries(
    items.map((t) => [
      t.id,
      {
        x: round((cx + (t.x * width - cx) * f) / width, 4),
        y: round((cy + (t.y * height - cy) * f) / height, 4),
        size: round(t.size * f, 2),
        width: t.width === null ? null : round(t.width * f, 4),
      },
    ]),
  )
}

/** Góc (độ) đưa về khoảng -180..180. */
const wrapAngle = (deg: number) => {
  const wrapped = ((((deg + 180) % 360) + 360) % 360) - 180
  return wrapped === -180 ? 180 : wrapped
}

/** Xoay cả nhóm `deg` độ (chiều kim đồng hồ) quanh tâm (cx, cy) tính bằng px trên khung `width` × `height`. */
export function rotateGroup(items: TextItem[], cx: number, cy: number, deg: number, width: number, height: number): TextPatches {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return Object.fromEntries(
    items.map((t) => {
      const dx = t.x * width - cx
      const dy = t.y * height - cy
      return [
        t.id,
        {
          x: round((cx + dx * cos - dy * sin) / width, 4),
          y: round((cy + dx * sin + dy * cos) / height, 4),
          rotation: wrapAngle(Math.round(t.rotation + deg)),
        },
      ]
    }),
  )
}
