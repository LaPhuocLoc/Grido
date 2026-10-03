# Chất lượng xuất ảnh — đo theo Lightroom

Ngày: 2026-10-03

## Mục tiêu

Ảnh xuất từ app phải đạt chất lượng như khi người dùng xuất bằng Lightroom "Output Sharpening: Screen · High" (cách họ
vẫn làm), với cả ba workflow:

1. JPG gốc của máy ảnh (20–30MB) → 2048px / 1350px.
2. RAW chỉnh trong Lightroom → xuất 2048 / 1350 → đem vào app (với app, đây chính là workflow 3).
3. Ảnh 2048 / 1350 đã xuất → chèn chữ, chỉnh khung → xuất lại 2048 / 1350 / cỡ khác.

Quyết định đã chốt với người dùng: các mức làm nét là Tắt / Thấp / Tiêu chuẩn / Cao, chất lượng JPEG mặc định **100%**.
Làm nét mặc định ban đầu là Cao (settings bản 3); sau đó người dùng chọn mặc định **Tắt** (settings bản 4, ai cũng chuyển
một lần).

## Cách đo

- Dữ liệu thật trong `Pictures/100_FUJI` và `Pictures/Sony`: ghép bản Lightroom xuất trong các thư mục `2048px` / `1350px`
  với JPG gốc theo `crs:RawFileName`. Chỉ giữ cặp mà Lightroom không chỉnh gì: lọc chặt mọi thông số `crs:` (lần lọc đầu
  bỏ sót Grain = 25 ở loạt "Chay bo" và một ảnh Upright; các cặp đó đã bị loại).
- Dò thuật toán trên 27 cặp sạch, chấm trên **83 cặp sạch khác chưa từng dùng để dò**.
- Đối chiếu bản Python dùng để dò với code TypeScript của app chạy trong Chrome: lệch tối đa 0.5 mức (do làm tròn).
- Chạy toàn bộ đường xuất thật trên bản web dev (dàn khung, cắt, resize, làm nét, chữ, MozJPEG), giải mã file ra rồi so.

Các con số "độ nét" là tỉ lệ năng lượng chi tiết nhỏ (luma trừ bản làm mờ) so với bản Lightroom: 1.00 là nét bằng.

## Lightroom làm gì (đo ra, không phải đoán)

| | Lightroom | App bản cũ |
|---|---|---|
| Thu nhỏ | bicubic trên giá trị sRGB (gamma) | Lanczos3 trong ánh sáng tuyến tính → chi tiết nhỏ sáng, nhạt hơn |
| Làm nét | USM bán kính ~0.6px, độ mạnh theo độ sáng: ~0 ở vùng tối và gần trắng, mạnh nhất ở vùng trung tính | 3×3 đều cả ảnh → đẩy noise vùng tối, điểm đen bị kéo xuống |
| Độ mạnh | không đổi theo cỡ xuất (2048 và 1350 như nhau) | "Chuẩn" đã nét hơn High, "Mạnh" gấp ~3 lần ở chi tiết mịn nhất |
| Màu, tông | giữ nguyên | giữ nguyên (lệch < 1 mức) |

## Thuật toán mới

- `resample.ts`: Catmull-Rom tách trục trên giá trị sRGB, alpha nhân trước.
- `sharpen.ts`: USM Gauss σ 0.6px từng kênh, hệ số theo độ sáng (bản làm mờ) của pixel theo đường cong `CURVE` dò từ dữ
  liệu. Cao = 1 khớp Screen · High. Thấp 0.4 / Tiêu chuẩn 0.7 là **ước lượng** (chưa có bản Lightroom Low / Standard).
- `sharpenFactor(scale, cạnh dài nguồn)`:
  - phóng to hoặc giữ nguyên cỡ → 0 (ảnh 2048 chèn chữ xuất 2048: pixel ảnh giữ nguyên tuyệt đối);
  - file gốc (cạnh dài > 3000px) → tăng dần, đủ từ thu nhỏ 1.5 lần;
  - ảnh đã xuất (≤ 3000px, đã làm nét sẵn) → chỉ một phần: `min(1, (scale−1)/0.05) · min(1, 0.42 + 0.15·(scale−1))`.
    Dò trên 45 ảnh có cả bản Lightroom 2048 lẫn 1350.
