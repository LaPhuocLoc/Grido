# Tiệm Ghép Ảnh — thiết kế bản web

Ngày: 2026-10-02 · Dựa trên mã nguồn bản 1.6.0 (commit d2b2019)

Nguyên lý giữ nguyên từ bản desktop: **ảnh của người dùng không rời khỏi máy họ**. App tham chiếu file gốc tại chỗ,
chỉ tự giữ bản xem trước + thumbnail, và xuất ra file mới. Không upload, không tài khoản, không backend.

---

## 1. Hiện trạng

### 1.1 Thứ đã sẵn sàng cho web (không phải viết lại)

| Phần | Vị trí | Ghi chú |
|---|---|---|
| Xử lý ảnh: giải mã, cắt, Lanczos3, làm nét, MozJPEG (WASM) | `src/lib/imaging/*` | Chạy hoàn toàn trong Web Worker + `OffscreenCanvas`. Electron không đụng tới pixel nào. |
| Bố cục, chữ, khung, undo/redo, thiết kế đã lưu, album | `src/store.ts`, `src/lib/*` | Thuần JS, lưu bằng `localStorage` (khoá `grido-settings`). |
| Giao diện | `src/components/*`, `src/App.tsx` | Đã có sẵn layout cho cửa sổ hẹp (< 1024px): khung ảnh 44dvh + bảng công cụ + thanh tab đáy. |
| Font | `public/fonts`, `src/fonts.generated.css` | `@font-face` riêng từng font, trình duyệt chỉ tải font được dùng. Thumbnail đã `loading="lazy"`. |
| Bundle | `dist/assets` | JS ~350 KB + CSS ~160 KB (chưa nén), WASM 250 KB chỉ nạp khi xuất JPEG. |

### 1.2 Thứ Electron đang làm hộ (phải có bản thay thế trên web)

Toàn bộ nằm sau cầu nối `window.grido` (`shared/types.ts` → `GridoBridge`), 17 hàm:

| Nhóm | Electron | Phụ thuộc OS |
|---|---|---|
| Thư viện | `electron/library.ts`: chỉ mục `index.json`, cache `cache/<id>.thumb|preview`, ảnh dán lưu ở `imports/` | Đường dẫn tuyệt đối, `fs` |
| Phục vụ ảnh | `electron/protocol.ts`: `grido://app/photo/<id>/thumb|preview|original`, `/import/<token>` | Scheme riêng; worker `fetch(url)` |
| Nhập ảnh | Hộp thoại mở file, kéo thả lấy đường dẫn qua `webUtils.getPathForFile`, quét thư mục sâu 4 cấp | Đường dẫn |
| Xuất | Hộp thoại lưu, nhớ thư mục xuất, ghi file, "Mở thư mục" | `dialog`, `shell` |
| Vỏ app | Thanh tiêu đề tự vẽ, khoá zoom trang, chặn điều hướng, một cửa sổ duy nhất, nhớ kích thước cửa sổ | `BrowserWindow` |
| Cập nhật | `electron-updater` qua GitHub Releases, người dùng đồng ý mới tải | Bộ cài |

### 1.3 Số đo liên quan tới hạ tầng

- `public/`: 112 MB, 1.187 file. Trong đó font 107 MB / 630 file woff2:
  tiếng Việt 497 file · 21 MB (TB ~43 KB/file); tiếng Nhật 86 file · 63 MB; tiếng Hàn 47 file · 21 MB (file lớn nhất ~2 MB).
- Thumbnail font: 553 file · 4,4 MB.
- Font Nhật/Hàn là **một file cho cả bộ chữ**, không chia `unicode-range`.
- Tên file font không có hash nội dung.

---

## 2. Quyết định kiến trúc

### 2.1 Một codebase, hai vỏ

Giữ bản Electron (đang có người dùng, đủ 100% tính năng); bản web là đích mới. Cả hai nằm **chung một repo, một `package.json`**:
`npm run build` (desktop) và `npm run build:web`; hai workflow CI riêng (tag `v*` → bộ cài, push `main` → deploy web). Tách lớp nền tảng:

