# Tiệm Ghép Ảnh

Ứng dụng desktop (Windows, macOS, Linux) ghép ảnh nhiều bố cục cho photographer: thêm ảnh từ máy vào thư viện, chọn ảnh, chọn cỡ (Instagram, Story/Reels/TikTok, Facebook…), chọn bố cục, đóng khung thông số máy ảnh, tinh chỉnh rồi xuất ra file với chất lượng cao nhất có thể.

Không cần tài khoản, không cần mạng: ảnh được dùng ngay tại chỗ trên ổ đĩa, không sao chép và không tải đi đâu cả.

## Cài đặt (người dùng)

Tải bộ cài ở trang Releases của repo rồi chạy:

| Hệ điều hành | File |
| --- | --- |
| Windows | `TiemGhepAnh-Setup-<phiên bản>.exe` (cài cho riêng người dùng, không cần quyền admin) |
| macOS | `TiemGhepAnh-<phiên bản>-mac-<arm64 hoặc x64>.dmg` |
| Linux | `TiemGhepAnh-<phiên bản>-linux-x86_64.AppImage` |

**Tự cập nhật**: app tự kiểm tra bản mới khi mở (và mỗi 4 giờ), tải về ở nền rồi hiện nút **Khởi động lại để cập nhật** trên thanh tiêu đề. Không bấm cũng được: bản mới tự cài khi thoát app. Thư viện và cài đặt nằm riêng trong thư mục dữ liệu của hệ điều hành nên không mất khi cập nhật.

> Bản chưa ký số: Windows SmartScreen / macOS Gatekeeper sẽ cảnh báo lần đầu chạy, và **macOS không tự cập nhật được** (macOS chỉ cho app đã ký tự thay thế chính nó). Xem mục Ký số bên dưới.

## Stack

| Phần | Công nghệ |
| --- | --- |
| Vỏ desktop | Electron (main process + preload, `electron/`) |
| Giao diện | React 19 + TypeScript + Vite + Tailwind v4 + zustand (`src/`) |
| Xử lý ảnh | Web Worker: bicubic Catmull-Rom (như Lightroom), làm nét đầu ra, MozJPEG (WebAssembly) |
| Thư viện ảnh | File trên đĩa + `index.json` trong thư mục dữ liệu của app |
| Đóng gói | electron-builder → NSIS (Windows), dmg + zip (macOS), AppImage (Linux) |
| Cập nhật | electron-updater + GitHub Releases |
| Test | Vitest (`tests/`) |

## Phát triển

```bash
npm install
npm run dev
```

`npm run dev` chạy Vite (có HMR) và mở cửa sổ Electron trỏ vào đó. F12 mở DevTools.

```bash
npm test            # chạy bộ test
npm run typecheck   # kiểm tra kiểu cả giao diện, main process và test
npm run build       # build giao diện (dist/) + main process (dist-electron/)
npm start           # chạy bản đã build
npm run dist        # đóng gói bộ cài vào release/
```

`npm run dist` chỉ đóng gói được cho hệ điều hành đang chạy. Bản cho cả ba hệ điều hành do GitHub Actions build.

### Test

| File | Phạm vi |
| --- | --- |
| `tests/layout.test.ts` | DSL bố cục, tính toạ độ ô, kéo đường chia, toàn bộ bố cục có sẵn không hở / không chồng |
| `tests/geometry.test.ts`, `tests/imaging.test.ts` | Đặt ảnh trong ô, vùng cắt khi xuất, làm nét, hồ sơ màu JPEG / PNG |
| `tests/resample.test.ts` | Resize: giữ màu phẳng, trộn trong gamma sRGB như Lightroom, không lem màu qua vùng trong suốt |
| `tests/store.test.ts`, `tests/export.test.ts` | Chọn ảnh, undo / redo, nhập ảnh, lưu nháp, luồng xuất file |
| `tests/library.test.ts` | Thư viện trên đĩa thật (thư mục tạm): nhập, gỡ, file gốc mất, file chỉ mục hỏng |
| `tests/updates.test.ts` | Các trạng thái tự cập nhật |

Giao diện, hộp thoại của hệ điều hành và chất lượng ảnh thật được kiểm tra bằng cách chạy app (`node scripts/dev.mjs --remote-debugging-port=9333` rồi điều khiển qua CDP).

## Phát hành bản mới

1. Tăng `version` trong `package.json`, commit.
2. `git tag v<version>` rồi `git push --tags`.
3. Workflow `.github/workflows/release.yml` chạy test, build bộ cài cho Windows / macOS / Linux và gắn vào GitHub Release cùng các file `latest*.yml`.

