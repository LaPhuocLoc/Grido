"""Tìm ảnh mẫu gốc (fontvn/thumbs, độ phân giải cao) của từng font trong app → fontvn/thumb-map.json.

Thumbnail trong app (public/fonts/thumbs/<id>.webp) là bản cắt 16:9 thu nhỏ của ảnh gốc, nên chỉ cần cắt ảnh gốc y như thế
rồi so điểm ảnh. Trang so sánh mẫu chữ (`/?lab=…` ở bản dev) dùng bảng này để hiện ảnh gốc cạnh mẫu.
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'fontvn', 'thumbs')
APP = os.path.join(ROOT, 'public', 'fonts', 'thumbs')
W, H = 32, 18


def signature(image, crop):
    image = image.convert('RGB')
    if crop:
        scale = max(320 / image.width, 180 / image.height)
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
        left, top = (image.width - 320) // 2, (image.height - 180) // 2
        image = image.crop((left, top, left + 320, top + 180))
    return np.asarray(image.resize((W, H), Image.BILINEAR), dtype=np.float32).ravel()


def main():
    names = sorted(os.listdir(SRC))
    sources = np.stack([signature(Image.open(os.path.join(SRC, n)), True) for n in names])
    result, loose = {}, []
    for file in sorted(os.listdir(APP)):
        fid = file[:-5]
        if not fid.startswith('vn-'):
            continue
        errors = ((sources - signature(Image.open(os.path.join(APP, file)), False)) ** 2).mean(axis=1)
        best = int(errors.argmin())
        # Font không có ảnh mẫu sẵn (thumbnail do build-fonts.py tự vẽ) sẽ không khớp ảnh gốc nào.
        if errors[best] < 150:
            result[fid] = 'thumbs/' + names[best]
        else:
            loose.append((fid, round(float(errors[best]))))
    json.dump(result, open(os.path.join(ROOT, 'fontvn', 'thumb-map.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{len(result)} font có ảnh gốc; không khớp: {loose}')


if __name__ == '__main__':
    main()