- Ô phải dựng từ bản xem trước, hoặc JPEG phải rơi về 4:2:0, thì báo ngay sau khi xuất (trước đây im lặng).

## Kết quả

83 cặp sạch chưa dùng để dò (2048 và 1350, Fuji và Sony):

| | App cũ · Chuẩn | App cũ · Mạnh | App mới · Cao |
|---|---|---|---|
| Sai lệch so với Lightroom (RMSE, thang 0–255) | 3.38 | 4.53 | **1.44** |
| SSIM so với Lightroom | 0.984 | — | **0.996** |
| Độ nét so với Lightroom | — | — | **1.00** (90% số ảnh trong 0.96–1.02) |
| Hạt ở vùng tối so với Lightroom | ×1.4 | — | **×0.96** |
| Lệch tông (luma trung bình) | — | — | **0.06 mức** |

App mới tốt hơn app cũ ở 83/83 ảnh. Ảnh lệch nhiều nhất (cỏ, lá rất dày) nhìn ở 300% không phân biệt được: phần lệch là
nhiễu cỡ từng pixel.

## Edge case đã kiểm

| Trường hợp | Kết quả |
|---|---|
| JPG gốc 40MP → 2048 trên Chrome, đường xuất thật, 100% | độ nét 1.02 × Lightroom; 4:4:4; có sRGB; mất do nén 50.5 dB |
| Cùng ảnh nhưng 95% | mất do nén chỉ còn 38.8 dB trên ảnh cỏ → mặc định 100% là đúng |
| Ảnh dọc có cờ xoay EXIF (Fuji) → 2048 và 1350 | xoay đúng; độ nét 0.99 / 1.02 × Lightroom |
| Ảnh 2048 + chữ → xuất 2048 | pixel ảnh y hệt bản đưa vào (sai lệch 0); sau nén 100% lệch tối đa 3 mức, 56 dB |
| Bản Lightroom 2048 → xuất lại 1350 | bản cũ làm nét đủ: nét hơn bản 1350 của Lightroom 21%; bản mới: 1.02, RMSE 2.67 → 1.50 |
| Bản 2048 thu nhỏ 1.03–4 lần (thêm viền, ô nhỏ trong ảnh ghép) | độ nét 0.94–1.02 so với chuẩn (cũ: 0.87–1.21) |
| Nguồn Adobe RGB / ProPhoto có hồ sơ màu | đổi đúng về sRGB: lệch trung bình 0.1 mức (không đổi thì lệch 10–15 mức) |
| Xuất khổ lớn 7008×4672, 9000×6000, 12000×8000 | vẫn MozJPEG 4:4:4 + sRGB (32 / 46 / 81 MB, 13–31 giây) |
| 9 ảnh gốc 40MP ghép 3×3 | cả 9 ô đọc từ file gốc (máy 32GB, 8 worker), 4.4 giây |
| File gốc hỏng / không đọc được | dùng bản xem trước **và báo tên ảnh** (đã thử trên Chrome) |
| Trời, tường phẳng: loang dải màu | sau nén 100%: hạt 0.98 × Lightroom, tỉ lệ pixel liền kề trùng giá trị 0.50 (Lightroom 0.49) — không loang hơn |

## Đợt 2: tắt làm nét, xuất nguyên cỡ (bộ "For Dev")

Người dùng xuất thêm từ Lightroom, không Output Sharpening, cho 44 JPG gốc (30 Sony, 14 Fuji): bản 2048px và bản
full-size (`Sony/20250918_Sado/For Dev`). Lần đầu tách được riêng cách thu nhỏ và riêng bước làm nét của Lightroom.