```
src/platform/
  types.ts        interface Platform (thay GridoBridge)
  index.ts        chọn bản cài đặt lúc chạy: window.grido ? electron : web
  electron.ts     bọc window.grido như hiện tại
  web/
    library.ts    IndexedDB + OPFS + file handle
    access.ts     quyền đọc file, cấp lại quyền, nối lại ảnh
    export.ts     showSaveFilePicker / tải về
    updates.ts    kiểm tra version.json
    lock.ts       một tab hoạt động
```

`main.tsx` đã rẽ nhánh theo `window.grido` rồi nạp `App` bằng dynamic import; chỉ cần đổi nhánh "không có cầu nối" thành nạp bản web.

### 2.2 Ba thay đổi ở lõi dùng chung (làm trước, trên Electron, không đổi hành vi)

1. **Worker nhận `Blob` thay vì URL.** `imaging.worker.ts` hiện `fetch(url)`. Đổi request thành `{ source: Blob }`;
   nền tảng cung cấp `openSource(id, kind): Promise<Blob>`. Electron: `fetch('grido://…').blob()`. Web: `handle.getFile()` / file OPFS.
   `File` truyền sang worker không sao chép dữ liệu.
2. **URL ảnh thành bất đồng bộ.** `thumbUrl/fileUrl` đang trả chuỗi cố định (6 chỗ dùng: `Library`, `Stage`, `Designs`).
   Đổi thành hook `usePhotoUrl(id, kind)`. Electron trả ngay chuỗi `grido://`; web trả blob URL tạo từ file OPFS (có bộ nhớ đệm + thu hồi theo LRU).
3. **`Photo.missing: boolean` → `Photo.access: 'ok' | 'locked' | 'missing'`** và bỏ `Photo.path` khỏi giao diện
   (chỉ dùng ở tooltip tên file, `Library.tsx:112`) thay bằng `fileName`.

Không dùng service worker để giả lập `grido://`: hard-reload (Ctrl+Shift+R) bỏ qua service worker, khi đó mọi ảnh sẽ hỏng. Blob URL không phụ thuộc gì.

### 2.3 Lưu trữ trên web

| Dữ liệu | Nơi lưu | Lý do |
|---|---|---|
| Cài đặt, bản nháp, thiết kế, album, bố cục đã lưu | `localStorage` (giữ nguyên khoá `grido-settings`) | Không phải đổi store; `theme.js` đọc đồng bộ trước khi vẽ. Thêm cảnh báo khi ghi thất bại (hiện đang nuốt lỗi, `store.ts:235`). |
| Chỉ mục thư viện + file handle + handle thư mục gốc | IndexedDB | Chỉ IndexedDB lưu được `FileSystemHandle`. |
| Thumbnail, bản xem trước, ảnh dán từ clipboard | OPFS (`/cache`, `/imports`) | File thật trên đĩa, tạo blob URL không tốn RAM. |
| File gốc | **Không lưu.** Đọc tại chỗ qua handle. | Nguyên lý của app. |

Gọi `navigator.storage.persist()` sau lần nhập ảnh đầu tiên. Mục Cài đặt hiện dung lượng đang dùng và nút dọn cache.

### 2.4 Mô hình truy cập file gốc: một mô hình, hai mức

Mỗi ảnh ở một trong ba trạng thái:

- `ok`: đọc được file gốc → xuất từ file gốc.
- `locked`: có trong thư viện, có bản xem trước, nhưng phiên này chưa có quyền đọc file gốc.
- `missing`: file gốc đã bị dời/xoá.

`locked` và `missing` đều xuất bằng bản xem trước 2560px, kèm cảnh báo ở bảng Xuất (logic này đã có cho `missing`, `Panels.tsx:573`).

