import type { PhotoExif } from '../../../shared/types'

/** Những mục chữ một khung thông số in ra được. */
export const FRAME_FIELDS = ['brand', 'model', 'lens', 'settings', 'film', 'date', 'note'] as const
export type FrameField = (typeof FRAME_FIELDS)[number]
export type FrameInfo = Record<FrameField, string>
/** Chữ người dùng tự gõ thay cho thông tin đọc từ ảnh; chuỗi rỗng = không in mục đó. */
export type FrameValues = Partial<FrameInfo>

/** Tên hãng viết như trên thân máy; EXIF ghi đủ kiểu ("NIKON CORPORATION", "OLYMPUS IMAGING CORP."…). */
const BRANDS = ['FUJIFILM', 'Nikon', 'Canon', 'SONY', 'OLYMPUS', 'Panasonic', 'LEICA', 'RICOH', 'PENTAX', 'Hasselblad', 'SIGMA', 'Apple', 'Samsung', 'Google', 'Xiaomi', 'HUAWEI', 'OPPO', 'vivo', 'DJI', 'GoPro']
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']

function brandOf(make: string): string {
  const lower = make.toLowerCase()
  if (lower.startsWith('om digital')) return 'OM SYSTEM'
  return BRANDS.find((b) => lower.startsWith(b.toLowerCase())) ?? make
}

function modelOf(model: string, make: string, brand: string): string {
  let name = model
  // Nhiều hãng ghi lại tên mình ở đầu tên máy ("Canon EOS R6", "NIKON Z 6_2").
  for (const prefix of [make, brand]) if (prefix && name.toLowerCase().startsWith(`${prefix.toLowerCase()} `)) name = name.slice(prefix.length + 1)
  // Sony: ILCE-7RM5 là mã nội bộ của A7R V.
  const sony = /^ILCE-(\d+)([A-Z]*?)(?:M(\d))?$/.exec(name)
  if (sony) return `A${sony[1]}${sony[2]}${sony[3] ? ` ${ROMAN[Number(sony[3])]}` : ''}`
  // Nikon: "Z 6_2" là Z 6II.
  return name.replace(/_(\d)$/, (_, n: string) => ROMAN[Number(n)])
}

const trim = (n: number) => String(Math.round(n * 10) / 10)

/** Tốc màn trập: từ 0,4 giây trở lên viết theo giây, nhanh hơn thì viết dạng phân số. */
const shutter = (t: number) => (t >= 0.4 ? `${trim(t)}s` : `1/${Math.round(1 / t)}s`)

/** Chữ in trên khung thông số của một ảnh: đọc từ EXIF, mục nào người dùng đã tự gõ thì lấy theo người dùng. */
export function frameInfo(exif: PhotoExif | null | undefined, values: FrameValues): FrameInfo {
  const e = exif ?? {}
  const brand = e.make ? brandOf(e.make) : ''
  const taken = e.takenAt?.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d:\d\d)/)
  const read: FrameInfo = {
    brand,
    model: e.model ? modelOf(e.model, e.make ?? '', brand) : '',
    lens: e.lens ?? '',
    settings: [
      e.focalLength && `${Math.round(e.focalLength)}mm`,
      e.fNumber && `f/${trim(e.fNumber)}`,
      e.exposureTime && shutter(e.exposureTime),
      e.iso && `ISO ${Math.round(e.iso)}`,
    ]
      .filter(Boolean)
      .join('  '),
    film: e.filmSimulation ?? '',
    date: taken ? `${taken[1]}.${taken[2]}.${taken[3]} ${taken[4]}` : '',
    note: e.artist ?? '',
  }
  for (const field of FRAME_FIELDS) {
    const typed = values[field]
    if (typeof typed === 'string') read[field] = typed.trim()
  }
  return read
}
