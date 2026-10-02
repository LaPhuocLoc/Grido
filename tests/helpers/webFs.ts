/**
 * Bản thế cho những thứ thư viện web cần ở trình duyệt: file handle của File System Access API và chỗ lưu của trang
 * (IndexedDB + OPFS, thay bằng Map trong bộ nhớ). Đủ để kiểm tra logic của src/platform/web/library.ts trong Node.
 */

type Item = FakeFile | FakeDir

/** Quyền đọc theo từng thư mục gốc, như trình duyệt: cấp cho thư mục là cấp cho mọi thứ bên trong. */
export const permissions = {
  granted: new Set<FakeDir>(),
  /** Tên những thứ đã bị hỏi quyền, theo thứ tự. */
  asked: [] as string[],
  /** Trả lời của "người dùng" cho lần hỏi tiếp theo. */
  answer: 'granted' as PermissionState,
}

abstract class FakeHandle {
  constructor(
    public name: string,
    public parent: FakeDir | null,
  ) {}

  top(): FakeDir {
    let node: FakeHandle = this
    while (node.parent) node = node.parent
    return node as unknown as FakeDir
  }

  async isSameEntry(other: unknown) {
    return other === this
  }

  async queryPermission(): Promise<PermissionState> {
    return permissions.granted.has(this.top()) ? 'granted' : 'prompt'
  }

  async requestPermission(): Promise<PermissionState> {
    permissions.asked.push(this.name)
    if (permissions.answer === 'granted') permissions.granted.add(this.top())
    return permissions.answer
  }
}

export class FakeFile extends FakeHandle {
  readonly kind = 'file'
  private file: File

  constructor(name: string, parent: FakeDir, content: string, lastModified: number) {
    super(name, parent)
    this.file = new File([content], name, { lastModified, type: name.endsWith('.png') ? 'image/png' : 'image/jpeg' })
  }

  /** File bị sửa trên đĩa. */
  rewrite(content: string, lastModified: number) {
    this.file = new File([content], this.name, { lastModified, type: this.file.type })
  }

  async getFile(): Promise<File> {
    if (this.parent!.items.get(this.name) !== this) throw new DOMException('gone', 'NotFoundError')
    if (!permissions.granted.has(this.top())) throw new DOMException('no permission', 'NotAllowedError')
    return this.file
  }
}

export class FakeDir extends FakeHandle {
  readonly kind = 'directory'
  items = new Map<string, Item>()

  file(name: string, content = name, lastModified = 1000): FakeFile {
    const file = new FakeFile(name, this, content, lastModified)
    this.items.set(name, file)
    return file
  }

  dir(name: string): FakeDir {
    const dir = new FakeDir(name, this)
    this.items.set(name, dir)
    return dir
  }

  /** Chuyển một file sang thư mục khác (handle cũ chết, trả về handle mới), giữ nguyên nội dung và ngày sửa. */
  async move(name: string, to: FakeDir): Promise<FakeFile> {
    const old = this.items.get(name) as FakeFile
    const file = await old.getFile()
    this.items.delete(name)
    return to.file(name, await file.text(), file.lastModified)
  }

  async *entries(): AsyncGenerator<[string, Item]> {
    for (const item of this.items) yield item
  }

  async resolve(handle: FakeHandle): Promise<string[] | null> {
    const path: string[] = []
    for (let node: FakeHandle | null = handle; node; node = node.parent) {
      if (node === this) return path
      path.unshift(node.name)
    }
    return null
  }
}

/** Thư mục gốc trên "ổ đĩa" của người dùng, đã được cấp quyền đọc (như vừa chọn trong hộp thoại). */
export function disk(name: string): FakeDir {
  const root = new FakeDir(name, null)
  permissions.granted.add(root)
  return root
}

/** Phiên trình duyệt mới: quyền đọc không còn. */
export const newSession = () => permissions.granted.clear()

// ---- Chỗ lưu của trang, thay cho src/platform/web/storage.ts ---------------------------------------------------------

const stores = { photos: new Map<string, unknown>(), roots: new Map<string, unknown>() }
export const files = { cache: new Map<string, File>(), imports: new Map<string, File>() }

export function resetStorage() {
  for (const map of [stores.photos, stores.roots, files.cache, files.imports]) map.clear()
  permissions.granted.clear()
  permissions.asked.length = 0
  permissions.answer = 'granted'
}

export const storage = {
  getAll: async (store: keyof typeof stores) => [...stores[store].values()].map((v) => ({ ...(v as object) })),
  put: async (store: keyof typeof stores, value: { id: string }) => void stores[store].set(value.id, { ...value }),
  removeKeys: async (store: keyof typeof stores, keys: string[]) => keys.forEach((key) => stores[store].delete(key)),
  writeFile: async (dir: keyof typeof files, name: string, data: Blob | ArrayBuffer) => void files[dir].set(name, new File([data], name)),
  readFile: async (dir: keyof typeof files, name: string) => {
    const file = files[dir].get(name)
    if (!file) throw new DOMException('gone', 'NotFoundError')
    return file
  },
  listFiles: async (dir: keyof typeof files) => [...files[dir].keys()],
  deleteFile: async (dir: keyof typeof files, name: string) => void files[dir].delete(name),
}