**Mức A — Chrome/Edge desktop (File System Access API):**
- Nút "Thêm ảnh" (`showOpenFilePicker`) và "Thêm thư mục" (`showDirectoryPicker`); kéo thả lấy handle qua `getAsFileSystemHandle()`.
- Handle lưu IndexedDB. Mở lại app: `queryPermission()`; nếu chưa được cấp → ảnh `locked` + một dải thông báo "Cho phép đọc ảnh gốc" (một lần bấm, `requestPermission()` theo từng thư mục gốc).
- Khuyến khích nhập theo thư mục: một handle, một lần cấp quyền cho cả nghìn ảnh.
- Trùng ảnh: cùng thư mục gốc thì so đường dẫn tương đối; file lẻ thì so tên + dung lượng + ngày sửa, rồi `isSameEntry()` để chắc.

**Mức B — Safari, Firefox, mobile (không có File System Access) — ĐÃ HOÃN (xem mục 8):**
Bản đầu chỉ hỗ trợ mức A. Trình duyệt không có `showOpenFilePicker` (dò theo tính năng, không theo user agent) nhận màn hình
"Hãy mở bằng Chrome hoặc Edge trên máy tính". Phần dưới đây và mọi chỗ nhắc "mức B" trong tài liệu là thiết kế để dành.
- Nhập bằng `<input type="file" multiple>` / `webkitdirectory` / kéo thả → `File` chỉ sống trong phiên.
- Sau khi tải lại trang, ảnh thành `locked`. Nút "Chọn lại ảnh gốc": người dùng chọn lại file/thư mục, app khớp theo tên + dung lượng + ngày sửa.
- **Không** sao chép file gốc vào bộ nhớ trình duyệt (tránh nhân đôi dung lượng và chạm hạn mức).
- Xuất bằng tải về (thư mục Downloads).

Hai mức dùng chung một giao diện trạng thái; khác nhau chỉ ở cách đưa ảnh từ `locked` về `ok`.

### 2.5 Xuất ảnh

- Mức A: `showSaveFilePicker({ id: 'export', suggestedName })` gọi **trước** khi dựng ảnh (như hiện tại, để còn user activation), rồi `createWritable()` → ghi → `close()`. Trình duyệt tự nhớ thư mục theo `id`.
- Mức B: dựng xong → blob → `<a download>`.
- "Mở thư mục" sau khi xuất: bỏ trên web (không có API). Toast chỉ báo tên file.
- Giới hạn khung: `MAX_CANVAS = 10000` giữ cho Chrome/Edge. Trình duyệt khác: thử tạo canvas lúc khởi động, hạ trần theo kết quả.
- Hồ sơ màu sRGB: `encode.ts` đang lấy ICC từ JPEG do Chromium mã hoá. Engine khác không nhúng ICC → đóng gói sẵn một hồ sơ sRGB làm hằng số.
- WebP: Safari không mã hoá WebP qua canvas (trả PNG). Dò lúc khởi động, ẩn lựa chọn WebP nếu không hỗ trợ.

### 2.6 Font

- Lưu cùng app trên hosting tĩnh; không cần storage riêng.
- `build-fonts.py` thêm `?v=<hash nội dung>` vào URL trong `fonts.generated.css` → đặt cache `immutable` an toàn.
- Rê chuột để tải trước font (`FontPicker.tsx:9`): giữ cho font Việt (~43 KB), **tắt cho font Nhật/Hàn** (0,5–2 MB/file); nhóm này chỉ tải khi bấm chọn, có vòng xoay chờ.
- Xuất ảnh: `drawText` hiện nuốt lỗi tải font (`text.ts:264`). Trên web phải kiểm `document.fonts.check()` sau khi tải; thiếu font thì **dừng xuất và báo**, không âm thầm vẽ font dự phòng.
- Font cài trên máy (`queryLocalFonts`): chỉ mức A, đã có xử lý khi không hỗ trợ.
- Giấy phép: bản web đưa lên **toàn bộ** font (quyết định của chủ dự án, mục 8). Vẫn thêm cờ `web: false` trong manifest `fontvn/*.json`
  để gỡ nhanh một font khỏi bản web khi tác giả yêu cầu, không phải sửa code.

### 2.7 Vỏ app trên web

