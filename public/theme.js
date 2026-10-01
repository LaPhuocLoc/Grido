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
