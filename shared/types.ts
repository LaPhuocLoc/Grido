// Kiểu dữ liệu dùng chung giữa main process (Electron) và giao diện React.

export interface Photo {
  id: string
  name: string
  /** Kích thước bản xem trước dùng lúc dàn trang. */
  width: number
  height: number
  /** Kích thước file gốc sau khi áp hướng xoay EXIF. */
  sourceWidth: number
  sourceHeight: number
  /** Dung lượng file gốc (byte). */
  size: number
  createdAt: number
  /** Đường dẫn file gốc trên máy. */
  path: string
  /** Không đọc được file gốc (đã bị di chuyển / xoá, hoặc chưa có quyền đọc) → xuất ảnh sẽ dùng bản xem trước. */
  missing: boolean
  /** Bản web: file gốc vẫn còn nhưng trình duyệt chưa được cấp lại quyền đọc trong phiên này. Luôn đi kèm `missing`. */
  locked?: boolean
  /** Bản web: file gốc đã đổi từ lần nhập (hoặc ảnh vừa được nối lại) → bản xem trước cần dựng lại. */
  stale?: boolean
}

/** Một file đã được main process chấp nhận, chờ giao diện tạo bản xem trước rồi đưa vào thư viện. */
export interface ImportCandidate {
  token: string
  name: string
}

export interface StageResult {
  candidates: ImportCandidate[]
  /** Số file bị bỏ qua vì đã có trong thư viện. */
  duplicates: number
  /** Bản web: số ảnh đang mất file gốc vừa được nối lại với file tìm thấy. */
  relinked?: number
}

export interface NewPhoto {
  token: string
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
  /** null = file gốc đủ nhỏ, dùng luôn làm bản xem trước. */
  preview: ArrayBuffer | null
  thumb: ArrayBuffer
  thumbType: string
}

export type ThemeSource = 'system' | 'light' | 'dark'

/** Trạng thái tự cập nhật, main process đẩy sang giao diện mỗi khi đổi. */
export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'latest' }
  /** Đã tìm thấy bản mới, đang chờ người dùng đồng ý cập nhật. */
  | { status: 'available'; version: string }
  /** Người dùng đã đồng ý, đang tải về. */
  | { status: 'downloading'; version: string; percent: number }
  /** Đã tải xong: giao diện gọi `install` để cài và mở lại (hoặc tự cài khi thoát app). */
  | { status: 'ready'; version: string }
  /** `manual`: không tự cài được nhưng vẫn tải bộ cài về cài tay được. */
  | { status: 'error'; message: string; manual: boolean }
  /** Bản chạy từ mã nguồn (npm run dev) không tự cập nhật. */
  | { status: 'unsupported' }

export interface AppInfo {
  version: string
  dataDir: string
}

/** API mà preload gắn vào `window.grido`. */
export interface GridoBridge {
  platform: string
  /** Đường dẫn trên đĩa của file được kéo thả vào cửa sổ; rỗng nếu file không nằm trên đĩa (vd. dán từ clipboard). */
  pathForFile: (file: File) => string
  library: {
    list: () => Promise<Photo[]>
    /** Mở hộp thoại chọn ảnh của hệ điều hành. */
    pick: () => Promise<StageResult>
    /** Nhận file / thư mục theo đường dẫn (kéo thả). */
    stage: (paths: string[]) => Promise<StageResult>
    /** Nhận ảnh không có đường dẫn (dán từ clipboard): lưu một bản vào thư mục dữ liệu của app. */
    stageBytes: (name: string, bytes: ArrayBuffer) => Promise<StageResult>
    add: (photo: NewPhoto) => Promise<Photo>
    remove: (ids: string[]) => Promise<string[]>
    reveal: (id: string) => Promise<void>
  }
  exportFile: {
    /** Mở hộp thoại lưu file; trả về đường dẫn người dùng chọn hoặc null nếu huỷ. */
    pick: (name: string) => Promise<string | null>
    /** Ghi file vào đường dẫn vừa được chọn qua `pick`. */
    write: (path: string, bytes: ArrayBuffer) => Promise<void>
    reveal: (path: string) => Promise<void>
  }
  app: {
    info: () => Promise<AppInfo>
    setTheme: (source: ThemeSource, dark: boolean) => void
    openDataDir: () => Promise<void>
  }
  updates: {
    /** Kiểm tra bản mới. Kết quả đến qua `onState`; có bản mới thì chờ người dùng đồng ý, không tự tải. */
    check: () => Promise<void>
    /** Người dùng đồng ý cập nhật: tải bản mới về. */
    download: () => Promise<void>
    /** Thoát app, cài bản vừa tải rồi mở lại. */
    install: () => Promise<void>
    /** Mở trang tải bộ cài trong trình duyệt, để cài thủ công khi không tự cài được. */
    openDownloadPage: () => Promise<void>
    /** Nghe thay đổi trạng thái (gọi ngay một lần với trạng thái hiện tại). Trả về hàm huỷ. */
    onState: (listener: (state: UpdateState) => void) => () => void
  }
}