| Desktop | Web |
|---|---|
| Thanh tiêu đề kéo được, chừa 150px cho nút cửa sổ | Cùng thanh đó, bỏ phần chừa chỗ (`data-platform="web"`). Khi cài dạng PWA thì `env(titlebar-area-*)` trong CSS sẵn có tự hoạt động. |
| Một cửa sổ (`requestSingleInstanceLock`) | Web Locks: tab thứ hai hiện "Đang mở ở tab khác — Dùng ở đây"; bấm thì tab cũ nhường và ngừng ghi. |
| Cập nhật tuỳ chọn | Tái dùng nguyên giao diện "Có bản mới": 4 giờ/lần đọc `/version.json`; khác bản đang chạy → hiện nút, bấm thì tải lại trang. Lỗi nạp chunk sau khi deploy (`vite:preloadError`) → cũng mời tải lại. |
| "Mở thư mục dữ liệu" | "Dung lượng & dữ liệu": xem dung lượng, dọn cache, sao lưu / khôi phục (file .json gồm thiết kế, album, cài đặt). |
| Khoá zoom trang, chặn điều hướng | `beforeunload` khi đang nhập/xuất; `translate="no"`; `spellcheck=false` + tắt Grammarly trên vùng gõ chữ. Ctrl+cuộn trong khung làm việc đã tự chặn (`Stage.tsx:301`). |
| Nhớ kích thước cửa sổ | Bỏ. |

---

## 3. Stack và hạ tầng

**Giữ nguyên:** Vite 8, React 19, TypeScript, Zustand, Tailwind 4, Vitest, `@jsquash/jpeg`. Không cần Next.js hay framework SSR: đây là SPA công cụ, không có nội dung động phía server.

**Thêm:**
- `idb` (bọc IndexedDB, ~1 KB) cho chỉ mục thư viện.
- `fake-indexeddb` cho test đơn vị lớp `platform/web`.
- Playwright cho test đầu-cuối trên Chromium / WebKit / Firefox. Hộp thoại chọn file không tự động hoá được → giả `showOpenFilePicker` bằng handle OPFS (cùng kiểu `FileSystemFileHandle`).
- Giai đoạn PWA: `vite-plugin-pwa` (chỉ cache vỏ app; font cache theo lần dùng, không precache 107 MB).

**Hosting: Cloudflare (Workers static assets / Pages).**
- Không tính phí băng thông, quan trọng vì font là phần nặng nhất. Giới hạn 20.000 file và 25 MiB/file; app hiện ~1.200 file, file lớn nhất ~2 MB.
- File `_headers`:
  - `/index.html`, `/version.json`: `no-cache`.
  - `/assets/*`, `/fonts/*`: `public, max-age=31536000, immutable`.
  - CSP như bản desktop (`protocol.ts:30`), giữ `connect-src 'self'`: trình duyệt tự chặn mọi kết nối ra ngoài, là bằng chứng kỹ thuật cho cam kết "không upload".
- Tên miền riêng ngay từ đầu. Dữ liệu người dùng gắn với origin: đổi tên miền là mất thư viện. Không dùng `*.pages.dev` làm địa chỉ chính thức.

**CI/CD (GitHub Actions):**
- Push `main` → `npm test` → `vite build` (bản web) → deploy. Nhánh khác → bản xem thử (origin riêng, dữ liệu riêng).
- `release.yml` hiện tại (tag `v*` → bộ cài desktop) giữ nguyên.

**Không có ở v1:** backend, database, tài khoản, analytics, dịch vụ báo lỗi bên thứ ba.

---

## 4. Layout

Không thiết kế lại. Thay đổi cụ thể:

