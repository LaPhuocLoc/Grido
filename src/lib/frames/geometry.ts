import type { Rect } from '../layout/types'
import { MAX_CANVAS } from '../presets'
import type { FramePad, FrameTemplate } from './templates'

/** Kích thước file xuất và chỗ của ảnh trong đó (px). */
export interface Placement {
  width: number
  height: number
  photo: Rect
}

export interface FrameGeometry extends Placement {
  /** Lề ngoài (px): từ mép file tới tấm nền, hoặc tới vùng đặt ảnh khi mẫu không có tấm nền. */
  pad: FramePad
  /** Tấm nền ôm quanh ảnh (mẫu có `card`). */
  card: Rect | null
  /** Chỗ đặt chữ: mép trái / phải, và khoảng dọc [từ, đến] của dải trên và dải dưới. */
  text: { left: number; right: number; top: [number, number]; bottom: [number, number] }
  /** Số px ứng với 1% trong số đo của mẫu, đã tính độ dày người dùng chọn. */
  unit: number
}

const NO_PAD: FramePad = { top: 0, side: 0, bottom: 0 }

/**
 * Dàn một khung thông số quanh ảnh.
 * Cỡ theo ảnh gốc (`fixed` = false): `base` là cỡ ảnh, file xuất nở thêm phần lề nên ảnh giữ nguyên từng pixel.
 * Cỡ cố định (`fixed`): `base` là cỡ file xuất; ảnh tỉ lệ `aspect` (rộng / cao) nằm vừa khít trong phần còn lại, không bị
 * cắt, hoặc (`fill`) vùng ảnh chiếm trọn phần còn lại để ảnh lấp đầy, người dùng tự chọn phần bị cắt.
 */
export function frameGeometry(
  template: Pick<FrameTemplate, 'pad'> & { card?: { pad: FramePad } },
  scale: number,
  base: { width: number; height: number },
  fixed: boolean,
  aspect: number,
  fill = false,
): FrameGeometry {
  let unit = (Math.min(base.width, base.height) / 100) * scale
  const px = (p: FramePad): FramePad => ({ top: Math.round(p.top * unit), side: Math.round(p.side * unit), bottom: Math.round(p.bottom * unit) })
  let pad = px(template.pad)
  let inner = px(template.card?.pad ?? NO_PAD)
  let { width, height } = base
  let photo: Rect
  if (fixed) {
    const area = {
      x: pad.side + inner.side,
      y: pad.top + inner.top,
      w: Math.max(1, width - 2 * (pad.side + inner.side)),
      h: Math.max(1, height - pad.top - inner.top - pad.bottom - inner.bottom),
    }
    const wide = area.w / area.h < aspect
    const w = fill || wide ? area.w : Math.max(1, Math.round(area.h * aspect))
    const h = fill || !wide ? area.h : Math.max(1, Math.round(area.w / aspect))
    photo = { x: area.x + Math.round((area.w - w) / 2), y: area.y + Math.round((area.h - h) / 2), w, h }
  } else {
    width += 2 * (pad.side + inner.side)
    height += pad.top + inner.top + pad.bottom + inner.bottom
    // Ảnh rất lớn cộng thêm lề có thể vượt cỡ file lớn nhất app xuất được: thu cả khung lại cho vừa.
    const shrink = MAX_CANVAS / Math.max(width, height)
    if (shrink < 1) {
      unit *= shrink
      pad = px(template.pad)
      inner = px(template.card?.pad ?? NO_PAD)
      width = Math.round(width * shrink)
      height = Math.round(height * shrink)
    }
    photo = {
      x: pad.side + inner.side,
      y: pad.top + inner.top,
      w: width - 2 * (pad.side + inner.side),
      h: height - pad.top - inner.top - pad.bottom - inner.bottom,
    }
  }
  const card = template.card
    ? { x: photo.x - inner.side, y: photo.y - inner.top, w: photo.w + 2 * inner.side, h: photo.h + inner.top + inner.bottom }
    : null
  const text: FrameGeometry['text'] = card
    ? { left: photo.x, right: photo.x + photo.w, top: [card.y, photo.y], bottom: [photo.y + photo.h, card.y + card.h] }
    : { left: pad.side, right: width - pad.side, top: [0, pad.top], bottom: [height - pad.bottom, height] }
  return { width, height, photo, pad, card, text, unit }
}

const same = (a: Placement, b: Placement) =>
  a.width === b.width && a.height === b.height && a.photo.x === b.photo.x && a.photo.y === b.photo.y && a.photo.w === b.photo.w && a.photo.h === b.photo.h

/**
 * Chữ lưu vị trí theo tỉ lệ cả file xuất, nên khi khung thông số làm file to ra / nhỏ lại thì phải tính lại để chữ vẫn
 * nằm đúng chỗ đó trên ảnh, với đúng cỡ đó so với ảnh.
 */
export function remapTexts<T extends { x: number; y: number; size: number; width: number | null }>(texts: T[], from: Placement, to: Placement): T[] {
  if (same(from, to)) return texts
  const zoom = to.photo.w / from.photo.w
  const short = (p: Placement) => Math.min(p.width, p.height)
  return texts.map((t) => ({
    ...t,
    x: (to.photo.x + ((t.x * from.width - from.photo.x) / from.photo.w) * to.photo.w) / to.width,
    y: (to.photo.y + ((t.y * from.height - from.photo.y) / from.photo.h) * to.photo.h) / to.height,
    size: (t.size * short(from) * zoom) / short(to),
    width: t.width === null ? null : (t.width * from.width * zoom) / to.width,
  }))
}