App ở máy người dùng đọc `latest*.yml` của Release mới nhất để biết có bản mới. Repo phát hành khai báo ở `build.publish` trong `package.json` và **phải công khai**.

## Ký số

Workflow tự ký khi repo có các secret dưới đây; không có thì vẫn build, chỉ là không ký.

| Nền tảng | Cần có | Secret |
| --- | --- | --- |
| Windows | Chứng chỉ code signing (OV / EV) dạng `.pfx` | `WIN_CSC_LINK` (file .pfx mã hoá base64), `WIN_CSC_KEY_PASSWORD` |
| macOS | Tài khoản Apple Developer + chứng chỉ *Developer ID Application* (`.p12`) | `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, và `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` để notarize |

Chứng chỉ Windows hiện nay thường nằm trên token cứng / HSM đám mây chứ không xuất được `.pfx`; khi đó cấu hình `win.azureSignOptions` (Azure Trusted Signing) hoặc `win.signtoolOptions.sign` (lệnh ký riêng của nhà cung cấp) trong `package.json` thay cho hai secret trên.

## Dữ liệu trên máy

App từng tên là Grido. Thư mục dữ liệu, `appId`, scheme `grido://` và khoá localStorage vẫn giữ tên cũ để người dùng cập nhật lên không mất thư viện và thiết kế.

| Hệ điều hành | Thư mục dữ liệu |
| --- | --- |
| Windows | `%APPDATA%\Grido` |
| macOS | `~/Library/Application Support/Grido` |
| Linux | `~/.config/Grido` |

- `library/index.json` – danh sách ảnh trong thư viện (đường dẫn file gốc + kích thước).
- `library/cache/` – bản xem trước 2560px và thumbnail của từng ảnh.
- `library/imports/` – ảnh dán từ clipboard (không có file gốc trên đĩa nên app tự giữ một bản).
- Cài đặt, bản nháp đang ghép, bố cục đã lưu nằm trong localStorage của cửa sổ app.

Gỡ một ảnh khỏi thư viện chỉ xoá bản xem trước + thumbnail; **file gốc của người dùng không bao giờ bị đụng tới**. Nếu file gốc bị di chuyển hay xoá, ảnh hiện dấu cảnh báo và xuất bằng bản xem trước.

## Kiến trúc

```
electron/main.ts       Cửa sổ, IPC, hộp thoại mở / lưu file
electron/library.ts    Thư viện ảnh trên đĩa
electron/protocol.ts   Scheme grido://app/… phục vụ giao diện và ảnh
electron/updates.ts    Tự cập nhật (electron-updater)
electron/preload.ts    Cầu nối window.grido (contextBridge)
shared/types.ts        Kiểu dữ liệu dùng chung main ↔ giao diện
src/lib/desktop.ts     Phía giao diện của cầu nối + URL ảnh
src/lib/imaging/       Worker xử lý ảnh: resize bicubic, làm nét, MozJPEG, tạo bản xem trước, xuất ảnh ghép
src/lib/layout/        Layout engine: DSL, tính toạ độ, generators, registry
src/components/        UI
src/store.ts           State toàn app (zustand)
tests/                 Bộ test (Vitest)
```

- Giao diện chạy trong renderer bị sandbox (`contextIsolation`, không có Node). Mọi thao tác với ổ đĩa đi qua `window.grido` → IPC → main process.
- Giao diện và ảnh cùng được phục vụ từ `grido://app/…` nên `fetch`, Web Worker, canvas chạy như trên web mà không cần máy chủ: `/photo/<id>/thumb|preview|original`.
- Cửa sổ không dùng khung mặc định: thanh trên cùng của giao diện là thanh tiêu đề (kéo để di chuyển), hệ điều hành vẽ cụm nút thu nhỏ / phóng to / đóng lên trên.
- Font được đóng gói kèm (`@fontsource/*`) nên app chạy hoàn toàn offline.

## Phím tắt

| Phím | Tác dụng |
| --- | --- |
| Ctrl/⌘ + O | Thêm ảnh |
| Ctrl/⌘ + V | Dán ảnh từ clipboard vào thư viện |
| Ctrl/⌘ + E hoặc S | Xuất ảnh ghép |
| Ctrl/⌘ + Z / Shift+Z / Y | Hoàn tác / làm lại |
| Delete | Xoá chữ đang chọn |
| Esc | Bỏ chọn ô / chữ |

