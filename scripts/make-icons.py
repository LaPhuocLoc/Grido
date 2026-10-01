"""Dựng mọi icon của app từ ảnh gốc logo/tiem-ghep-anh.png (PNG vuông, nền ngoài góc bo trong suốt):
build/icon.png (1024, macOS / Linux), build/icon.ico (Windows), public/icon.png (cửa sổ + taskbar),
public/favicon.png và public/logo.png (logo trên thanh tiêu đề).
Chạy lại khi đổi logo: python scripts/make-icons.py (cần Pillow + numpy)."""
import numpy as np
from PIL import Image

SOURCE = 'logo/tiem-ghep-anh.png'
MARGIN = 0.02  # chừa mép mỗi bên, tính theo cạnh icon

src = Image.open(SOURCE).convert('RGBA')
# Cắt sát hình rồi đặt vào giữa khung vuông: ảnh gốc thường có viền trống không đều.
alpha = np.asarray(src)[..., 3]
ys, xs = np.where(alpha > 8)
art = src.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
side = round(max(art.size) / (1 - 2 * MARGIN))
icon = Image.new('RGBA', (side, side), (0, 0, 0, 0))
icon.paste(art, ((side - art.width) // 2, (side - art.height) // 2))


def sized(px):
    return icon.resize((px, px), Image.LANCZOS)


sized(1024).save('build/icon.png')
sized(256).save('public/icon.png')
sized(128).save('public/logo.png')
sized(64).save('public/favicon.png')
# Mỗi cỡ thu nhỏ riêng từ ảnh gốc thay vì để Pillow thu từ bản 256.
sizes = (256, 128, 64, 48, 32, 24, 16)
frames = [sized(s) for s in sizes]
frames[0].save('build/icon.ico', sizes=[(s, s) for s in sizes], append_images=frames[1:])
