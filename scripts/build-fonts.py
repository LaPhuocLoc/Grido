"""Dựng bộ font Việt hoá cho app từ fontvn/ (font gốc + thumbnail tải về từ fontvn.com):
  public/fonts/vn/<id>[-bold].woff2   font đã cắt còn chữ Latin + tiếng Việt, nén woff2
  public/fonts/thumbs/<id>.webp       thumbnail thu nhỏ cho ô chọn font
  src/fonts.generated.css             @font-face (trình duyệt chỉ tải file khi font được dùng)
  src/lib/fonts.generated.ts          danh mục font cho giao diện
Chạy lại khi thêm font vào fontvn/fonts: python scripts/build-fonts.py (cần fonttools + brotli + Pillow)."""
import io, json, os, re, shutil, sys, time, unicodedata, urllib.request
from fontTools import subset
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'fontvn')
OUT_FONTS = os.path.join(ROOT, 'public', 'fonts', 'vn')
OUT_THUMBS = os.path.join(ROOT, 'public', 'fonts', 'thumbs')
THUMB_W, THUMB_H = 320, 180  # ô chọn font rộng ~150px, đủ nét cho màn hình 2x

VI = 'ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđơưăâêô'
# Chỉ giữ chữ Latin, dấu tiếng Việt, dấu câu và ký hiệu thường gặp.
KEEP = [*range(0x20, 0x7F), *range(0xA0, 0x250), *range(0x2B0, 0x370), *range(0x1E00, 0x1F00),
        *range(0x2000, 0x2070), *range(0x20A0, 0x20C0), *range(0x2100, 0x2150), *range(0x2190, 0x2200), *range(0x2200, 0x2270)]

# Nhóm theo danh mục của fontvn.com; nhóm đứng trước được ưu tiên khi font thuộc nhiều danh mục.
GROUPS = [('script', ('script', 'calligraphy', 'brush')), ('serif', ('serif',)), ('sans', ('sans-serif',)),
          ('display', ('display', 'gothic', 'cartoon', 'typography', 'text-effect'))]
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}


def slugify(s):
    s = unicodedata.normalize('NFKD', s.replace('đ', 'd').replace('Đ', 'D')).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def clean_label(name):
    name = re.sub(r'(?i)[\s-]*(personal use|-?demo version-?|regular|bold|variable)\s*$', '', name).strip(' -')
    return re.sub(r'\s+', ' ', name)


def category(item):
    """Danh mục fontvn của một font; tải trang sản phẩm một lần rồi lưu lại vào manifest."""
    if 'categories' not in item:
        html = urllib.request.urlopen(urllib.request.Request(item['url'], headers=UA), timeout=60).read().decode('utf-8', 'ignore')
        m = re.search(r'id="product-\d+" class="([^"]*)"', html)
        item['categories'] = sorted(set(re.findall(r'product_cat-([\w-]+)', m.group(1) if m else '')) - {'mien-phi'})
        time.sleep(0.3)
    cats = item['categories']
    return next((g for g, keys in GROUPS if any(k in cats for k in keys)), 'display')


def describe(path):
    font = TTFont(path, fontNumber=0, lazy=True)
    cmap = font.getBestCmap() or {}
    name = font['name']
    os2 = font['OS/2'] if 'OS/2' in font else None
    wght = next((a for a in font['fvar'].axes if a.axisTag == 'wght'), None) if 'fvar' in font else None
    sub = (name.getDebugName(17) or name.getDebugName(2) or '').lower()
    english = name.getName(16, 3, 1, 0x409) or name.getName(1, 3, 1, 0x409)
    missing = lambda chars: sum(ord(c) not in cmap for c in chars)
    return {
        'path': path,
        'family': (english.toUnicode() if english else None) or name.getDebugName(16) or name.getDebugName(1) or os.path.basename(path),
        'weight': os2.usWeightClass if os2 else 400,
        'italic': bool(os2 and os2.fsSelection & 1) or 'italic' in sub or 'oblique' in sub,
        'width': os2.usWidthClass if os2 else 5,
        'range': (int(wght.minValue), int(wght.maxValue)) if wght and wght.maxValue > wght.minValue else None,
        # Cho phép thiếu vài chữ hiếm; font chỉ có chữ HOA vẫn dùng được (chữ thường sẽ trỏ sang chữ HOA).
        'vi': min(missing(VI), missing(VI.upper())) <= 2,
        'caps_only': missing(VI) > 2,
        'size': os.path.getsize(path),
    }


def pick(faces):
    """Chọn mặt chữ thường và mặt chữ đậm cho một bộ font (app chỉ có hai mức: thường / đậm)."""
    faces = [f for f in faces if f['vi'] and not f['italic']] or [f for f in faces if f['vi']]
    if not faces:
        return None, None
    variable = [f for f in faces if f['range'] and f['range'][0] <= 500 and f['range'][1] >= 700]
    if variable:
        return min(variable, key=lambda f: (abs(f['width'] - 5), f['size'])), None
    # Bộ nhiều họ con (Condensed, Expanded…) → lấy họ có bề rộng chuẩn nhất, tên ngắn nhất.
    best = min(faces, key=lambda f: (abs(f['width'] - 5), abs(f['weight'] - 400), len(f['family'])))
    family = [f for f in faces if f['family'] == best['family'] and f['width'] == best['width']] or [best]
    regular = min(family, key=lambda f: (abs(f['weight'] - 400), f['weight']))
    heavier = [f for f in family if f['weight'] >= max(600, regular['weight'] + 200)]
    return regular, min(heavier, key=lambda f: abs(f['weight'] - 700)) if heavier else None


