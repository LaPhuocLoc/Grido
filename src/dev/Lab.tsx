import { useEffect, useRef, useState } from 'react'
import { renderCollage } from '../lib/imaging/exportCollage'
import type { TextTemplate } from '../lib/templates'
import { fontInfo, normalizeText } from '../lib/text'
import { TEMPLATES } from '../templates'

declare global {
  interface Window {
    /** Số mẫu đã vẽ xong trên trang so sánh; script chụp ảnh chờ con số này đủ rồi mới chụp. */
    __labDone?: number
  }
}

/** Bề rộng (px) mỗi ô ảnh trên trang so sánh. */
const CELL = 460
/** Mẫu được vẽ ở bề rộng này rồi thu nhỏ khi hiển thị, cho giống điều kiện xuất ảnh thật. */
const RENDER_WIDTH = 1380

/**
 * Trang so sánh mẫu chữ với ảnh mẫu gốc của font, chỉ có ở bản dev: `/?lab=vn-allura,vn-geist` (hoặc `?lab=all`).
 * Mỗi hàng: ảnh gốc · mẫu vẽ bằng đúng hàm xuất ảnh của app · hai ảnh chồng lên nhau để soi lệch vị trí.
 */
export function Lab() {
  const wanted = new URLSearchParams(location.search).get('lab') ?? ''
  const ids = wanted === 'all' ? TEMPLATES.map((t) => t.font) : wanted.split(',').filter(Boolean)
  useEffect(() => {
    window.__labDone = 0
  }, [])
  return (
    <div style={{ padding: 8, background: '#777', font: '12px sans-serif', color: '#fff' }}>
      {ids.map((id) => (
        <Row key={id} id={id} template={TEMPLATES.find((t) => t.font === id)} />
      ))}
    </div>
  )
}

function Row({ id, template }: { id: string; template?: TextTemplate }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const counted = useRef(false)
  const aspect = template?.aspect ?? 16 / 9
  const height = CELL / aspect

  useEffect(() => {
    const done = () => {
      if (!counted.current) window.__labDone = (window.__labDone ?? 0) + 1
      counted.current = true
    }
    if (!template) return done()
    let alive = true
    const width = RENDER_WIDTH
    renderCollage(
      {
        width,
        height: Math.round(width / template.aspect),
        bg: template.bg,
        margin: 0,
        gap: 0,
        radius: 0,
        tree: { kind: 'cell' },
        cells: [],
        texts: template.items.map((item, i) => normalizeText({ id: `lab${i}`, ...item })),
      },
      0,
    )
      .then((canvas) => alive && setUrl(canvas.toDataURL('image/png')))
      .catch((err: Error) => alive && setError(err.message))
      .finally(done)
    return () => {
      alive = false
    }
  }, [template])

  const cell = { width: CELL, height, display: 'block', objectFit: 'cover' as const }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ marginBottom: 2 }}>
        {id} · {fontInfo(id).label} {template ? `· ${template.items.length} dòng · tỉ lệ ${template.aspect}` : '· CHƯA CÓ MẪU'} {error && `· LỖI: ${error}`}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <img src={`/__dev/thumb/${id}`} style={cell} />
        {url ? <img src={url} style={cell} /> : <div style={{ ...cell, background: '#555' }} />}
        <div style={{ position: 'relative', width: CELL, height }}>
          <img src={`/__dev/thumb/${id}`} style={{ ...cell, position: 'absolute' }} />
          {url && <img src={url} style={{ ...cell, position: 'absolute', opacity: 0.5 }} />}
        </div>
      </div>
    </div>
  )
}
