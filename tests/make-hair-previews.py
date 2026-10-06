from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

repo = Path(__file__).resolve().parents[1]
output = repo.parent
checks = output / 'character-v9-checks'
bg = (232, 239, 243)
ink = (36, 52, 71)
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 25)
small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18)
labels = ['正面', '右前方', '右侧面', '右后方', '背面', '左后方', '左侧面', '左前方']

atlas = Image.new('RGB', (1400, 1080), bg)
draw = ImageDraw.Draw(atlas)
draw.text((35, 20), '指锅 · 红棕色中分披发', font=font, fill=ink)
for i, label in enumerate(labels):
    frame = Image.open(checks / f'upper-{i}.png').convert('RGB').crop((275, 70, 900, 865))
    frame = ImageOps.contain(frame, (342, 455), Image.Resampling.LANCZOS)
    x, y = (i % 4) * 350, 65 + (i // 4) * 490
    atlas.paste(frame, (x + (350 - frame.width) // 2, y + 30))
    draw.text((x + 175, y + 3), label, font=small, fill=ink, anchor='mt')
draw.text((35, 1045), '八个视角使用同一个三维发型；面部保持第八版原样。', font=small, fill=(97, 117, 127))
atlas.save(output / '指锅-新版发型八方向.png')

comparison = Image.new('RGB', (1440, 850), bg)
draw = ImageDraw.Draw(comparison)
draw.text((32, 25), '参考照片与新发型 · 中分披发 / 微卷发尾 / 红棕发色', font=font, fill=ink)
source = Image.open(repo / 'assets/zhiguo-hair-reference-v9.jpg').convert('RGB').crop((620, 250, 1055, 900))
frames = [source] + [Image.open(checks / f'upper-{i}.png').convert('RGB').crop((285, 70, 895, 865)) for i in [0, 2, 4]]
for i, (label, frame) in enumerate(zip(['用户参考照片', '修改后 · 正面', '修改后 · 侧面', '修改后 · 背面'], frames)):
    frame = ImageOps.contain(frame, (345, 655), Image.Resampling.LANCZOS)
    comparison.paste(frame, (i * 360 + (360 - frame.width) // 2, 115 + (655 - frame.height) // 2))
    draw.text((i * 360 + 180, 86), label, font=small, fill=(39, 106, 119), anchor='mt')
draw.text((32, 808), '面部、人体与轮滑动作保持原样，披发在运动时轻微摆动。', font=small, fill=(97, 117, 127))
comparison.save(output / '指锅-发型参考与修改效果.png')
print('Created reference comparison and eight-angle hair preview.')