def to_woff2(src, dst, caps_only=False):
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']
    options.name_IDs = [1, 2, 4, 6]
    options.notdef_outline = True
    options.ignore_missing_unicodes = True
    options.ignore_missing_glyphs = True
    font = subset.load_font(src, options, dontLoadGlyphNames=True)
    if caps_only:
        for table in font['cmap'].tables:
            if table.isUnicode():
                for cp in KEEP:
                    upper = chr(cp).upper()
                    if cp not in table.cmap and len(upper) == 1 and ord(upper) in table.cmap:
                        table.cmap[cp] = table.cmap[ord(upper)]
    sub = subset.Subsetter(options)
    sub.populate(unicodes=KEEP)
    sub.subset(font)
    subset.save_font(font, dst, options)


def main():
    manifest_path = os.path.join(SRC, 'manifest.json')
    items = json.load(open(manifest_path, encoding='utf-8'))
    for d in (OUT_FONTS, OUT_THUMBS):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)

    catalog, css, skipped, used = [], [], [], set()
    for item in items:
        if not item.get('fontFiles'):
            continue
        faces = []
        for rel in item['fontFiles']:
            try:
                faces.append(describe(os.path.join(SRC, rel)))
            except Exception as e:
                print('  không đọc được', rel, e)
        regular, bold = pick(faces)
        if not regular:
            skipped.append((item['slug'], 'thiếu dấu tiếng Việt'))
            continue
        label = clean_label(regular['family'])
        fid = 'vn-' + slugify(label)
        if fid in used:
            skipped.append((item['slug'], f'trùng font {label}'))
            continue
        try:
            to_woff2(regular['path'], os.path.join(OUT_FONTS, fid + '.woff2'), regular['caps_only'])
            if bold:
                try:
                    to_woff2(bold['path'], os.path.join(OUT_FONTS, fid + '-bold.woff2'), bold['caps_only'])
                except Exception as e:
                    print('  bỏ mặt đậm', fid, e)
                    bold = None
        except Exception as e:
            skipped.append((item['slug'], f'lỗi chuyển đổi: {e}'))
            continue
        used.add(fid)

        weight = f"{regular['range'][0]} {regular['range'][1]}" if regular['range'] else ('400' if bold else '100 900')
        # Font chỉ có một mặt chữ: khai báo cho mọi độ đậm để trình duyệt không tự làm đậm giả ở mức 500.
        if not regular['range'] and not bold:
            weight = '100 600'
        face = "@font-face{font-family:'%s';src:url('/fonts/vn/%s.woff2') format('woff2');font-weight:%s;font-display:swap}"
        css.append(face % (fid, fid, weight))
        if bold:
            css.append(face % (fid, fid + '-bold', '700'))

        thumb = Image.open(os.path.join(SRC, item['thumb'])).convert('RGB')
        scale = max(THUMB_W / thumb.width, THUMB_H / thumb.height)
        thumb = thumb.resize((round(thumb.width * scale), round(thumb.height * scale)), Image.LANCZOS)
        left, top = (thumb.width - THUMB_W) // 2, (thumb.height - THUMB_H) // 2
        thumb.crop((left, top, left + THUMB_W, top + THUMB_H)).save(os.path.join(OUT_THUMBS, fid + '.webp'), 'WEBP', quality=72, method=6)

        catalog.append({'id': fid, 'label': label, 'group': category(item)})
        print(f"{fid:44} {'variable' if regular['range'] else 'đậm' if bold else 'một mặt':9} {os.path.basename(regular['path'])}")

    json.dump(items, open(manifest_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    catalog.sort(key=lambda f: f['label'].lower())
    with open(os.path.join(ROOT, 'src', 'fonts.generated.css'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* Sinh bởi scripts/build-fonts.py — đừng sửa tay. */\n' + '\n'.join(css) + '\n')
    with open(os.path.join(ROOT, 'src', 'lib', 'fonts.generated.ts'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Sinh bởi scripts/build-fonts.py — đừng sửa tay.\n')
        f.write("export type VnFontGroup = 'sans' | 'serif' | 'script' | 'display'\n\n")
        f.write('export const VN_FONTS: { id: string; label: string; group: VnFontGroup }[] = [\n')
        for c in catalog:
            f.write(f"  {{ id: {json.dumps(c['id'])}, label: {json.dumps(c['label'], ensure_ascii=False)}, group: '{c['group']}' }},\n")
        f.write(']\n')

    size = lambda d: sum(os.path.getsize(os.path.join(d, n)) for n in os.listdir(d)) / 1048576
    print(f'\n{len(catalog)} font · woff2 {size(OUT_FONTS):.1f} MB · thumbnail {size(OUT_THUMBS):.1f} MB')
    for slug, why in skipped:
        print('BỎ QUA', slug, '—', why)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
