/**
 * Chỉ một tab được chạy app tại một thời điểm (như bản desktop chỉ mở một cửa sổ): hai tab cùng ghi bản nháp và thư viện
 * sẽ đè dữ liệu của nhau.
 *
 * Tab giữ khoá Web Locks là tab đang hoạt động. Tab khác muốn giành quyền thì nhắn "takeover": tab cũ tải lại trang
 * (lúc đó bản nháp được ghi xuống và khoá được nhả), tải lại xong nó thấy khoá đã có chủ nên chỉ hiện thông báo.
 */

const LOCK = 'tiem-ghep-anh:active-tab'
const channel = new BroadcastChannel(LOCK)

/** Giữ khoá tới khi tab đóng hoặc tải lại. */
function hold(): Promise<never> {
  channel.onmessage = (e) => {
    if (e.data === 'takeover') location.reload()
  }
  return new Promise(() => {})
}

/** Thử làm tab hoạt động. False = app đang mở ở tab khác. */
export const claimTab = () =>
  new Promise<boolean>((resolve) => {
    void navigator.locks.request(LOCK, { ifAvailable: true }, (lock) => {
      resolve(!!lock)
      return lock ? hold() : undefined
    })
  })

/** Giành quyền từ tab đang hoạt động; xong khi tab kia đã nhả khoá. */
export const takeOverTab = () =>
  new Promise<void>((resolve) => {
    void navigator.locks.request(LOCK, () => {
      resolve()
      return hold()
    })
    channel.postMessage('takeover')
  })
