import type { GridoBridge, StageResult } from '../../shared/types'
import type { Platform } from './types'

const ORIGIN = 'grido://app'

/** Bản desktop: main process của Electron lo file trên đĩa, giao diện chỉ gọi qua cầu nối `window.grido`. */
export function electronPlatform(bridge: GridoBridge): Platform {
  const stageFiles = async (files: File[]): Promise<StageResult> => {
    const paths: string[] = []
    const staged: StageResult = { candidates: [], duplicates: 0 }
    const merge = (r: StageResult) => {
      staged.candidates.push(...r.candidates)
      staged.duplicates += r.duplicates
    }
    for (const file of files) {
      const path = bridge.pathForFile(file)
      if (path) paths.push(path)
      // Không có đường dẫn (ảnh dán từ clipboard, kéo từ trình duyệt): app tự giữ một bản.
      else if (file.type.startsWith('image/')) merge(await bridge.library.stageBytes(file.name, await file.arrayBuffer()))
    }
    if (paths.length) merge(await bridge.library.stage(paths))
    return staged
  }

  return {
    platform: bridge.platform,
    features: { reveal: true, dataDir: true, installer: true },
    library: {
      list: bridge.library.list,
      pick: bridge.library.pick,
      stageFiles,
      stageDrop: (data) => stageFiles([...data.files]),
      add: bridge.library.add,
      remove: bridge.library.remove,
      reveal: bridge.library.reveal,
    },
    images: {
      // Scheme riêng của app trả ảnh theo id nên địa chỉ có ngay, không phải chờ.
      url: (id, kind) => `${ORIGIN}/photo/${id}/${kind}`,
      subscribe: () => () => {},
      version: () => 0,
      importSource: async (token) => `${ORIGIN}/import/${token}`,
      cellSources: async (photo) =>
        photo.missing ? [`${ORIGIN}/photo/${photo.id}/preview`] : [`${ORIGIN}/photo/${photo.id}/original`, `${ORIGIN}/photo/${photo.id}/preview`],
    },
    exportFile: bridge.exportFile,
    app: bridge.app,
    updates: bridge.updates,
  }
}
