import { describe, expect, it } from 'vitest'
import { cellAt } from '../src/lib/stageDrop'

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom })

describe('dropping a library photo on the frame', () => {
  // Khung 200×100 có viền 10, hai ô cạnh nhau cách một khe 10.
  const frame = box(0, 0, 200, 100)
  const cells = [box(10, 10, 95, 90), box(105, 10, 190, 90)]

  it('lands in the cell under the pointer', () => {
    expect(cellAt(frame, cells, 50, 50)).toBe(0)
    expect(cellAt(frame, cells, 150, 50)).toBe(1)
  })

  it('takes the nearest cell when dropped on a gap or the outer border', () => {
    expect(cellAt(frame, cells, 98, 50)).toBe(0)
    expect(cellAt(frame, cells, 103, 50)).toBe(1)
    expect(cellAt(frame, cells, 197, 3)).toBe(1)
  })

  it('lands nowhere outside the frame, or in a frame without cells', () => {
    expect(cellAt(frame, cells, 250, 50)).toBeNull()
    expect(cellAt(frame, cells, 50, -5)).toBeNull()
    expect(cellAt(frame, [], 50, 50)).toBeNull()
  })
})
