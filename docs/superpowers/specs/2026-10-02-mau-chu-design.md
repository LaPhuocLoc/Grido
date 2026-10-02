# Mẫu chữ — thiết kế

Ngày: 2026-10-02

## Vấn đề

Kho font có ~450 font Việt hoá, font nào cũng có thumb đẹp do designer dựng sẵn. Bấm vào thì app chỉ đổi font của dòng chữ
đang chọn, nên người không biết thiết kế nhận được kết quả khác xa thumb.

## Mục tiêu

Chọn một mẫu là chèn ngay một nhóm chữ trông như thumb của font đó: bố cục, màu, phối font và hiệu ứng chữ.
Không tái tạo nền, ảnh hay hoạ tiết minh hoạ của thumb.

Quyết định đã chốt với người dùng:

- Độ giống: bố cục + màu + hiệu ứng chữ.
- Bấm mẫu luôn chèn nhóm chữ mới (không khoác kiểu lên chữ đang chọn).
- Các khối chữ của mẫu dính thành nhóm; có nút tách nhóm.
- Dữ liệu mẫu do agent dựng tự động từ thumb gốc, tự render và tự so để sửa. Ưu tiên chất lượng, không giới hạn token.
- Người dùng không duyệt trong đợt này; sau này sửa từng mẫu bằng chế độ dev.

## Đợt A — hiệu ứng chữ

`TextItem` thêm 5 trường, `null` = tắt. Số đo tính theo % cỡ chữ nên không phụ thuộc độ phân giải xuất.

| Trường | Nội dung |
|---|---|
| `outline` | `{ color, width }` viền ngoài chữ |
| `block` | `{ color, x, y }` khối nổi: bóng cứng kéo liền từ chữ tới độ lệch (x, y) |
| `glow` | `{ color, size }` phát sáng quanh chữ |
| `gradient` | `{ color, angle }` chuyển màu từ `color` của chữ sang màu này |
| `plate` | `{ color, pad, radius }` nền bo góc sau hộp chữ |

Thứ tự vẽ: nền → bóng mềm (`shadow` sẵn có) → phát sáng → khối nổi → viền → chữ.

**Preview khớp ảnh xuất**: CSS không vẽ được đủ các hiệu ứng này cho khớp canvas (gradient + bóng, kiểu nối nét của viền).
Nên dòng chữ có hiệu ứng được vẽ ở preview bằng chính `drawText` lên một `<canvas>` nằm dưới khối chữ DOM; khối DOM vẫn
giữ nguyên vai trò dàn chữ, đo hộp, bắt chuột và gõ, chỉ là chữ của nó trong suốt. Dòng chữ không có hiệu ứng đi đường CSS
như cũ, không đổi gì.

`drawText` tách thành hai bước: dàn chữ (ngang / dọc) trả về hàm vẽ nét, rồi một chuỗi lượt vẽ hiệu ứng dùng chung.
Chữ có hiệu ứng mà độ trong suốt < 100 thì vẽ ra canvas tạm rồi dán với alpha, để các lượt vẽ không lộ qua nhau.

Thanh công cụ chữ thêm nút "Hiệu ứng" mở bảng bật / chỉnh từng hiệu ứng.

## Đợt B — nhóm chữ, mẫu, chế độ dev

**Nhóm**: `TextItem.group: string | null`. Chọn một dòng trong nhóm thì khung chọn bao cả nhóm; kéo, phóng, xoay tác động
lên mọi thành viên quanh tâm nhóm. Bấm lần nữa vào một dòng để gõ. Thanh công cụ chỉnh riêng dòng đang chọn. Nhân bản và
xoá tác động lên cả nhóm. Nút "Tách nhóm" bỏ `group` của các thành viên. Trạng thái đang kéo của nhóm nằm ở
`liveTexts` trong store (không lưu, không vào lịch sử), thả tay mới ghi thành một bước undo.

**Mẫu**: `src/templates/<fontId>.json`

```json
{ "font": "vn-storm-fighter", "aspect": 1.5, "bg": "#f3ece4", "items": [ { "text": "…", "x": 0.5, "y": 0.4, "size": 22, … } ] }
```

