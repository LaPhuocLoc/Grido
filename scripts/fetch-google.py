"""Tải font tiếng Nhật và tiếng Hàn từ Google Fonts (giấy phép mở: OFL / Apache, không cần đăng nhập):
danh mục ở https://fonts.google.com/metadata/fonts, mỗi họ font có danh sách file gốc ở /download/list?family=<tên>.
  fontvn/fonts/google-<slug>/      file .ttf gốc + file giấy phép
  fontvn/thumbs/google-<slug>.jpg  ảnh mẫu của Google (theo fontvn/google-posters.json), nếu có
  fontvn/google.json               danh sách + trạng thái (cùng dạng với piklab.json), kèm "lang" và "group"
Họ font có bản variable thì chỉ lấy bản đó, bỏ thư mục static/ (các độ đậm rời, nặng gấp nhiều lần).
Chạy: python scripts/fetch-google.py"""
import importlib, json, os, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
build = importlib.import_module('build-fonts')

SRC = build.SRC
LIST = os.path.join(SRC, 'google.json')
UA = {'User-Agent': 'Mozilla/5.0'}
LANGS = {'japanese': 'ja', 'korean': 'ko'}
GROUPS = {'Sans Serif': 'sans', 'Serif': 'serif', 'Handwriting': 'script', 'Display': 'display', 'Monospace': 'sans'}
FONT_EXT = ('.ttf', '.otf')
# Ảnh mẫu ("font poster") mà trang danh sách của Google Fonts hiện ở chế độ xem sample: tên họ font → link ảnh.
# Trang chỉ nạp ảnh khi thẻ font thật sự hiện trên màn hình, nên bảng này được gom bằng cách cuộn trang trong một cửa sổ trình duyệt
# rồi lưu lại; họ font không có trong bảng thì build-fonts.py tự vẽ thumbnail.
POSTERS_PATH = os.path.join(SRC, 'google-posters.json')
POSTERS = json.load(open(POSTERS_PATH, encoding='utf-8')) if os.path.exists(POSTERS_PATH) else {}


def get_json(url):
    raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read().decode('utf-8')
    return json.loads(raw[4:] if raw.startswith(")]}'") else raw)  # Google chèn tiền tố chống XSSI


def fetch(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300).read()
    with open(dst + '.part', 'wb') as f:
        f.write(data)
    os.replace(dst + '.part', dst)


def work(item):
    manifest = get_json('https://fonts.google.com/download/list?family=' + urllib.parse.quote(item['title']))['manifest']
    folder = os.path.join(SRC, 'fonts', 'google-' + item['slug'])
    rel = lambda p: os.path.relpath(p, SRC).replace('\\', '/')
    refs = [r for r in manifest.get('fileRefs', []) if r['filename'].lower().endswith(FONT_EXT)]
    top = [r for r in refs if '/' not in r['filename']]
    files = []
    for ref in top or refs:
        dst = os.path.join(folder, *ref['filename'].split('/'))
        fetch(ref['url'], dst)
        files.append(rel(dst))
    licence = []
    for f in manifest.get('files', []):
        if f['filename'].upper().startswith(('OFL', 'LICENSE', 'UFL')):
            dst = os.path.join(folder, f['filename'])
            os.makedirs(folder, exist_ok=True)
            with open(dst, 'w', encoding='utf-8', newline='\n') as out:
                out.write(f['contents'])
            licence.append(rel(dst))
    poster = POSTERS.get(item['title'])
    if poster:
        thumb = os.path.join(SRC, 'thumbs', 'google-' + item['slug'] + '.jpg')
        fetch(poster + '=w640', thumb)
        item['thumbUrl'] = poster
        item['thumb'] = rel(thumb)
    item['fontFiles'] = sorted(files)
    item['licenseFiles'] = licence
    item['license'] = 'OFL' if any('OFL' in name for name in licence) else 'Apache-2.0' if licence else 'unknown'
    item['status'] = 'ok' if files else 'no-font'


def main():
    old = {i['slug']: i for i in json.load(open(LIST, encoding='utf-8'))} if os.path.exists(LIST) else {}
    items = []
    for f in get_json('https://fonts.google.com/metadata/fonts')['familyMetadataList']:
        lang = next((code for subset, code in LANGS.items() if subset in f.get('subsets', [])), None)
        if not lang:
            continue
        slug = build.slugify(f['family'])
        items.append({**old.get(slug, {}), 'slug': slug, 'title': f['family'], 'lang': lang, 'group': old.get(slug, {}).get('group') or GROUPS.get(f['category'], 'display'),
                      'url': 'https://fonts.google.com/specimen/' + urllib.parse.quote_plus(f['family']), 'popularity': f.get('popularity')})

    def safe(item):
        try:
            work(item)
        except Exception as e:
            item['status'] = 'error'
            item['note'] = str(e)[:200]
            print('LỖI', item['slug'], e)

    with ThreadPoolExecutor(6) as pool:
        list(pool.map(safe, items))
    items.sort(key=lambda i: (i['lang'], i['popularity'] or 9999))
    json.dump(items, open(LIST, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    for lang in sorted(set(LANGS.values())):
        sel = [i for i in items if i['lang'] == lang]
        size = sum(os.path.getsize(os.path.join(SRC, f)) for i in sel for f in i.get('fontFiles', [])) / 1048576
        print(f"{lang}: {len(sel)} họ font · {sum(i.get('status') == 'ok' for i in sel)} ok · {sum(i.get('status') == 'error' for i in sel)} lỗi · {size:.0f} MB")


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