## Chất lượng ảnh

- **Resize**: bicubic Catmull-Rom tự viết (`src/lib/imaging/resample.ts`), trộn trên giá trị sRGB như Lightroom / Photoshop, alpha nhân trước. Không dùng `drawImage` để scale ở bất kỳ bước nào. Cách resize và làm nét được dò cho khớp bản xuất của Lightroom trên ~30 cặp ảnh thật.
- **Thêm ảnh**: file gốc không bị sao chép, resize hay nén lại. App chỉ tạo một bản xem trước cạnh dài 2560px (JPEG q92) để dàn trang cho mượt, và một thumbnail cho thư viện. Ảnh vốn nhỏ hơn 2560px và nhẹ hơn 5MB thì dùng nguyên byte gốc làm bản xem trước.
- **Xuất**: mỗi ô được cắt từ **file gốc trên đĩa** ở độ phân giải gốc rồi resize **một lần duy nhất** về đúng kích thước pixel của ô; ghép lên canvas ở toạ độ nguyên nên không có nội suy lần hai. Khung lệch tỉ lệ dưới 1px (ảnh 3:2 vào 2048×1365) thì co giãn vừa khít như Lightroom, không cắt mất hàng ảnh gốc. Hệ số 1×–3×.
- **Làm nét đầu ra** (`sharpen.ts`): unsharp mask σ 0.6px sau khi thu nhỏ, mạnh nhẹ theo độ sáng (vùng tối và gần trắng gần như không làm nét) như Output Sharpening: Screen của Lightroom. 4 mức Tắt / Thấp / Tiêu chuẩn / Cao, mặc định Tắt (giống Lightroom không bật Output Sharpening); quầng sáng ở mép rất gắt được hãm như Lightroom; **Cao khớp Screen · High**, Thấp / Tiêu chuẩn là ước lượng cho Low / Standard. Không áp dụng cho ô bị phóng to hoặc giữ nguyên cỡ; ảnh đã xuất (cạnh dài ≤ 3000px, vd. file 2048px từ Lightroom) chỉ được làm nét thêm một phần để không bị làm nét hai lần. Đo đạc: `docs/superpowers/specs/2026-10-03-chat-luong-xuat-anh.md`.
- **Không lặng lẽ hạ chất lượng**: ô nào phải dựng từ bản xem trước (không đọc được file gốc) hoặc JPEG phải rơi về 4:2:0 (hết bộ nhớ) thì báo ngay sau khi xuất.
- **JPEG**: mặc định 100%, mã hoá bằng MozJPEG với màu **4:4:4** (bộ mã hoá có sẵn của Chromium luôn dùng 4:2:0, làm nhoè mép màu bão hoà) và gắn hồ sơ màu sRGB. **PNG** được gắn nhãn sRGB.
- **EXIF như Lightroom "All Metadata"**: lúc nhập, app đọc EXIF (máy, ống kính, thông số, giờ chụp, GPS, giả lập phim Fuji
  từ MakerNote) và giữ cùng ảnh trong thư viện; ảnh nhập từ bản cũ được đọc bù ở nền. Xuất một ảnh thì file mang EXIF của
  ảnh đó, làm sạch như Lightroom (bỏ MakerNote, thumbnail nhúng, cờ xoay; ghi kích thước mới, sRGB); ảnh ghép nhiều ảnh
  chỉ ghi kích thước, giờ xuất, không gian màu. Không chép XMP (thông số chỉnh của Lightroom). Code: `src/lib/imaging/exif.ts`.
- **Bản web lưu ảnh xuất vào một thư mục chọn một lần** (trình duyệt không mở được trình quản lý file, nên phần Xuất luôn
  ghi rõ thư mục đó và file vừa xuất, có nút xem lại). Xuất một ảnh thì file mang tên ảnh, trùng tên thì thêm "(2)".
  Quyền đọc ảnh gốc / ghi thư mục chỉ được hỏi lúc bấm Xuất, bằng một hộp nhắc chọn "Cho phép mỗi lần truy cập".
