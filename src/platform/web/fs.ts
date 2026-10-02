/**
 * File System Access API (Chrome / Edge) chưa có đủ trong bộ kiểu DOM của TypeScript: khai báo phần app dùng tới.
 * Mọi lời gọi tới các hàm chưa chuẩn hoá đi qua file này.
 */

type Mode = { mode: 'read' | 'readwrite' }

interface WithPermission {
  queryPermission: (descriptor: Mode) => Promise<PermissionState>
  requestPermission: (descriptor: Mode) => Promise<PermissionState>
}

interface FileType {
  description: string
  accept: Record<string, string[]>
}

interface Pickers {
  showOpenFilePicker: (options: { id?: string; multiple?: boolean; types?: FileType[] }) => Promise<FileSystemFileHandle[]>
  showDirectoryPicker: (options: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
  showSaveFilePicker: (options: { id?: string; suggestedName?: string; types?: FileType[] }) => Promise<FileSystemFileHandle>
}

const pickers = () => window as unknown as Pickers
const READ: Mode = { mode: 'read' }

export const hasFileAccess = () => 'showOpenFilePicker' in window && 'showDirectoryPicker' in window && 'showSaveFilePicker' in window

/** Người dùng bấm Huỷ trong hộp thoại của trình duyệt. */
export const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError'

export const openFiles = (types: FileType[]) => pickers().showOpenFilePicker({ id: 'photos', multiple: true, types })
export const openFolder = () => pickers().showDirectoryPicker({ id: 'photos', mode: 'read' })
export const saveFile = (suggestedName: string, types: FileType[], id = 'export') => pickers().showSaveFilePicker({ id, suggestedName, types })
/** Chọn đúng một file. */
export const openOne = async (types: FileType[], id: string) => (await pickers().showOpenFilePicker({ id, multiple: false, types }))[0]

export const canRead = async (handle: FileSystemHandle) => (await (handle as FileSystemHandle & WithPermission).queryPermission(READ)) === 'granted'
export const askRead = async (handle: FileSystemHandle) => (await (handle as FileSystemHandle & WithPermission).requestPermission(READ)) === 'granted'

/** File và thư mục con trực tiếp của một thư mục. */
export const children = (dir: FileSystemDirectoryHandle) =>
  (dir as FileSystemDirectoryHandle & { entries: () => AsyncIterable<[string, FileSystemHandle]> }).entries()

/** Handle của một mục vừa được kéo thả vào trang; null nếu trình duyệt không cấp (vd. ảnh kéo từ trang web khác). */
export const droppedHandle = (item: DataTransferItem): Promise<FileSystemHandle | null> =>
  (item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }).getAsFileSystemHandle?.() ?? Promise.resolve(null)

export const isDirectory = (handle: FileSystemHandle): handle is FileSystemDirectoryHandle => handle.kind === 'directory'
export const isFile = (handle: FileSystemHandle): handle is FileSystemFileHandle => handle.kind === 'file'
