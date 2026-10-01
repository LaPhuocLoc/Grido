import type { GridoBridge, ImportCandidate, NewPhoto, Photo, UpdateState } from '../../shared/types'

/** Bản thế của main process: thư viện nằm trong bộ nhớ, đủ mọi hàm của cầu nối thật. */
export function fakeBridge(initial: Photo[] = []) {
  let photos = [...initial]
  let seq = 0
  const staged = new Map<string, string>()
  const saved: { path: string; suggested: string; bytes: ArrayBuffer }[] = []
  let suggested = ''
  const state = { pickResult: [] as string[], saveResult: 'C:\\out\\collage.jpg' as string | null, failAdd: new Set<string>() }

  const stage = (paths: string[]) => {
    const known = new Set(photos.map((p) => p.path))
    const candidates: ImportCandidate[] = []
    let duplicates = 0
    for (const path of paths) {
      if (!/\.(jpe?g|png|webp)$/i.test(path)) continue
      if (known.has(path)) duplicates++
      else {
        const token = `token-${++seq}`
        staged.set(token, path)
        candidates.push({ token, name: path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '') })
      }
    }
    return { candidates, duplicates }
  }

  const bridge: GridoBridge = {
    platform: 'win32',
    pathForFile: (file) => (file as File & { fakePath?: string }).fakePath ?? '',
    library: {
      list: async () => photos,
      pick: async () => stage(state.pickResult),
      stage: async (paths) => stage(paths),
      stageBytes: async (name) => stage([`C:\\grido\\imports\\${name}`]),
      add: async (input: NewPhoto) => {
        const path = staged.get(input.token)
        if (!path) throw new Error('unknown token')
        if (state.failAdd.has(path)) throw new Error('Ổ đĩa đầy')
        staged.delete(input.token)
        const photo: Photo = {
          id: `photo-${++seq}`,
          name: path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, ''),
          path,
          width: input.width,
          height: input.height,
          sourceWidth: input.sourceWidth,
          sourceHeight: input.sourceHeight,
          size: 1000,
          createdAt: seq,
          missing: false,
        }
        photos = [photo, ...photos]
        return photo
      },
      remove: async (ids) => {
        const gone = photos.filter((p) => ids.includes(p.id)).map((p) => p.id)
        photos = photos.filter((p) => !ids.includes(p.id))
        return gone
      },
      reveal: async () => {},
    },
    exportFile: {
      pick: async (name) => {
        suggested = name
        return state.saveResult
      },
      write: async (path, bytes) => {
        saved.push({ path, suggested, bytes })
      },
      reveal: async () => {},
    },
    app: {
      info: async () => ({ version: '1.0.0', dataDir: 'C:\\grido' }),
      setTheme: () => {},
      openDataDir: async () => {},
    },
    updates: {
      check: async () => {},
      download: async () => {},
      install: async () => {},
      openDownloadPage: async () => {},
      onState: (_listener: (state: UpdateState) => void) => () => {},
    },
  }
  return { bridge, state, saved }
}

export function photo(id: string, extra: Partial<Photo> = {}): Photo {
  return {
    id,
    name: id,
    path: `C:\\photos\\${id}.jpg`,
    width: 2560,
    height: 1707,
    sourceWidth: 6000,
    sourceHeight: 4000,
    size: 12_000_000,
    createdAt: 1,
    missing: false,
    ...extra,
  }
}

/** File như khi được kéo thả từ trình quản lý file (có đường dẫn trên đĩa). */
export function droppedFile(path: string, type = 'image/jpeg'): File {
  return Object.assign(new File(['x'], path.split(/[\\/]/).pop()!, { type }), { fakePath: path })
}