- **Hai kiểu chọn ảnh trong thư viện**: bấm vào ảnh là đưa ảnh vào bản ghép (bấm lần nữa để bỏ ra, tối đa 10 ảnh, ảnh trong bản ghép có viền và số thứ tự); nút "Chọn" hoặc quét chuột là vào chế độ "Chọn" (mỗi ảnh hiện một dấu tích tròn ở góc), chọn bao nhiêu ảnh cũng được để xoá, chuyển album hoặc ghép (thanh nổi ở đáy thư viện). Mở riêng một ảnh: menu chuột phải.
- **Menu chuột phải trên khung** (`onFrameMenu` trong `src/components/Stage.tsx`, menu dùng chung ở `src/components/Menu.tsx`): chuột phải vào ảnh, ô trống hay dòng chữ là chọn luôn thành phần đó rồi mở menu tại con trỏ. Ảnh: đổi ảnh khác, xoay, lật, đặt lại, bỏ khỏi bản ghép. Ô trống: chọn ảnh, bỏ ô. Chữ: sửa chữ, nhân bản, gộp / bỏ nhóm, đưa lên trên cùng / xuống dưới cùng (`arrangeTexts`, thứ tự trong mảng `texts` là thứ tự vẽ), xoá. Đang gõ chữ thì giữ menu của trình duyệt.
- **Chọn bố cục trước, đưa ảnh vào sau**: mục Bố cục có hàng chọn số ảnh (1–12) dùng được cả khi chưa có ảnh. Bố cục nhiều ô hơn số ảnh thì các ô còn lại là ô trống (`selected` trong store là mảng theo ô, `null` = ô trống); bấm một ảnh trong thư viện là ảnh vào ô trống kế tiếp, bấm một ô trống trước thì ảnh vào đúng ô đó. Bố cục ít ô hơn thì ảnh thừa rời khung (hoàn tác được). Bỏ một ảnh là bỏ luôn ô của nó. Xuất khi còn ô trống: ô đó ra màu nền, bảng xuất có dòng nhắc. Kéo một ảnh từ thư viện thả vào khung thì ảnh vào đúng ô nằm dưới con trỏ (ô có ảnh thì thay ảnh, ảnh đã ở ô khác thì hai ô đổi chỗ; dò ô ở `src/lib/stageDrop.ts`).
- **Chiều ảnh ngay trong mục Bố cục**: bố cục chỉ chia ô, dọc hay ngang là do cỡ ảnh, mà cỡ mặc định theo ảnh đầu tiên. Công tắc Dọc / Vuông / Ngang đầu mục Bố cục đổi chiều tại chỗ, giữ nguyên độ phân giải (`orientCanvas` trong `src/lib/presets.ts`); muốn cỡ cụ thể thì bấm "Cỡ khác" sang mục Cỡ.
- **Khung thông số** (mục Khung, `src/lib/frames/`): thiết kế có đúng một ảnh thì chọn được một mẫu khung in tên máy, ống kính, thông số chụp, giả lập phim… đọc từ EXIF (`info.ts`; người dùng gõ đè được từng mục ở "Sửa thông tin", chữ gõ chỉ áp dụng cho đúng ảnh đó). Mẫu là dữ liệu (`templates.ts`): lề theo % cạnh ngắn của ảnh và vài dòng chữ có chỗ điền, nên một mẫu dùng cho ảnh dọc, ngang, vuông mà không cần bản riêng cho từng chiều; chữ dài quá thì cả dải tự thu lại. Màu khung là màu nền của thiết kế, chữ tự đen / trắng theo đó hoặc theo lựa chọn "Màu chữ". Tên hãng không dùng file logo mà được viết theo cách của hãng (`wordmark.ts`: kiểu chữ, độ đậm, màu, chữ I hai màu của FUJIFILM). Có mẫu lấy chính ảnh làm mờ làm nền, mẫu có tấm nền ôm quanh ảnh, mẫu mép phim có hạt và vệt loá. Cỡ "Ảnh gốc" thì file xuất nở thêm phần lề, ảnh giữ nguyên từng pixel; cỡ cố định thì ảnh nằm vừa bên trong, không bị cắt, hoặc lấp đầy nếu người dùng chọn (`geometry.ts`). Hàng "Tỉ lệ" trong mục Khung đổi tỉ lệ file xuất mà vẫn giữ độ phân giải ảnh; cỡ cụ thể của mạng xã hội thì chọn ở mục Cỡ. Bản xem trước, ảnh thu nhỏ và file xuất vẽ chữ bằng cùng một hàm (`draw.ts`, lớp `FrameLayer`); lớp nằm dưới ảnh (nền mờ, tấm nền) dựng bằng CSS ở bản xem trước (`FrameBackdrop`) và bằng `drawBackdrop` lúc xuất, cùng số đo. Khung nằm ở trường `frame` của thiết kế; ghép thêm ảnh thì khung tạm nghỉ (`activeFrame` trong store), còn một ảnh thì trở lại. Đóng khung nhiều ảnh: ở thư viện bấm Chọn, tích ảnh rồi bấm nút đóng khung; mỗi ảnh thành một thiết kế với khung đang dùng (`frameMany`), bản web mở luôn hộp xuất cả loạt. Mục Khung cũng chứa viền ngoài, khoảng cách, bo góc và màu nền của ảnh ghép.
- **Dẫn đường cho người mới** (`src/lib/onboarding.ts`): màn hình đầu có nút "Thử với ảnh mẫu" (ảnh trong `public/samples`) và bốn bước Thêm ảnh → Ghép → Chữ → Xuất; một chấm trên dải công cụ chỉ mục nên bấm tiếp theo, hết sau lần xuất đầu tiên; gợi ý thao tác trên khung hiện từng cái một, làm được rồi thì thôi. Bảng phím tắt nằm trong menu ⚙.
- **Xuất nhiều thiết kế một lượt** (bản web): nút "Xuất nhiều thiết kế…" trong bảng Xuất ảnh (nút Xuất ảnh ở góc trên phải) hoặc nút tải xuống cạnh "Thiết kế
  mới". Chọn các thiết kế (mặc định chọn hết), mọi file dùng chung cài đặt xuất, đặt tên theo tên thiết kế (thiết kế một
  ảnh: theo tên ảnh), lưu vào thư mục xuất.
