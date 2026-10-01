/** Album để phân loại ảnh trong thư viện. Ảnh không thuộc album nào nằm ở mục "Chưa phân loại". */
export interface Album {
  id: string
  name: string
}

/** Id của mục "Chưa phân loại" khi cần coi nó như một nhóm (vd. trạng thái thu gọn). */
export const UNCATEGORIZED = 'none'

export interface AlbumGroup<P> {
  /** null = mục "Chưa phân loại". */
  album: Album | null
  photos: P[]
}

/**
 * Chia ảnh theo album, giữ nguyên thứ tự của thư viện trong từng nhóm. "Chưa phân loại" luôn đứng đầu
 * (ảnh mới thêm rơi vào đây), kế đó là các album theo thứ tự tạo — kể cả album đang trống.
 */
export function groupByAlbum<P extends { id: string }>(photos: P[], albums: Album[], photoAlbum: Record<string, string>): AlbumGroup<P>[] {
  const groups = new Map<string, AlbumGroup<P>>(albums.map((album) => [album.id, { album, photos: [] }]))
  const loose: AlbumGroup<P> = { album: null, photos: [] }
  // Ảnh trỏ tới album đã bị xoá thì coi như chưa phân loại.
  for (const photo of photos) (groups.get(photoAlbum[photo.id]) ?? loose).photos.push(photo)
  return [loose, ...groups.values()]
}

/** Tên album: bỏ khoảng trắng thừa; để trống thì đặt "Album N" với N chưa bị dùng. */
export function albumName(name: string | undefined, existing: Album[]): string {
  const trimmed = name?.trim()
  if (trimmed) return trimmed
  const taken = new Set(existing.map((a) => a.name))
  let n = existing.length + 1
  while (taken.has(`Album ${n}`)) n++
  return `Album ${n}`
}

/** Bỏ ghi nhớ album của những ảnh không còn trong thư viện. Không có gì để bỏ thì trả lại đúng object cũ. */
export function pruneAlbumMap(map: Record<string, string>, alive: (photoId: string) => boolean): Record<string, string> {
  const ids = Object.keys(map)
  if (ids.every(alive)) return map
  return Object.fromEntries(ids.filter(alive).map((id) => [id, map[id]]))
}
