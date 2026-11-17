# 为缺失头像的武将生成水墨风姓名字牌（ parchment 背景 + 王朝色环 + 名字末字大字）
import io, os, re
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, '..', 'assets', 'img', 'heroes')
os.makedirs(IMG, exist_ok=True)

src = io.open(os.path.join(HERE, '..', 'assets', 'js', 'data.js'), encoding='utf-8').read()
heroes = {}
for m in re.finditer(r"H\('([a-z]+)',\s*'([^']+)',\s*'([a-z]+)'", src):
    heroes[m.group(1)] = (m.group(2), m.group(3))

FACTION = {
    'shu': (43, 122, 74), 'wei': (47, 84, 150), 'wu': (166, 108, 28),
    'qun': (120, 100, 70), 'jin': (90, 90, 110), 'nan': (140, 70, 50),
}

FONT_PATHS = [
    r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\msyh.ttc',
    r'C:\Windows\Fonts\simhei.ttf', r'C:\Windows\Fonts\simsun.ttc',
]


def load_font(size):
    for p in FONT_PATHS:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def make(hid):
    name, fac = heroes[hid]
    ch = name[-1]
    fr, fg, fb = FACTION.get(fac, (120, 100, 70))
    S = 224
    im = Image.new('RGB', (S, S), (233, 222, 199))
    d = ImageDraw.Draw(im)
    # 羊皮纸渐变
    for y in range(S):
        t = y / S
        d.line([(0, y), (S, y)], fill=(int(236 - 26 * t), int(226 - 30 * t), int(203 - 36 * t)))
    # 宣纸噪点
    import random
    rnd = random.Random(hid)
    for _ in range(500):
        x, y = rnd.randrange(S), rnd.randrange(S)
        a = rnd.randint(6, 16)
        d.point((x, y), fill=(236 - a, 226 - a, 203 - a))
    # 墨圈（双环）
    cx, cy, R = S // 2, S // 2, 86
    for w, alpha in ((14, 60), (6, 120)):
        ring = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        rd = ImageDraw.Draw(ring)
        rd.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(40, 32, 22, alpha), width=w)
        ring = ring.filter(ImageFilter.GaussianBlur(2))
        im = Image.alpha_composite(im.convert('RGBA'), ring).convert('RGB')
    d = ImageDraw.Draw(im)
    # 大字
    font = load_font(104)
    bbox = d.textbbox((0, 0), ch, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]), ch, font=font, fill=(42, 34, 24))
    # 底部势力条
    d.rectangle([0, S - 22, S, S], fill=(fr, fg, fb))
    # 顶部小字（全名）
    font2 = load_font(26)
    bbox2 = d.textbbox((0, 0), name, font=font2)
    w2 = bbox2[2] - bbox2[0]
    d.text((cx - w2 / 2 - bbox2[0], 10), name, font=font2, fill=(90, 74, 50))
    im.save(os.path.join(IMG, hid + '.jpg'), 'JPEG', quality=86, optimize=True)
    return os.path.getsize(os.path.join(IMG, hid + '.jpg')) // 1024


missing = [hid for hid in heroes if not os.path.exists(os.path.join(IMG, hid + '.jpg'))]
print('缺失:', len(missing))
for hid in missing:
    kb = make(hid)
print('已生成', len(missing), '张字牌头像，示例大小', kb, 'KB')