- Preview và export dùng chung một hàm hình học (`placeImage`, `collageLayout`) nên file xuất ra khớp với những gì thấy trên màn hình.

## Hiệu năng

- Mọi việc nặng (đọc file, giải mã, cắt, resize, làm nét, mã hoá JPEG) chạy trong pool Web Worker (`imaging.worker.ts`, tối đa 3 worker). Luồng giao diện chỉ dán kết quả lên canvas nên không khựng khi nhập hay xuất ảnh vài chục MP.
- Kéo ảnh / kéo đường chia ghi thẳng `transform` vào DOM, không qua React; hiệu ứng chỉ đổi `opacity` / `transform` để chạy trên compositor.
- Ô ảnh trong thư viện được `memo` và dùng `content-visibility: auto`: thư viện dài không làm chậm thao tác chọn ảnh.

## Thêm bố cục

Bố cục là một cây chia ô, mô tả bằng DSL (xem `src/lib/layout/dsl.ts`):

```
*          một ô ảnh
H(a,b)     xếp ngang        V(a,b)   xếp dọc
H3 / V3    viết tắt của H(*,*,*) / V(*,*,*)
2:a        phần tử có trọng số 2
```

Ví dụ `H(2:*,V3)` = một ảnh lớn bên trái + cột 3 ảnh nhỏ bên phải.

Bố cục bày ra cho người dùng không phải là "mọi cách chia ô" mà là danh sách đã chọn lọc cho đúng khung đang dùng (`src/lib/layout/curate.ts`):

- **Ứng viên**: các kiểu xếp hàng / xếp cột, độ cao mỗi hàng được canh (`justify`) để ô giữ tỉ lệ của một tấm ảnh, kể cả hàng có ô hẹp cạnh ô rộng gấp đôi (ảnh dọc cạnh ảnh ngang); cộng các cấu trúc có ô chủ đạo trong `generators.ts` và `handcrafted.ts`.
- **Chấm điểm** (`quality`): ô phải nằm trong khoảng 2:3 tới 16:9, ít cỡ ô khác nhau, không ô nào bé tí cạnh ô khổng lồ. Điểm tính theo tỉ lệ khung, nên khung dọc và khung ngang có danh sách khác nhau.
- **Chọn**: lấy từ đẹp nhất xuống, bỏ cái nhìn gần giống cái đã lấy, tối đa 24.
- **Gợi ý theo ảnh** (`suggestLayouts`): cùng cách làm nhưng canh ô theo tỉ lệ thật của những ảnh đang chọn, giữ nguyên thứ tự ảnh; cái đứng đầu là bố cục mặc định khi vừa ghép ảnh.

Thêm cấu trúc mới: một dòng vào `handcrafted.ts`, hoặc một generator `(n) => string[]` trong `generators.ts`; nó chỉ hiện ra nếu đủ điểm trên khung đang dùng. Id bố cục chính là chuỗi DSL (viết ra bằng `formatLayout`) nên thiết kế và mục Yêu thích cũ vẫn mở được dù bố cục đó không còn trong danh sách. Một ảnh ghép chứa tối đa 10 ảnh (`MAX_PHOTOS`).
