/**
 * Kéo ảnh từ thư viện thả vào khung: tìm ô nằm dưới con trỏ. Khung làm việc đánh dấu vùng của nó bằng `data-stage`, khung
 * ảnh ghép bằng `data-frame`, từng ô bằng `data-cell`. Dò theo vị trí thay vì theo phần tử trên cùng, vì chữ và tay nắm
 * nằm đè lên ô.
 */
export type StageDrop = number | 'stage' | null

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

const inside = (r: Box, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
const distance = (r: Box, x: number, y: number) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom))

/**
 * Ô nhận ảnh khi thả ở (x, y) trong khung `frame`: ô chứa điểm đó; rơi vào khe giữa các ô hay viền ngoài thì lấy ô gần
 * nhất; ngoài khung thì không ô nào.
 */
export function cellAt(frame: Box, cells: Box[], x: number, y: number): number | null {
  if (!inside(frame, x, y)) return null
  let best: number | null = null
  let bestDistance = Infinity
  cells.forEach((cell, i) => {
    const d = distance(cell, x, y)
    if (d < bestDistance) {
      best = i
      bestDistance = d
    }
  })
  return best
}

/** Chỗ nhận ảnh dưới con trỏ: số thứ tự ô, 'stage' khi khung còn trống (thả là mở ảnh), null khi ở ngoài. */
export function stageDropAt(x: number, y: number): StageDrop {
  const root = document.elementsFromPoint(x, y).find((el): el is HTMLElement => el instanceof HTMLElement && 'stage' in el.dataset)
  if (!root) return null
  const cells = [...root.querySelectorAll<HTMLElement>('[data-cell]')]
  const frame = root.querySelector<HTMLElement>('[data-frame]')
  if (!cells.length || !frame) return 'stage'
  const hit = cellAt(
    frame.getBoundingClientRect(),
    cells.map((el) => el.getBoundingClientRect()),
    x,
    y,
  )
  return hit === null ? null : Number(cells[hit].dataset.cell)
}