1. Thanh tiêu đề: bỏ vùng kéo cửa sổ và phần chừa chỗ nút hệ điều hành; menu ⚙ đổi "Kiểm tra cập nhật / Mở thư mục dữ liệu" thành "Dung lượng & dữ liệu / Giới thiệu & quyền riêng tư".
2. Thư viện: thêm nút "Thêm thư mục"; dải trạng thái khi có ảnh `locked` ("12 ảnh cần cấp lại quyền đọc — Cho phép"); nhãn trên thumbnail phân biệt `locked` và `missing`; bỏ mục "Mở thư mục chứa ảnh" trong menu chuột phải.
3. Bảng Xuất: dòng "N ảnh sẽ xuất từ bản xem trước" kèm nút cấp quyền / chọn lại ảnh gốc.
4. Lần đầu mở: màn hình trống của thư viện kiêm lời giới thiệu ("Ảnh nằm nguyên trên máy bạn, không tải lên đâu cả").
5. Trình duyệt không đạt yêu cầu tối thiểu (không có `OffscreenCanvas` trong worker): màn hình báo rõ, không để app chạy rồi lỗi.
6. Layout hẹp (< 1024px) đã có; chỉ bật chính thức cho mobile ở giai đoạn 5.

---

## 5. Case thường và edge case

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Mở lại app sau khi tắt trình duyệt | Thumbnail/bản xem trước hiện ngay từ OPFS. Ảnh `locked` cho tới khi bấm "Cho phép". Vẫn dàn trang và xuất (bản xem trước) được. |
| 2 | Người dùng từ chối cấp quyền | Giữ `locked`, không hỏi lại tự động; nút vẫn ở đó. |
| 3 | File gốc bị đổi tên / dời / xoá | `getFile()` ném `NotFoundError` → `missing`, như desktop. |
| 4 | File gốc bị sửa sau khi nhập | So `lastModified` + `size` khi có quyền đọc; lệch thì dựng lại bản xem trước ở nền. |
| 5 | Chọn cả thư mục Desktop / Documents / Downloads | Chrome chặn cấp quyền nguyên các thư mục này. Bắt lỗi, hướng dẫn chọn thư mục con hoặc chọn file. |
| 6 | Nhập trùng ảnh | Mục 2.4. Báo "N ảnh đã có sẵn" như hiện tại. |
| 7 | Dán ảnh từ clipboard | Lưu bản gốc vào OPFS `/imports` (ảnh do app quản lý, xoá cùng lúc với ảnh), như desktop. |
| 8 | Kéo thả thư mục | Mức A: handle thư mục, quét sâu 4 cấp. Mức B: `webkitGetAsEntry()`. |
| 9 | Hai tab cùng mở | Mục 2.7, khoá một tab. |
| 10 | Tab cũ sau khi deploy bản mới | Nút "Có bản mới"; lỗi nạp chunk → mời tải lại. `persist` thêm `version` + `migrate`; IndexedDB nâng cấp theo `onupgradeneeded`. |
| 11 | Xuất khi mạng rớt, font chưa tải | Dừng, báo tên font thiếu. Không xuất sai font. |
| 12 | Xuất ảnh rất lớn (tới 10000px) | Trần canvas theo trình duyệt (mục 2.5). MozJPEG hết bộ nhớ → đã có đường lùi về bộ mã hoá sẵn có (`encode.ts`). |
| 13 | File 45–60 MP | Số worker theo sức máy (`poolSize` trong `tasks.ts`): `deviceMemory ≤ 4` → 1; dưới 8 GB → tối đa 3; từ 8 GB → tối đa 6; từ 16 GB → tối đa 8, luôn chừa hai nhân. |
| 14 | Đóng tab / tải lại khi đang xuất hoặc nhập | `beforeunload` cảnh báo. Bản nháp đã tự lưu (ghi trễ 400ms + ghi ngay ở `pagehide`). |
| 15 | Chuyển tab khi đang xuất | Việc nặng nằm trong worker nên ít bị bóp; thanh tiến độ có thể cập nhật chậm. Chấp nhận. |
| 16 | Hết hạn mức lưu trữ | Bắt `QuotaExceededError` khi ghi OPFS/localStorage → báo và mở mục dọn cache. |
| 17 | Chế độ ẩn danh | Chạy được, mọi thứ mất khi đóng cửa sổ. Hiện một dòng nhắc. |
| 18 | Trình duyệt tự dọn dữ liệu (Safari, đĩa đầy) | `storage.persist()` giảm rủi ro; sao lưu .json là đường cứu. Thư viện mất thì thiết kế tự bỏ ảnh không còn (logic `pruneDesigns` đã có). |
| 19 | Extension / dịch tự động chèn vào DOM | Mục 2.7. |
| 20 | Thiết kế dùng font cài trên máy, mở ở trình duyệt khác | Rơi về sans-serif, như desktop khi đổi máy. |
| 21 | Ảnh HEIC | Chưa hỗ trợ ở cả hai bản (không có trong `IMAGE_TYPES`). Ngoài phạm vi. |
| 22 | Người dùng desktop muốn chuyển sang web | Không tự chuyển được (khác origin, desktop lưu theo đường dẫn). Nhập lại thư mục ảnh; thiết kế chuyển qua file sao lưu ở giai đoạn 4. |

