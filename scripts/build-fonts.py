"""Dựng bộ font Việt hoá cho app từ fontvn/ (font gốc + thumbnail tải về từ fontvn.com, piklab.vn và lengnef.github.io):
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
CACHE = os.path.join(SRC, 'cache')
THUMB_W, THUMB_H = 320, 180  # ô chọn font rộng ~150px, đủ nét cho màn hình 2x

VI = 'ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđơưăâêô'
# Chỉ giữ chữ Latin, dấu tiếng Việt, dấu câu và ký hiệu thường gặp.
KEEP = [*range(0x20, 0x7F), *range(0xA0, 0x250), *range(0x2B0, 0x370), *range(0x1E00, 0x1F00),
        *range(0x2000, 0x2070), *range(0x20A0, 0x20C0), *range(0x2100, 0x2150), *range(0x2190, 0x2200), *range(0x2200, 0x2270)]



def dbcs(codec, rows):
    """Các ký tự của một bảng mã 2 byte kiểu EUC trong những hàng đã cho (Python có sẵn bảng mã, khỏi cần file dữ liệu)."""
    chars = set()
    for hi in rows:
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(ord(bytes([hi, lo]).decode(codec)))
            except (UnicodeDecodeError, TypeError):
                pass
    return chars


# Phần chung của font Nhật / Hàn: Latin cơ bản, dấu câu, ký hiệu và kana (U+3000–30FF), dạng toàn chiều rộng (U+FF00–FFEF).
CJK_BASE = {*range(0x20, 0x7F), *range(0xA0, 0x100), *range(0x2000, 0x2070), *range(0x3000, 0x3100), *range(0xFF00, 0xFFF0)}
# Tiếng Nhật: kana + chữ Hán mức 1 của JIS X 0208 (2.965 chữ thông dụng). Mức 2 (3.390 chữ hiếm / tên riêng, hàng 0xD0–0xF4)
# làm mỗi họ font nặng gần gấp đôi nên không giữ; chữ thiếu sẽ rơi về font hệ thống.
KEEP_JA = sorted(CJK_BASE | dbcs('euc_jp', range(0xB0, 0xD0)))
# Tiếng Hàn: toàn bộ 11.172 âm tiết Hangul hiện đại và chữ cái rời (jamo).
KEEP_KO = sorted(CJK_BASE | set(range(0xAC00, 0xD7A4)) | set(range(0x3130, 0x3190)))
KEEP_BY_LANG = {'vi': KEEP, 'ja': KEEP_JA, 'ko': KEEP_KO}
# Font phải có đủ các chữ này mới được coi là dùng được cho ngôn ngữ đó.
PROBE = {'ja': 'あいうえおかきくけこアイウエオ', 'ko': '가나다라마바사아자차한글'}
# Câu chữ vẽ lên thumbnail của font không có ảnh mẫu sẵn (Google Fonts); câu sau dùng khi font thiếu chữ của câu trước.
THUMB_TEXT = {'ja': ('美しい日本語', 'ひらがなカタカナ'), 'ko': ('아름다운 한글', '한글 가나다라')}

# Nhóm theo danh mục của fontvn.com; nhóm đứng trước được ưu tiên khi font thuộc nhiều danh mục.
GROUPS = [('script', ('script', 'calligraphy', 'brush')), ('serif', ('serif',)), ('sans', ('sans-serif',)),
          ('display', ('display', 'gothic', 'cartoon', 'typography', 'text-effect'))]
# piklab.vn và lengnef không có danh mục: đoán nhóm theo tên font, trừ khi mục trong piklab.json / lengnef.json ghi sẵn "group".
NAME_GROUPS = [('script', ('script', 'brush', 'hand', 'signature', 'calligraph', 'viet tay')), ('serif', ('serif',)), ('sans', ('sans', 'grotesk', 'gothic'))]
BOLD = re.compile(r'\bbold\b', re.I)
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}


def slugify(s):
    s = unicodedata.normalize('NFKD', s.replace('đ', 'd').replace('Đ', 'D')).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def clean_label(name):
    name = re.sub(r'(?i)[\s-]*(personal use|-?demo version-?|regular|bold|variable)\s*$', '', name).strip(' -')
    return re.sub(r'\s+', ' ', name)


def category(item, label):
    """Danh mục fontvn của một font; tải trang sản phẩm một lần rồi lưu lại vào manifest."""
    if item.get('extra'):
        name = slugify(label + ' ' + item['title']).replace('-', ' ')
        return item.get('group') or next((g for g, keys in NAME_GROUPS if any(k in name for k in keys) and not (g == 'sans' and 'serif' in name.replace('sans serif', ''))), 'display')
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
        # Nhiều font Việt hoá để nguyên độ đậm 400 cho mặt Bold: tin tên kiểu chữ và tên file hơn.
        'weight': max(os2.usWeightClass if os2 else 400, 700 if BOLD.search(sub + ' ' + os.path.basename(path)) else 0),
        'italic': bool(os2 and os2.fsSelection & 1) or 'italic' in sub or 'oblique' in sub,
        'width': os2.usWidthClass if os2 else 5,
        'range': (int(wght.minValue), int(wght.maxValue)) if wght and wght.maxValue > wght.minValue else None,
        # Cho phép thiếu vài chữ hiếm; font chỉ có chữ HOA vẫn dùng được (chữ thường sẽ trỏ sang chữ HOA).
        'vi': min(missing(VI), missing(VI.upper())) <= 2,
        'ja': not missing(PROBE['ja']),
        'ko': not missing(PROBE['ko']),
        'caps_only': missing(VI) > 2,
        'latin': not missing('ABCabc'),
        'size': os.path.getsize(path),
    }


def pick(faces, lang='vi'):
    """Chọn mặt chữ thường và mặt chữ đậm cho một bộ font (app chỉ có hai mức: thường / đậm)."""
    faces = [f for f in faces if f[lang] and not f['italic']] or [f for f in faces if f[lang]]
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


def draw_thumb(face, lang, label):
    """Thumbnail cho font không có ảnh mẫu: một câu bằng chính font đó, bên dưới là tên font."""
    from PIL import ImageDraw, ImageFont
    cmap = TTFont(face['path'], fontNumber=0, lazy=True).getBestCmap() or {}
    text = next((t for t in THUMB_TEXT[lang] if all(ord(c) in cmap or c == ' ' for c in t)), THUMB_TEXT[lang][-1])
    scale = 2  # vẽ gấp đôi rồi thu lại cho nét mịn
    img = Image.new('RGB', (THUMB_W * scale, THUMB_H * scale), '#f4efe8')
    draw = ImageDraw.Draw(img)

    def fit(s, size, max_w):
        font = ImageFont.truetype(face['path'], size * scale)
        while draw.textlength(s, font=font) > max_w * scale and size > 10:
            size -= 2
            font = ImageFont.truetype(face['path'], size * scale)
        return font

    named = face['latin'] and all(ord(c) in cmap or c == ' ' for c in label)
    big = fit(text, 50, THUMB_W - 36)
    draw.text((THUMB_W * scale / 2, (THUMB_H * (0.42 if named else 0.5)) * scale), text, font=big, fill='#3b2a26', anchor='mm')
    if named:
        draw.text((THUMB_W * scale / 2, THUMB_H * 0.8 * scale), label, font=fit(label, 20, THUMB_W - 48), fill='#8a6f66', anchor='mm')
    return img.resize((THUMB_W, THUMB_H), Image.LANCZOS)


def to_woff2(src, dst, caps_only=False, keep=KEEP):
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
                for cp in keep:
                    upper = chr(cp).upper()
                    if cp not in table.cmap and len(upper) == 1 and ord(upper) in table.cmap:
                        table.cmap[cp] = table.cmap[ord(upper)]
    sub = subset.Subsetter(options)
    sub.populate(unicodes=keep)
    sub.subset(font)
    subset.save_font(font, dst, options)


def convert(src, dst, caps_only, lang):
    """to_woff2 có nhớ kết quả: cắt glyph font Nhật / Hàn mất cả phút mỗi file, nên file đã chuyển được giữ ở fontvn/cache
    và dùng lại chừng nào file gốc lẫn bộ ký tự giữ lại chưa đổi."""
    import hashlib
    keep = KEEP_BY_LANG[lang]
    stat = os.stat(src)
    key = hashlib.sha1(f'{os.path.relpath(src, SRC)}|{stat.st_size}|{int(stat.st_mtime)}|{caps_only}|{lang}|{len(keep)}|{keep[-1]}'.encode()).hexdigest()
    cached = os.path.join(CACHE, key + '.woff2')
    if not os.path.exists(cached):
        os.makedirs(CACHE, exist_ok=True)
        to_woff2(src, cached + '.part', caps_only, keep)
        os.replace(cached + '.part', cached)
    shutil.copyfile(cached, dst)


def main():
    manifest_path = os.path.join(SRC, 'manifest.json')
    items = json.load(open(manifest_path, encoding='utf-8'))
    # Nguồn ngoài fontvn.com; font trùng tên giữa các nguồn chỉ lấy bản gặp trước.
    # google.json là font tiếng Nhật / Hàn của Google Fonts: mỗi mục ghi sẵn "lang" và "group".
    extra = [{**i, 'extra': True} for name in ('piklab.json', 'lengnef.json', 'google.json') if os.path.exists(os.path.join(SRC, name))
             for i in json.load(open(os.path.join(SRC, name), encoding='utf-8'))]
    # Thử nhanh: GOOGLE_FONTS="noto-sans-jp,jua" chỉ dựng mấy họ font Google đó (mặc định dựng hết).
    only = os.environ.get('GOOGLE_FONTS')
    if only is not None:
        wanted = set(filter(None, only.split(',')))
        extra = [i for i in extra if i.get('lang', 'vi') == 'vi' or i['slug'] in wanted]
    for d in (OUT_FONTS, OUT_THUMBS):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)

    catalog, css, skipped, used = [], [], [], set()
    for item in items + extra:
        if not item.get('fontFiles'):
            continue
        faces = []
        for rel in item['fontFiles']:
            try:
                faces.append(describe(os.path.join(SRC, rel)))
            except Exception as e:
                print('  không đọc được', rel, e)
        lang = item.get('lang', 'vi')
        regular, bold = pick(faces, lang)
        if not regular:
            skipped.append((item['slug'], 'thiếu dấu tiếng Việt' if lang == 'vi' else f'thiếu chữ của ngôn ngữ "{lang}"'))
            continue
        if lang == 'vi':
            label = clean_label(regular['family'])
            if item.get('extra'):
                label = re.sub(r'^LF\s*(?=[A-Z])', '', label)  # tiền tố của người Việt hoá (lengnef)
        else:
            label = item['title']  # tên họ font trên Google Fonts; tên ghi trong file có khi là chữ Nhật / Hàn
        # Tiền tố id theo ngôn ngữ ("vn-" có từ khi kho chỉ có font Việt hoá, giữ nguyên để thiết kế đã lưu vẫn mở được).
        fid = ('vn-' if lang == 'vi' else lang + '-') + slugify(label)
        if fid in used:
            skipped.append((item['slug'], f'trùng font {label}'))
            continue
        # Font Nhật / Hàn không có chuyện "chỉ có chữ HOA": phép thử đó chỉ áp dụng cho dấu tiếng Việt.
        caps = lambda face: face['caps_only'] and lang == 'vi'
        try:
            convert(regular['path'], os.path.join(OUT_FONTS, fid + '.woff2'), caps(regular), lang)
            if bold:
                try:
                    convert(bold['path'], os.path.join(OUT_FONTS, fid + '-bold.woff2'), caps(bold), lang)
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

        thumb = Image.open(os.path.join(SRC, item['thumb'])).convert('RGB') if item.get('thumb') else draw_thumb(regular, lang, label)
        scale = max(THUMB_W / thumb.width, THUMB_H / thumb.height)
        thumb = thumb.resize((round(thumb.width * scale), round(thumb.height * scale)), Image.LANCZOS)
        left, top = (thumb.width - THUMB_W) // 2, (thumb.height - THUMB_H) // 2
        thumb.crop((left, top, left + THUMB_W, top + THUMB_H)).save(os.path.join(OUT_THUMBS, fid + '.webp'), 'WEBP', quality=72, method=6)

        catalog.append({'id': fid, 'label': label, 'group': category(item, label), 'lang': lang})
        print(f"{fid:44} {'variable' if regular['range'] else 'đậm' if bold else 'một mặt':9} {os.path.basename(regular['path'])}")

    json.dump(items, open(manifest_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    catalog.sort(key=lambda f: f['label'].lower())
    with open(os.path.join(ROOT, 'src', 'fonts.generated.css'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* Sinh bởi scripts/build-fonts.py — đừng sửa tay. */\n' + '\n'.join(css) + '\n')
    with open(os.path.join(ROOT, 'src', 'lib', 'fonts.generated.ts'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Sinh bởi scripts/build-fonts.py — đừng sửa tay.\n')
        f.write("export type VnFontGroup = 'sans' | 'serif' | 'script' | 'display'\n")
        f.write("export type VnFontLang = 'vi' | 'ja' | 'ko'\n\n")
        f.write('export const VN_FONTS: { id: string; label: string; group: VnFontGroup; lang: VnFontLang }[] = [\n')
        for c in catalog:
            f.write(f"  {{ id: {json.dumps(c['id'])}, label: {json.dumps(c['label'], ensure_ascii=False)}, group: '{c['group']}', lang: '{c['lang']}' }},\n")
        f.write(']\n')

    size = lambda d: sum(os.path.getsize(os.path.join(d, n)) for n in os.listdir(d)) / 1048576
    print(f'\n{len(catalog)} font · woff2 {size(OUT_FONTS):.1f} MB · thumbnail {size(OUT_THUMBS):.1f} MB')
    for slug, why in skipped:
        print('BỎ QUA', slug, '—', why)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
