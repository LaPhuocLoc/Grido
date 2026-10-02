import type { GridoBridge, NewPhoto, Photo, StageResult } from '../../shared/types'
import type { ImageSource } from '../lib/imaging/imaging.worker'

export type UrlKind = 'thumb' | 'preview'

export interface StorageUsage {
  /** Byte trang đang dùng và hạn mức trình duyệt cho phép. */
  used: number
  quota: number
  /** Trình duyệt đã cam kết không tự dọn dữ liệu của trang. */
  persisted: boolean
  photos: number
}

/**
 * Mọi thứ giao diện cần ở "bên ngoài trang": file trên đĩa, hộp thoại, cập nhật.
 * Có hai bản cài đặt: Electron (bọc `window.grido`) và web (File System Access API + IndexedDB + OPFS).
 */
export interface Platform {
  /** 'win32' | 'darwin' | 'linux' ở bản desktop, 'web' ở bản chạy trong trình duyệt. */
  platform: string
  features: {
    /** Mở được trình quản lý file tại một file ("Mở thư mục chứa ảnh"). */
    reveal: boolean
    /** Có thư mục dữ liệu trên đĩa để mở xem. */
    dataDir: boolean
    /** Bản mới là một bộ cài phải tải về (desktop); bản web chỉ cần tải lại trang. */
    installer: boolean
  }
  library: {
    list: () => Promise<Photo[]>
    /** Mở hộp thoại chọn ảnh. */
    pick: () => Promise<StageResult>
    /** Mở hộp thoại chọn cả thư mục (bản web: một lần cấp quyền cho mọi ảnh bên trong). */
    pickFolder?: () => Promise<StageResult>
    /** Nhận file không qua kéo thả (dán từ clipboard…). */
    stageFiles: (files: File[]) => Promise<StageResult>
    /** Nhận những gì vừa được thả vào cửa sổ. Phải gọi ngay trong sự kiện drop: sau đó `data` không còn đọc được. */
    stageDrop: (data: DataTransfer) => Promise<StageResult>
    add: (photo: NewPhoto) => Promise<Photo>
    remove: (ids: string[]) => Promise<string[]>
    reveal: (id: string) => Promise<void>
    /** Bản web: xin lại quyền đọc file gốc của những ảnh đang `locked`. Phải gọi từ một thao tác bấm của người dùng. */
    grantAccess?: () => Promise<void>
    /** Bản web: thay bản xem trước + thumbnail của một ảnh `stale` bằng bản vừa dựng lại từ file gốc. */
    refresh?: (id: string, photo: Omit<NewPhoto, 'token'>) => Promise<Photo>
  }
  /** Bản web: dữ liệu của app nằm trong trình duyệt nên cần chỗ xem dung lượng và sao lưu ra file. */
  data?: {
    usage: () => Promise<StorageUsage>
    /** Hỏi nơi lưu rồi ghi file sao lưu gồm `state` (thiết kế, album, cài đặt) và danh mục thư viện. False = người dùng huỷ. */
    backup: (state: unknown) => Promise<boolean>
    /**
     * Chọn file sao lưu rồi đưa các ảnh trong đó vào thư viện ở trạng thái chờ nối lại với file gốc.
     * Trả về `state` đã lưu để giao diện nạp lại; null = người dùng huỷ.
     */
    restore: () => Promise<{ state: unknown; photos: number } | null>
    /** Xoá file thừa trong bộ nhớ của trang (không còn ảnh nào trong thư viện dùng tới). Trả về số file đã xoá. */
    cleanup: () => Promise<number>
  }
  images: {
    /** Địa chỉ để hiển thị thumbnail / bản xem trước. Chuỗi rỗng nếu chưa sẵn sàng (bản web tạo dần), xem `subscribe`. */
    url: (id: string, kind: UrlKind) => string
    /** Báo khi có địa chỉ ảnh vừa sẵn sàng. Trả về hàm huỷ. */
    subscribe: (listener: () => void) => () => void
    /** Tăng lên mỗi lần có địa chỉ mới, cho những chỗ vẽ nhiều ảnh trong một vòng lặp. */
    version: () => number
    /** File đang chờ nhập, để worker tạo bản xem trước. */
    importSource: (token: string) => Promise<ImageSource>
    /** Nguồn của một ô ảnh khi xuất, theo thứ tự ưu tiên: file gốc (nếu đọc được), rồi bản xem trước. */
    cellSources: (photo: Photo) => Promise<ImageSource[]>
  }
  exportFile: GridoBridge['exportFile']
  app: GridoBridge['app']
  updates: GridoBridge['updates']
}