---

## 6. Performance

| Hạng mục | Chrome/Edge | Ghi chú |
|---|---|---|
| Dàn trang, kéo thả, zoom | Bằng desktop | Cùng engine Chromium. |
| Nhập ảnh, xuất ảnh | Bằng desktop | Cùng worker, cùng WASM. Đọc file qua handle không chậm hơn `grido://`. |
| Cuộn thư viện vài nghìn ảnh | Cần đo | Blob URL tạo lười theo vùng nhìn thấy, LRU ~500 URL. Desktop dựa vào HTTP cache `immutable`. |
| Mở app lần đầu | Chậm hơn desktop | Tải ~0,5 MB qua mạng; sau đó dùng cache. |
| Chọn font Việt | Gần như tức thì | ~43 KB/file. |
| Chọn font Nhật/Hàn | 0,5–2 MB mỗi font | Tải khi bấm, có chỉ báo. Nếu thành vấn đề: chia `unicode-range` ở `build-fonts.py`. |
| Safari / Firefox | Cần đo | Engine khác; giới hạn canvas và bộ nhớ chặt hơn. |

Ngưỡng chấp nhận trước khi phát hành mức A: nhập 200 ảnh 24 MP và xuất khung 4672×7008 không chậm hơn bản desktop quá 10% trên cùng máy.

---

## 7. Lộ trình

| GĐ | Nội dung | Kết quả kiểm chứng |
|---|---|---|
| 0 | Chốt tên miền; rà giấy phép font, gắn cờ `web` | Danh sách font được phép |
| 1 | Tách `src/platform`; worker nhận `Blob`; `usePhotoUrl`; `Photo.access`. Chỉ chạy trên Electron. | 17 file test hiện có vẫn qua; bản desktop không đổi hành vi |
| 2 | Bản web mức A: IndexedDB + OPFS + handle, cấp lại quyền, xuất qua save picker, khoá một tab, `version.json`, deploy bản xem thử | Playwright trên Chromium; đo theo ngưỡng mục 6 |
| 3 | PWA (cài được, offline vỏ app), sao lưu / khôi phục, trang giới thiệu & quyền riêng tư | Cài thử trên Windows + macOS |
| hoãn | Mức B (Safari / Firefox) và mobile | Xét lại khi bản Chrome/Edge đã ổn định |

Giai đoạn 1 là phần rủi ro thấp nhưng quyết định chất lượng: sau nó, bản web chỉ còn là viết một bản cài đặt `Platform` mới.

---

## 8. Quyết định của chủ dự án (2026-10-02)

1. **Tên miền:** dữ liệu người dùng gắn với origin; `*.netlify.app` và tên miền mua là hai origin khác nhau, chuyển giữa chúng là mất
   thư viện. Phải có tên miền mua **trước khi công bố**; địa chỉ `*.netlify.app` / `*.pages.dev` chỉ dùng để thử. Còn mở: tên miền cụ thể.
2. **Font:** đưa toàn bộ font lên web. Rủi ro đã nêu: giấy phép "personal use" thường không bao gồm quyền phân phối lại file font;
   giữ cờ `web: false` để gỡ nhanh khi có yêu cầu.
3. **Trình duyệt:** chỉ Chrome/Edge desktop. Safari, Firefox, mobile nhận màn hình hướng dẫn dùng Chrome. Mức B hoãn.
4. **Repo:** chung một repo với bản Electron.

