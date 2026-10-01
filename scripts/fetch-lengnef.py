"""Tải font Việt hoá từ trang của chính tác giả lengnef (https://lengnef.github.io/store/):
danh sách nằm trong mảng FONTS của dangbai.js, file font là file tĩnh ở fonts/<id> — không cần đăng nhập.
  fontvn/downloads/lengnef/<id>        file gốc (.ttf hoặc .zip)
  fontvn/fonts/lengnef-<slug>/         đã giải nén
  fontvn/thumbs/lengnef-<slug>.jpg     ảnh xem trước
  fontvn/lengnef.json                  danh sách + trạng thái (cùng dạng với piklab.json)
Chạy: python scripts/fetch-lengnef.py"""
import importlib, json, os, re, shutil, sys, urllib.parse
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
piklab = importlib.import_module('download-piklab')
build = importlib.import_module('build-fonts')

SRC = piklab.SRC
LIST = os.path.join(SRC, 'lengnef.json')
BASE = 'https://lengnef.github.io/store/'
ROW = re.compile(r'\{\s*name:\s*"([^"]+)",\s*styles:\s*(\d+),\s*image:\s*"([^"]*)",\s*font:\s*"([^"]*)",\s*id:\s*"([^"]*)"')


def work(item):
    slug = item['slug']
    rel = lambda p: os.path.relpath(p, SRC).replace('\\', '/')
    archive = os.path.join(SRC, 'downloads', 'lengnef', item['file'])
    piklab.fetch(BASE + 'fonts/' + urllib.parse.quote(item['file']), archive)
    folder = os.path.join(SRC, 'fonts', 'lengnef-' + slug)
    shutil.rmtree(folder, ignore_errors=True)
    piklab.unpack(archive, folder)
    files = sorted(rel(os.path.join(d, n)) for d, _, names in os.walk(folder) for n in names)
    item['archive'] = [rel(archive)]
    item['files'] = files
    item['fontFiles'] = [f for f in files if f.lower().endswith(piklab.FONT_EXT)]
    if item.get('thumbUrl'):
        thumb = os.path.join(SRC, 'thumbs', 'lengnef-' + slug + (os.path.splitext(item['thumbUrl'])[1] or '.jpg'))
        piklab.fetch(item['thumbUrl'], thumb)
        item['thumb'] = rel(thumb)
    item['status'] = 'ok' if item['fontFiles'] else 'no-font'


def main():
    old = {i['slug']: i for i in json.load(open(LIST, encoding='utf-8'))} if os.path.exists(LIST) else {}
    js = piklab.urllib.request.urlopen(piklab.urllib.request.Request(BASE + 'dangbai.js', headers=piklab.UA), timeout=60).read().decode('utf-8')
    items = []
    for name, styles, image, _, file in ROW.findall(js):
        slug = build.slugify(name)
        item = {**old.get(slug, {}), 'slug': slug, 'title': name, 'url': BASE + '#' + urllib.parse.quote(name), 'file': file,
                'thumbUrl': BASE + urllib.parse.quote(image) if image and image != '#' else None}
        if file in ('', '#'):
            item['status'] = 'pending'  # tác giả ghi "Chờ cập nhật"
        items.append(item)

    def safe(item):
        if item.get('status') == 'pending':
            return
        try:
            work(item)
        except Exception as e:
            item['status'] = 'error'
            item['note'] = str(e)[:200]
            print('LỖI', item['slug'], e)

    with ThreadPoolExecutor(6) as pool:
        list(pool.map(safe, items))
    json.dump(items, open(LIST, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    count = lambda s: sum(i.get('status') == s for i in items)
    print(f"{len(items)} font · {count('ok')} ok · {count('no-font')} không có file font · {count('error')} lỗi · {count('pending')} chờ cập nhật")


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