`items` là `TextItem` (không có `id`, `group`) đặt trên một khung tham chiếu tỉ lệ `aspect`, cùng quy ước toạ độ như khung
ghép. `bg` là màu nền của thumb, chỉ dùng khi render để so sánh và làm màu gợi ý cho nền sau chữ. Khi chèn, khung tham
chiếu được đặt vừa 80% bề rộng (và không quá 60% chiều cao) khung ghép, canh giữa; toạ độ và cỡ chữ quy đổi theo đó.

Mẫu nạp bằng một chunk riêng (`import.meta.glob` eager trong `src/templates/index.ts`, import động từ bảng Chữ).

**Giao diện**: bảng Chữ có hai mục "Mẫu chữ" và "Font". Mục Mẫu là lưới thumb của các font có mẫu; bấm là chèn.

**Chế độ dev** (chỉ khi `import.meta.env.DEV`, không có trong bản phát hành):

- Bảng Chữ hiện ô "Lưu nhóm thành mẫu" khi đang chọn một nhóm; dev server ghi `src/templates/<fontId>.json`.
- Trang `/?lab=<fontId>[,<fontId>…]` render từng mẫu bằng `renderCollage` cạnh thumb gốc để so sánh.
- Quy trình sửa mẫu về sau ghi ở `CLAUDE.md`.

## Đợt C — tạo mẫu

`scripts/template-lab.mjs` mở trang lab bằng Chrome headless (CDP, như `e2e-web.mjs`) và chụp ảnh so sánh ra file.

Việc "render rồi so rồi sửa" được làm bằng số chứ không bằng mắt: `src/dev/fit.ts` (chỉ ở bản dev) nhận một mẫu nháp (nội
dung chữ, font, màu và vị trí áng chừng) rồi với từng dòng chữ tìm vị trí, cỡ, khoảng cách dòng, giãn chữ, góc xoay, độ đậm
sao cho nét chữ vẽ bằng `drawText` chồng khít nhất lên vùng cùng màu trong ảnh gốc; sau đó lấy lại màu chữ và màu nền từ
chính ảnh gốc. Dòng to canh trước và "nhận" phần ảnh của nó để dòng nhỏ cùng màu không bị hút về. Khối nhiều dòng không khớp
thì tách từng dòng ra canh riêng (ảnh gốc hay đặt các dòng so le). Agent xem ảnh chụp và chỉ sửa tay những chỗ canh sai.

Font một nét chỉ có một độ đậm thì mẫu đặt `bold: false` để trình duyệt không tự làm đậm giả.

Chọn font: thumb là câu ngắn có bố cục; bỏ thumb là đoạn văn dài, thumb sống nhờ minh hoạ, và thumb dùng mặt chữ / kiểu
chữ thay thế mà app không có. Thumb ghi "Tên font + Việt hoá" thì canh theo chữ đó rồi thay bằng câu mẫu khác (`then`).

Chữ nhiều màu: ảnh gốc hay tô mỗi cụm từ một màu, còn mỗi dòng chữ của app chỉ có một màu. Canh xong, fitter đo màu ảnh gốc
dưới nét của từng từ; các từ khác màu rõ ràng thì dòng chữ được tách thành nhiều dòng đặt đúng chỗ cũ, mỗi dòng một màu.
`--recolour` chạy riêng bước này cho các mẫu đã canh. Khi viết nháp, cụm từ nào khác màu trong ảnh gốc thì ghi thành dòng riêng.

Kết quả: đợt đầu 136 mẫu, đợt hai phủ nốt các font tiếng Việt còn lại (445 mẫu / 449 font; 4 font bỏ vì ảnh gốc dùng mặt chữ
app không có). Ảnh gốc là cả đoạn văn dài thì mẫu chỉ giữ vài dòng đầu.

## Kiểm thử

- Unit (vitest): `normalizeText` bù trường mới; thứ tự và tham số các lượt vẽ hiệu ứng trên canvas giả; quy đổi mẫu → khung
  ghép; thao tác nhóm trong store (chèn, dời, phóng, xoay, tách, xoá, nhân bản, undo).
- Trình duyệt thật: preview của dòng chữ có hiệu ứng so với ảnh xuất; chèn mẫu, kéo nhóm, tách nhóm.
