from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont, ImageOps

repo = Path(__file__).resolve().parents[1]
output = repo.parent
checks = output / 'character-v9-checks'
bg = (232, 239, 243)
canvas = Image.new('RGB', (1200, 690), bg)
draw = ImageDraw.Draw(canvas)
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 25)
small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 17)
draw.text((32, 25), '指锅 · 本人照片与三维游戏形态', font=font, fill=(36, 52, 71))
bounds = json.loads((checks / 'face-bounds.json').read_text())
source = Image.open(repo / 'assets/zhiguo-identity-v8.jpg').crop((565, 198, 797, 474)).convert('RGB')
images = [source] + [Image.open(checks / f'face-{i}.png').crop(bounds[str(i)]).convert('RGB') for i in [0, 1]]
for i, (label, image) in enumerate(zip(['本人原照片', '新人物 · 正面', '新人物 · 右前方'], images)):
    image = ImageOps.contain(image, (350, 515), Image.Resampling.LANCZOS)
    x = i * 400 + (400 - image.width) // 2
    canvas.paste(image, (x, 100 + (515 - image.height) // 2))
    draw.text((i * 400 + 200, 77), label, font=small, fill=(39, 106, 119), anchor='mt')
draw.text((32, 652), '面部保持第八版；发型调整为红棕色中分披发。', font=small, fill=(97, 117, 127))
canvas.save(output / '指锅-本人照片与游戏形态对照.png')
print('Created original-photo / real-3D-render comparison.')
