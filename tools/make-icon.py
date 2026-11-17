#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成三国战棋启动图标（红金渐变 + 棋盘 + 战字）。需要 Pillow。"""
import os
from PIL import Image, ImageDraw, ImageFont

SIZES = {'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96,
         'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192}

FONT_CANDIDATES = [
    r'C:\Windows\Fonts\msyhbd.ttc',
    r'C:\Windows\Fonts\msyh.ttc',
    r'C:\Windows\Fonts\simhei.ttf',
]


def pick_font(px):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, px)
            except Exception:
                continue
    return ImageFont.load_default()


def render(size):
    s = 512
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # 红棕渐变圆角底
    top = (142, 31, 31)
    bottom = (43, 33, 24)
    grad = Image.new('RGBA', (s, s))
    gd = ImageDraw.Draw(grad)
    for y in range(s):
        t = y / s
        gd.line([(0, y), (s, y)], fill=(
            int(top[0] + (bottom[0] - top[0]) * t),
            int(top[1] + (bottom[1] - top[1]) * t),
            int(top[2] + (bottom[2] - top[2]) * t), 255))
    mask = Image.new('L', (s, s), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([8, 8, s - 8, s - 8], radius=110, fill=255)
    im.paste(grad, (0, 0), mask)

    # 棋盘格（3x3 内框）
    gold = (232, 200, 119, 235)
    inset = 68
    for i in range(4):
        p = inset + i * (s - 2 * inset) / 3
        d.line([(p, inset), (p, s - inset)], fill=gold, width=7)
        d.line([(inset, p), (s - inset, p)], fill=gold, width=7)
    d.rounded_rectangle([inset, inset, s - inset, s - inset], radius=18,
                        outline=gold, width=7)

    # 中央「战」字棋子
    cx, cy, r = s / 2, s / 2, 148
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(192, 57, 43, 255),
              outline=(245, 230, 200, 255), width=10)
    font = pick_font(190)
    d.text((cx, cy - 6), '战', font=font, fill=(245, 230, 200, 255),
           anchor='mm')

    return im.resize((size, size), Image.LANCZOS)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    res = os.path.join(os.path.dirname(here), 'android', 'res')
    for folder, size in SIZES.items():
        d = os.path.join(res, folder)
        os.makedirs(d, exist_ok=True)
        render(size).save(os.path.join(d, 'ic_launcher.png'), optimize=True)
        print('  %-16s %dx%d' % (folder, size, size))
    print('图标生成完毕')


if __name__ == '__main__':
    main()