| Kiểm tra | Kết quả |
|---|---|
| Kernel thu nhỏ so với Lightroom không làm nét (44 ảnh) | Catmull-Rom trên sRGB khớp nhất: RMSE 1.17, độ chi tiết 0.997, tông −0.11. Lanczos2 ngang; Lanczos3 1.62 (nét giả 1.09); Mitchell 1.81 (mềm 0.86); app cũ 2.74 |
| Phần lệch 1.17 đó gồm gì | riêng nhiễu nén JPEG của file Lightroom (bảng lượng tử của chính nó) đã là 1.07 → lệch thật ~0.5 mức |
| Bước làm nét riêng (Lightroom không làm nét → High, 26 ảnh) | mô hình của app: độ nét 1.004; dò lại đường cong từ dữ liệu này không tốt hơn (1.82 so với 1.81) |
| Mép rất gắt | Lightroom hãm quầng sáng (tăng 20 mức còn ~97%, 45 → ~86%, 80 → ~75%). **Đã thêm** `HALO_LIMIT·tanh`: lệch ở mép gắt 7.52 → 6.71 |
| Xuất nguyên cỡ | app lệch ảnh gốc 0.36–0.46 (chỉ do nén JPEG 100%); bản full-size của Lightroom lệch 0.88–1.37 (Lightroom giải mã màu JPEG máy ảnh hơi khác, nhất là Sony) |
| MozJPEG 100% | lệch 0.755, ngang libjpeg 100% (0.776), file nhẹ hơn 13% |
| Ảnh 3:2 vào khung 2048×1365 / 1350×900 | **lỗi đã sửa**: app cắt bỏ 1 hàng ảnh gốc cho đúng tỉ lệ (44/44 ảnh), lưới lấy mẫu lệch nửa pixel so với Lightroom (RMSE 2.70 so với 1.17). Lightroom co giãn vừa khít; `sourceCrop` giờ cũng vậy khi phần thừa < 1px đầu ra |
| Bản Lightroom full-size (không làm nét) → app → 2048 | Tắt: 1.19 / độ chi tiết 0.997; Cao so với Lightroom High: 1.52 / 0.997 — như đi từ JPG gốc |

Đường xuất thật trên Chrome sau khi sửa (5 ảnh): Tắt 1.16–1.35, Cao 1.41–1.58 (trước khi sửa lỗi cắt 1 hàng: 1.6–3.1 và
2.3–4.3); độ chi tiết 0.985–1.003. 83 cặp kiểm thử của đợt 1 chạy lại với phần hãm quầng sáng: 1.435, độ nét 0.99.

## EXIF

File của người dùng xuất bằng Lightroom dùng "Metadata: All Metadata". App làm giống vậy (`exif.ts`):

- Nhập: đọc EXIF ở đầu file (~2ms trên ảnh 26MB, so với 386ms giải mã), lưu bản tóm tắt (`Photo.exif`, gồm giả lập phim
  Fuji đọc từ MakerNote) và khối EXIF đã làm sạch (~0.8KB, `Photo.exifData`). Ảnh nhập từ trước được đọc bù ở nền.
- Xuất một ảnh: mang EXIF của ảnh đó. So từng thẻ với bản Lightroom 2048 của 5 ảnh (Sony + Fuji): đủ mọi thẻ Lightroom
  ghi, thêm kích thước ảnh; ApertureValue / ShutterSpeedValue tự tính khi máy không ghi (khớp Lightroom tới 3 số lẻ).
  Khác: Software, giờ xuất, DPI (Lightroom ghi theo hộp thoại xuất, app giữ của máy ảnh).
- Ảnh ghép nhiều ảnh: chỉ kích thước, giờ xuất, sRGB (người dùng chọn).
- Không có tuỳ chọn trong phần Xuất (người dùng chọn): luôn giữ đủ, kể cả GPS nếu ảnh có.
- Chỉ thêm phần đầu file, dữ liệu ảnh không đổi.

## Chưa kiểm được / còn để ngỏ

- **Thấp / Tiêu chuẩn**: cần 1 ảnh xuất từ Lightroom ở Screen · Low và Screen · Standard để chỉnh hệ số.
- **File full-size đã làm nét (vd. Lightroom xuất 6000px kèm Output Sharpening) đem vào app**: bị coi là file gốc (> 3000px)
  nên làm nét đủ; theo số đo của ảnh đã xuất thì nét hơn chuẩn khoảng 4–7% khi thu về 2048. Không có cặp ảnh thật để đo.
- **Phóng to** (ảnh nhỏ hơn ô): không có bản Lightroom để so; app không làm nét khi phóng to.
- **File gốc thu nhỏ ít (1–1.5 lần, vd. khung in lớn)**: Lightroom vẫn làm nét đủ, app tăng dần; chưa có dữ liệu để đo.
- HEIC, RAW, TIFF: Chrome không giải mã được, app không nhận.