---

## 9. Tình trạng thực hiện (cập nhật 2026-10-02)

Đã làm và đang chạy tại https://tiemghepanh.io.vn (Netlify, không phải Cloudflare như mục 3 đề xuất ban đầu):

- Lớp nền tảng `src/platform` (Electron + web), thư viện web bằng file handle + IndexedDB + OPFS.
- Trạng thái ảnh khoá / mất file, cấp lại quyền, nối lại ảnh bị dời chỗ, tự dựng lại bản xem trước khi file gốc đổi.
- Sao lưu / khôi phục, xem dung lượng, dọn file thừa, trang Giới thiệu & quyền riêng tư.
- PWA (cài được, mở được khi mất mạng), font có hash trong địa chỉ, kiểm tra bản mới qua `version.json`.
- Khoá một tab, cảnh báo khi đóng tab giữa chừng, đánh số phiên bản dữ liệu lưu, một worker cho máy ít RAM.
- CI tự deploy khi push `main`; `npm run test:e2e:web` chạy Chrome thật với file thật.

Khác với thiết kế ban đầu:

- `Photo.missing` + `Photo.locked` thay cho trường `access` ba giá trị (ít phải sửa code hiện có hơn).
- Địa chỉ ảnh không cần tạo lười theo vùng nhìn hay LRU: đo với 1500 ảnh thì mở lại trang ~1 giây, cuộn không rớt khung hình.
- Test đầu-cuối dùng CDP trực tiếp thay cho Playwright (không thêm phụ thuộc).

Số đo (Chrome, 1500 ảnh 640×480): nhập 25 giây (~60 ảnh/giây) sau khi giới hạn số ô giữ chỗ và gom ảnh theo đợt (trước đó 110 giây);
mở lại trang hiện đủ ô ảnh sau ~0,3 giây và đủ thumbnail sau ~1 giây.

Chưa làm, có chủ ý:

- Mức B (Safari / Firefox) và mobile: hoãn theo quyết định ở mục 8. Kéo theo: hồ sơ màu sRGB dạng hằng số, dò WebP và trần canvas
  theo trình duyệt (chỉ cần cho các engine đó).
- Nhắc khi đang ở chế độ ẩn danh: trình duyệt không cho trang biết chắc điều này; thay bằng dòng cảnh báo trong "Dữ liệu & sao lưu".
- Bấm vào hộp hỏi quyền của Chrome: không tự động hoá được, phải thử tay. Đã kiểm trên Chrome thật (hồ sơ sạch): sau khi tải lại
  trang ảnh chuyển sang khoá, bấm "Cho phép" thì `requestPermission()` chờ người dùng trả lời, tức là hộp hỏi có hiện.

So với bản desktop (2026-10-02, máy 20 nhân / 32 GB, Chrome 154, 200 ảnh Sony 33 MP 4672×7008, xuất khung 7008×4672 JPEG 95):

| | Desktop, 3 worker | Web, 3 worker | Web, 8 worker (hiện tại) |
|---|---|---|---|
| Nhập 200 ảnh | 98,3 s | 98,2 s | 57,0 s |
| Xuất 1 ảnh (dựng + mã hoá) | 5,4 s | 5,2 s | 5,2 s |
| Xuất 4 ảnh | 5,9 s | 5,8 s | 4,5 s |
| Xuất 9 ảnh | 6,8 s | 6,7 s | 5,5 s |

Hai bản chạy cùng một mã xử lý ảnh nên ngang nhau (đạt ngưỡng 10% ở mục 6); file xuất giống nhau từng byte trước và sau khi tăng số
worker. Một lần nhập mất khoảng 1,45 giây mỗi ảnh trên một worker: giải mã 0,2 s, đọc pixel 0,3 s, thu nhỏ Lanczos 0,9 s.
Lưu ý: khi tab bị trình duyệt coi là chạy nền thì mọi thứ chậm đi gần gấp đôi (đo được 183 s cho cùng 200 ảnh với 3 worker).
