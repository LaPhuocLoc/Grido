"""Tải và giải nén font piklab.vn theo danh sách link đã ký (lấy từ phiên đăng nhập trong trình duyệt):
  fontvn/downloads/piklab/<slug>.<đuôi>   file gốc
  fontvn/fonts/piklab-<slug>/             đã giải nén
  fontvn/thumbs/piklab-<slug>.<đuôi>      ảnh xem trước
Cập nhật archive / files / fontFiles / thumb / status vào fontvn/piklab.json.
Chạy: python scripts/download-piklab.py <file link>   (link hết hạn sau 1 giờ)
Mỗi dòng của file link: id|url, hoặc dạng rút gọn id|đường dẫn file|X-Amz-Date|chữ ký."""
import json, os, shutil, sys, urllib.parse, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'fontvn')
LIST = os.path.join(SRC, 'piklab.json')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}
FONT_EXT = ('.ttf', '.otf', '.ttc', '.woff', '.woff2')
# Link R2 đã ký mà API piklab trả về; chỉ đường dẫn, ngày và chữ ký thay đổi giữa các file.
SIGNED = ('https://piklab-private.cdf5d9d87eede67c4d758a3d6bbb6775.r2.cloudflarestorage.com/resources/%s?X-Amz-Algorithm=AWS4-HMAC-SHA256'
          '&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=b88ffd0c172c078f35e466b233f0ef38%%2F%s%%2Fauto%%2Fs3%%2Faws4_request'
          '&X-Amz-Date=%s&X-Amz-Expires=3600&X-Amz-Signature=%s&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject')


def fetch(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
    with open(dst + '.part', 'wb') as f:
        f.write(data)
    os.replace(dst + '.part', dst)


def unpack(archive, folder):
    """Giải nén (kể cả zip lồng nhau); file không phải zip thì chép nguyên."""
    os.makedirs(folder, exist_ok=True)
    if not zipfile.is_zipfile(archive):
        shutil.copy(archive, os.path.join(folder, os.path.basename(archive)))
        return
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            name = info.filename
            # Tên file trong zip tạo trên Windows/macOS cũ thường không gắn cờ UTF-8.
            if not info.flag_bits & 0x800:
                try:
                    name = name.encode('cp437').decode('utf-8')
                except (UnicodeEncodeError, UnicodeDecodeError):
                    pass
            parts = [p for p in name.replace('\\', '/').split('/') if p not in ('', '.', '..')]
            if info.is_dir() or not parts or '__MACOSX' in parts or parts[-1].startswith('._'):
                continue
            dst = os.path.join(folder, *parts)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with z.open(info) as src, open(dst, 'wb') as out:
                shutil.copyfileobj(src, out)
            if dst.lower().endswith('.zip') and zipfile.is_zipfile(dst):
                unpack(dst, dst[:-4])
                os.remove(dst)


def work(item, url):
    slug = item['slug']
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower() or '.zip'
    archive = os.path.join(SRC, 'downloads', 'piklab', slug + ext)
    fetch(url, archive)
    folder = os.path.join(SRC, 'fonts', 'piklab-' + slug)
    shutil.rmtree(folder, ignore_errors=True)
    unpack(archive, folder)
    rel = lambda p: os.path.relpath(p, SRC).replace('\\', '/')
    files = sorted(rel(os.path.join(d, n)) for d, _, names in os.walk(folder) for n in names)
    item['archive'] = [rel(archive)]
    item['files'] = files
    item['fontFiles'] = [f for f in files if f.lower().endswith(FONT_EXT)]
    if item.get('thumbUrl'):
        thumb = os.path.join(SRC, 'thumbs', 'piklab-' + slug + (os.path.splitext(urllib.parse.urlparse(item['thumbUrl']).path)[1] or '.jpg'))
        fetch(item['thumbUrl'], thumb)
        item['thumb'] = rel(thumb)
    item['status'] = 'ok' if item['fontFiles'] else 'no-font'


def main():
    items = json.load(open(LIST, encoding='utf-8'))
    links = {}
    for line in open(sys.argv[1], encoding='utf-8'):
        parts = line.strip().split('|')
        if len(parts) == 2:
            links[parts[0]] = parts[1]
        elif len(parts) == 4:  # dạng rút gọn: id|đường dẫn file|X-Amz-Date|chữ ký
            links[parts[0]] = SIGNED % (parts[1], parts[2][:8], parts[2], parts[3])  # đường dẫn đã mã hoá sẵn

    def safe(item):
        if item['id'] not in links:
            return
        try:
            work(item, links[item['id']])
        except Exception as e:
            item['status'] = 'error'
            item['note'] = str(e)[:200]
            print('LỖI', item['slug'], e)

    with ThreadPoolExecutor(6) as pool:
        list(pool.map(safe, items))
    json.dump(items, open(LIST, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    count = lambda s: sum(i.get('status') == s for i in items)
    print(f"{count('ok')} ok · {count('no-font')} không có file font · {count('error')} lỗi · {sum('status' not in i for i in items)} chưa tải")


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
