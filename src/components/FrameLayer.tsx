import { memo, useEffect, useRef } from 'react'
import { thumbUrl } from '../lib/desktop'
import { BACKDROP_OVERSCAN, CARD_SHADOW, drawFrame, hasBackdrop, loadFrameFonts } from '../lib/frames/draw'
import { placeImage } from '../lib/geometry'
import type { CollageSpec } from '../lib/imaging/exportCollage'
import { imageStyle } from './imageStyle'

/**
 * Lớp nằm trên ảnh của khung thông số (hoạ tiết ở lề và chữ) trên bản xem trước, vẽ bằng đúng hàm dùng lúc xuất nên hai
 * bên luôn khớp nhau. `k`: số px màn hình trên mỗi px file xuất.
 */
export const FrameLayer = memo(function FrameLayer({ spec, k }: { spec: Pick<CollageSpec, 'width' | 'height' | 'bg' | 'frame'>; k: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { frame, width, height, bg } = spec
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !frame) return
    let alive = true
    const paint = () => {
      if (!alive) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(width * k * dpr))
      canvas.height = Math.max(1, Math.round(height * k * dpr))
      drawFrame(canvas.getContext('2d')!, frame, { width, height, bg }, k * dpr)
    }
    // Vẽ ngay để khung bám theo thao tác; font tải xong thì vẽ lại cho đúng nét chữ.
    paint()
    void loadFrameFonts(frame.info).then(paint)
    return () => {
      alive = false
    }
  }, [frame, width, height, bg, k])
  if (!frame) return null
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
})

/**
 * Lớp nằm dưới ảnh của khung thông số trên bản xem trước: nền là chính ảnh đó phóng to rồi làm mờ, và tấm nền ôm quanh
 * ảnh. Dựng bằng CSS với cùng các số đo mà `drawBackdrop` dùng lúc xuất.
 */
export function FrameBackdrop({ spec, k }: { spec: Pick<CollageSpec, 'width' | 'height' | 'bg' | 'frame' | 'cells'>; k: number }) {
  const { frame, width, height } = spec
  const cell = spec.cells[0]
  if (!frame || !hasBackdrop(frame)) return null
  const { backdrop, card } = frame.template
  // Ảnh đúng như trong ô (đã cắt, xoay), phóng cho phủ kín cả file rồi rộng thêm một chút để mép mờ không lộ ra.
  const s = Math.max(width / frame.photo.w, height / frame.photo.h) * BACKDROP_OVERSCAN * k
  const w = frame.photo.w * s
  const h = frame.photo.h * s
  const unit = frame.unit * k
  return (
    <>
      {backdrop && cell && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute overflow-hidden"
            style={{ left: (width * k - w) / 2, top: (height * k - h) / 2, width: w, height: h, filter: `blur(${backdrop.blur * unit}px)` }}
          >
            <img
              src={thumbUrl(cell.photo.id) || undefined}
              alt=""
              draggable={false}
              className="absolute left-0 top-0 max-w-none"
              style={imageStyle(placeImage(cell.photo.width, cell.photo.height, w, h, cell.adjust), cell.adjust)}
            />
          </div>
          <div className="absolute inset-0" style={{ background: backdrop.tint }} />
        </div>
      )}
      {frame.card && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: frame.card.x * k,
            top: frame.card.y * k,
            width: frame.card.w * k,
            height: frame.card.h * k,
            background: spec.bg,
            boxShadow: card?.shadow ? `0 ${CARD_SHADOW.y * unit}px ${CARD_SHADOW.blur * unit}px ${CARD_SHADOW.color}` : undefined,
          }}
        />
      )}
    </>
  )
}
