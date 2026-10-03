// Đặt giao diện sáng/tối trước khi trang vẽ lần đầu để không bị nháy màu.
// (File riêng vì CSP không cho chạy script viết thẳng trong HTML.)
;(function () {
  var theme = 'system'
  try {
    theme = JSON.parse(localStorage.getItem('grido-settings')).state.theme || 'system'
  } catch (e) {}
  var dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()

// Chrome / Edge báo "trang này cài thành ứng dụng được" (beforeinstallprompt) ngay khi trang vừa tải, thường trước khi
// app chạy xong. Giữ lại sự kiện đó ở đây để nút "Cài app" bấm là mở hộp cài luôn (src/lib/install.ts).
addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault()
  window.__installPrompt = e
})
