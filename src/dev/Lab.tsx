import { useEffect, useRef, useState } from 'react'
import { renderCollage } from '../lib/imaging/exportCollage'
import type { TextTemplate } from '../lib/templates'
import { fontInfo, normalizeText } from '../lib/text'
import { TEMPLATES } from '../templates'
import { fitTemplate, type Draft, type FitReport } from './fit'

declare global {
  interface Window {
    /** Số mẫu đã vẽ xong trên trang so sánh; script chụp ảnh chờ con số này đủ rồi mới chụp. */
    __labDone?: number
    /** Kết quả tự canh của từng mẫu khi mở trang với `&fit=1`. */
    __labReport?: FitReport[]
  }
}

/** Bề rộng (px) mỗi ô ảnh trên trang so sánh. */
const CELL = 460
/** Mẫu được vẽ ở bề rộng này rồi thu nhỏ khi hiển thị, cho giống điều kiện xuất ảnh thật. */
const RENDER_WIDTH = 1380

/**
 * Trang so sánh mẫu chữ với ảnh mẫu gốc của font, chỉ có ở bản dev: `/?lab=vn-allura,vn-geist` (hoặc `?lab=all`).
 * Mỗi hàng: ảnh gốc · mẫu vẽ bằng đúng hàm xuất ảnh của app · hai ảnh chồng lên nhau để soi lệch vị trí.
 * Thêm `&fit=1`: trước khi vẽ, tự canh từng mẫu cho khớp ảnh gốc (xem fit.ts) và ghi kết quả vào src/templates.
 */
export function Lab() {
  const query = new URLSearchParams(location.search)
  const wanted = query.get('lab') ?? ''
  const fit = query.has('fit')
  // &compact=1: chỉ ảnh gốc và mẫu, xếp nhiều cột, để soát nhanh cả trăm mẫu.
  const compact = query.has('compact')
  const ids = wanted === 'all' ? TEMPLATES.map((t) => t.font) : wanted.split(',').filter(Boolean)
  useEffect(() => {
    window.__labDone = 0
  }, [])
  return (
    <div style={{ padding: 8, background: '#777', font: '12px sans-serif', color: '#fff', display: compact ? 'flex' : 'block', flexWrap: 'wrap', gap: 8 }}>
      {ids.map((id) => (
        <Row key={id} id={id} draft={TEMPLATES.find((t) => t.font === id)} fit={fit} cell={compact ? 220 : CELL} overlay={!compact} />
      ))}
    </div>
  )
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('không tải được ảnh gốc'))
    image.src = src
  })

function Row({ id, draft, fit, cell: CELL, overlay }: { id: string; draft?: TextTemplate; fit: boolean; cell: number; overlay: boolean }) {
  const [template, setTemplate] = useState(fit ? undefined : draft)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scores, setScores] = useState<string>('')
  const counted = useRef(false)
  const aspect = template?.aspect || 16 / 9
  const height = CELL / aspect

  useEffect(() => {
    const done = () => {
      if (!counted.current) window.__labDone = (window.__labDone ?? 0) + 1
      counted.current = true
    }
    if (!draft) return done()
    let alive = true
    void (async () => {
      let current = draft
      if (fit) {
        const { template: fitted, matched, report } = await fitTemplate(draft as Draft, await loadImage(`/__dev/thumb/${id}`))
        ;(window.__labReport ??= []).push(report)
        await fetch('/__dev/template', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fitted) })
        current = matched
        if (alive) {
          setTemplate(fitted)
          setScores(report.scores.join(' · '))
        }
      }
      const width = RENDER_WIDTH
      const canvas = await renderCollage(
        {
          width,
          height: Math.round(width / current.aspect),
          bg: current.bg,
          margin: 0,
          gap: 0,
          radius: 0,
          tree: { kind: 'cell' },
          cells: [],
          texts: current.items.map((item, i) => normalizeText({ id: `lab${i}`, ...item })),
        },
        0,
      )
      if (alive) setUrl(canvas.toDataURL('image/png'))
    })()
      .catch((err: Error) => alive && setError(err.message))
      .finally(done)
    return () => {
      alive = false
    }
  }, [draft, fit, id])

  const cell = { width: CELL, height, display: 'block', objectFit: 'cover' as const }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ marginBottom: 2 }}>
        {id} {overlay && `· ${fontInfo(id).label}`}{' '}
        {!overlay ? '' : template ? `· ${template.items.length} dòng · tỉ lệ ${template.aspect}` : draft ? '· đang canh…' : '· CHƯA CÓ MẪU'} {scores && `· khớp ${scores}`}{' '}
        {error && `· LỖI: ${error}`}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <img src={`/__dev/thumb/${id}`} style={cell} />
        {url ? <img src={url} style={cell} /> : <div style={{ ...cell, background: '#555' }} />}
        {overlay && (
          <div style={{ position: 'relative', width: CELL, height }}>
            <img src={`/__dev/thumb/${id}`} style={{ ...cell, position: 'absolute' }} />
            {url && <img src={url} style={{ ...cell, position: 'absolute', opacity: 0.5 }} />}
          </div>
        )}
      </div>
    </div>
  )
}
