import { describe, expect, it } from 'vitest'
import { albumName, groupByAlbum, pruneAlbumMap } from '../src/lib/albums'

const photo = (id: string) => ({ id })
const albums = [
  { id: 'a1', name: 'Đà Lạt' },
  { id: 'a2', name: 'Cưới' },
]

describe('groupByAlbum', () => {
  it('puts photos without an album under "uncategorised", listed first', () => {
    const groups = groupByAlbum([photo('p1'), photo('p2'), photo('p3')], albums, { p2: 'a1' })
    expect(groups.map((g) => [g.album?.id ?? null, g.photos.map((p) => p.id)])).toEqual([
      [null, ['p1', 'p3']],
      ['a1', ['p2']],
      ['a2', []],
    ])
  })

  it('treats a photo that points at a deleted album as uncategorised', () => {
    const groups = groupByAlbum([photo('p1')], albums, { p1: 'gone' })
    expect(groups[0].photos.map((p) => p.id)).toEqual(['p1'])
  })

  it('keeps the library order inside each album', () => {
    const groups = groupByAlbum([photo('p3'), photo('p1'), photo('p2')], albums, { p1: 'a2', p2: 'a2', p3: 'a2' })
    expect(groups[2].photos.map((p) => p.id)).toEqual(['p3', 'p1', 'p2'])
  })
})

describe('albumName', () => {
  it('trims the name and falls back to a numbered default when it is blank', () => {
    expect(albumName('  Đà Lạt  ', albums)).toBe('Đà Lạt')
    expect(albumName('   ', albums)).toBe('Album 3')
    expect(albumName(undefined, [])).toBe('Album 1')
  })

  it('does not reuse a default name that is already taken', () => {
    expect(albumName('', [{ id: 'x', name: 'Album 2' }])).toBe('Album 3')
  })
})

describe('pruneAlbumMap', () => {
  it('drops entries for photos that are no longer in the library', () => {
    expect(pruneAlbumMap({ p1: 'a1', p2: 'a2' }, (id) => id === 'p2')).toEqual({ p2: 'a2' })
  })

  it('returns the same object when nothing has to go, so the store does not change', () => {
    const map = { p1: 'a1' }
    expect(pruneAlbumMap(map, () => true)).toBe(map)
  })
})
