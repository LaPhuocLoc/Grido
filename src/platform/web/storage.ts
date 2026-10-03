/**
 * Chỗ lưu của bản web, tất cả nằm trên máy người dùng:
 *   IndexedDB  chỉ mục thư viện + file handle (chỉ IndexedDB lưu được handle), thư mục lưu ảnh xuất
 *   OPFS       thumbnail, bản xem trước, và file gốc của ảnh dán từ clipboard
 */

const DB_NAME = 'tiem-ghep-anh'
const DB_VERSION = 2
export type Store = 'photos' | 'roots' | 'settings'

let db: Promise<IDBDatabase> | undefined
function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      for (const name of ['photos', 'roots', 'settings'] as const) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return db
}

async function run<T>(store: Store, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const tx = (await open()).transaction(store, mode)
  return new Promise<T>((resolve, reject) => {
    const req = work(tx.objectStore(store))
    tx.oncomplete = () => resolve(req ? req.result : (undefined as T))
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
}

export const getAll = <T>(store: Store) => run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
export const get = <T>(store: Store, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
export const put = (store: Store, value: unknown) => run<void>(store, 'readwrite', (s) => void s.put(value))
export const removeKeys = (store: Store, keys: string[]) =>
  run<void>(store, 'readwrite', (s) => {
    for (const key of keys) s.delete(key)
  })

export type Folder = 'cache' | 'imports'
const folders = new Map<Folder, Promise<FileSystemDirectoryHandle>>()
function folder(name: Folder): Promise<FileSystemDirectoryHandle> {
  let dir = folders.get(name)
  if (!dir) {
    dir = navigator.storage.getDirectory().then((root) => root.getDirectoryHandle(name, { create: true }))
    folders.set(name, dir)
  }
  return dir
}

export async function writeFile(dir: Folder, name: string, data: Blob | ArrayBuffer): Promise<void> {
  try {
    const handle = await (await folder(dir)).getFileHandle(name, { create: true })
    const out = await handle.createWritable()
    await out.write(data)
    await out.close()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError')
      throw new Error('Bộ nhớ trình duyệt dành cho trang này đã đầy. Xoá bớt ảnh trong thư viện rồi thử lại nhé.')
    throw err
  }
}

/** File nằm trên đĩa: tạo địa chỉ blob từ nó không tốn RAM. */
export const readFile = async (dir: Folder, name: string): Promise<File> => (await (await folder(dir)).getFileHandle(name)).getFile()

export async function listFiles(dir: Folder): Promise<string[]> {
  const names: string[] = []
  const handle = (await folder(dir)) as FileSystemDirectoryHandle & { keys: () => AsyncIterable<string> }
  for await (const name of handle.keys()) names.push(name)
  return names
}

export const deleteFile = async (dir: Folder, name: string): Promise<void> => {
  await (await folder(dir)).removeEntry(name).catch(() => {})
}
