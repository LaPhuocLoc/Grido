"""Dựng icon app từ đúng hình trong public/logo.svg: build/icon.png (1024), build/icon.ico, public/icon.png (256).
Chạy lại khi đổi logo: python scripts/make-icons.py (cần Pillow + numpy)."""
import numpy as np
from PIL import Image, ImageDraw

S = 4096  # vẽ to rồi thu nhỏ để mép bo mịn
K = S / 512
STOPS = [(0.0, (0xE5, 0x30, 0x6C)), (0.52, (0x9A, 0x4C, 0xF2)), (1.0, (0x3F, 0x6B, 0xFF))]

y, x = np.mgrid[0:S, 0:S]
t = (x + y) / (2 * (S - 1))
rgb = np.zeros((S, S, 3), np.float32)
for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
    m = (t >= t0) & (t <= t1)
    f = ((t - t0) / (t1 - t0))[m][:, None]
    rgb[m] = np.array(c0) * (1 - f) + np.array(c1) * f


def mask(x, y, w, h, r, alpha=1.0):
    im = Image.new('L', (S, S), 0)
    ImageDraw.Draw(im).rounded_rectangle([x * K, y * K, (x + w) * K - 1, (y + h) * K - 1], r * K, fill=round(255 * alpha))
    return np.asarray(im, np.float32)[..., None] / 255


for cell in [(100, 100, 184, 184, 44, 1.0), (308, 100, 104, 312, 44, 0.82), (100, 308, 184, 104, 44, 0.64)]:
    a = mask(*cell)
    rgb = rgb * (1 - a) + 255 * a

alpha = mask(0, 0, 512, 512, 116) * 255
icon = Image.fromarray(np.concatenate([rgb, alpha], 2).round().astype(np.uint8), 'RGBA')
icon.resize((1024, 1024), Image.LANCZOS).save('build/icon.png')
icon.resize((256, 256), Image.LANCZOS).save('public/icon.png')
icon.resize((256, 256), Image.LANCZOS).save('build/icon.ico', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
