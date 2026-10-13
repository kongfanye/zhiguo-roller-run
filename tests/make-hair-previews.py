from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

repo = Path(__file__).resolve().parents[1]
output = repo.parent
checks = output / 'character-v9-checks'
bg = (232, 239, 243)
ink = (36, 52, 71)
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 25)
small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18)
labels = ['Front', 'Front right', 'Right side', 'Back right', 'Back', 'Back left', 'Left side', 'Front left']

atlas = Image.new('RGB', (1400, 1080), bg)
draw = ImageDraw.Draw(atlas)
draw.text((35, 20), 'Zhiguo · Loose auburn hair with a center part', font=font, fill=ink)
for i, label in enumerate(labels):
    frame = Image.open(checks / f'upper-{i}.png').convert('RGB').crop((275, 70, 900, 865))
    frame = ImageOps.contain(frame, (342, 455), Image.Resampling.LANCZOS)
    x, y = (i % 4) * 350, 65 + (i // 4) * 490
    atlas.paste(frame, (x + (350 - frame.width) // 2, y + 30))
    draw.text((x + 175, y + 3), label, font=small, fill=ink, anchor='mt')
draw.text((35, 1045), 'All eight views use the same 3D hairstyle; the version 8 face is retained.', font=small, fill=(97, 117, 127))
atlas.save(output / 'zhiguo-hair-eight-views.png')

comparison = Image.new('RGB', (1440, 850), bg)
draw = ImageDraw.Draw(comparison)
draw.text((32, 25), 'Reference and new hairstyle · Center part / Soft waves / Auburn hair', font=font, fill=ink)
source = Image.open(repo / 'assets/zhiguo-hair-reference-v9.jpg').convert('RGB').crop((620, 250, 1055, 900))
frames = [source] + [Image.open(checks / f'upper-{i}.png').convert('RGB').crop((285, 70, 895, 865)) for i in [0, 2, 4]]
for i, (label, frame) in enumerate(zip(['User reference photo', 'Updated · Front', 'Updated · Side', 'Updated · Back'], frames)):
    frame = ImageOps.contain(frame, (345, 655), Image.Resampling.LANCZOS)
    comparison.paste(frame, (i * 360 + (360 - frame.width) // 2, 115 + (655 - frame.height) // 2))
    draw.text((i * 360 + 180, 86), label, font=small, fill=(39, 106, 119), anchor='mt')
draw.text((32, 808), 'Face, anatomy and skating motion are retained; loose hair sways gently in motion.', font=small, fill=(97, 117, 127))
comparison.save(output / 'zhiguo-hair-reference-comparison.png')
print('Created reference comparison and eight-angle hair preview.')
