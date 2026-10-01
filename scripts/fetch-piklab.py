"""Lấy danh sách font của bộ sưu tập "Font Việt hóa" trên piklab.vn vào fontvn/piklab.json.
Trang danh sách không cần đăng nhập: mỗi ?page=N nhúng sẵn 20 mục trong HTML (dữ liệu RSC của Next.js).
Việc tải file thì cần đăng nhập (POST api.piklab.vn/api/customer/resources/<id>/download).
Chạy: python scripts/fetch-piklab.py"""
import json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'fontvn', 'piklab.json')
URL = 'https://piklab.vn/bo-suu-tap/font-viet-hoa?page=%d'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}
ITEM = re.compile(r'\{"id":"([a-z0-9]+)","title":"([^"]*)","slug":"([^"]+)","fileType":"([A-Z]+)","avatarUrl":"([^"]*)"')


def main():
    old = {i['id']: i for i in json.load(open(OUT, encoding='utf-8'))} if os.path.exists(OUT) else {}
    items, page = {}, 1
    while True:
        html = urllib.request.urlopen(urllib.request.Request(URL % page, headers=UA), timeout=60).read().decode('utf-8', 'ignore')
        found = ITEM.findall(html.replace('\\"', '"'))
        if not found:
            break
        for rid, title, slug, file_type, thumb in found:
            items.setdefault(rid, {**old.get(rid, {}), 'id': rid, 'page': page, 'slug': slug, 'title': title,
                                   'fileType': file_type, 'url': 'https://piklab.vn/tai-nguyen/' + slug, 'thumbUrl': thumb})
        print(f'trang {page}: {len(found)} mục')
        page += 1
        time.sleep(0.3)
    json.dump(list(items.values()), open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'{len(items)} font → {OUT}')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
