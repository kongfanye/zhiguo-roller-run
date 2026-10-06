from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

output = Path(__file__).resolve().parents[2]
checks = output / 'character-v9-checks'
bg = (232, 239, 243)
atlas = Image.new('RGB', (1400, 1200), bg)
draw = ImageDraw.Draw(atlas)
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 24)
labels = ['正面', '右前方', '右侧面', '右后方', '背面', '左后方', '左侧面', '左前方']
for i, label in enumerate(labels):
    image = Image.open(checks / f'view-{i}.png').convert('RGB')
    image = image.crop((250, 0, 900, 1024)).resize((350, 551), Image.Resampling.LANCZOS)
    x, y = (i % 4) * 350, (i // 4) * 600
    atlas.paste(image, (x, y + 43))
    draw.text((x + 175, y + 12), label, font=font, fill=(36, 52, 71), anchor='mt')
atlas.save(output / '指锅-新版八方向.png')

# The actual 3D render supplies the game's transparent introduction thumbnail.
thumbnail = Image.open(checks / 'front-thumbnail.png').convert('RGBA')
bounds = thumbnail.getbbox()
if bounds:
    thumbnail = thumbnail.crop(bounds)
thumbnail.thumbnail((480, 720), Image.Resampling.LANCZOS)
thumbnail.save(output / 'zhiguo-github' / 'assets' / 'zhiguo-front-v9.webp', quality=94, method=6)

frames = [Image.open(p).convert('RGB').crop((275, 45, 875, 1005)).resize((420, 672), Image.Resampling.LANCZOS)
          for p in sorted((checks / 'frames').glob('*.png'))]
sample = Image.new('RGB', (840, 672), bg)
for i, frame in enumerate(frames[::3]):
    sample.paste(frame.resize((210, 168)), ((i % 4) * 210, (i // 4) * 168))
palette = sample.quantize(colors=256)
frames = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
frames[0].save(output / '指锅-连续轮滑预览.gif', save_all=True, append_images=frames[1:], duration=32, loop=0, disposal=2, optimize=False)
print(f'Created eight-view atlas and {len(frames)}-frame looping gait preview.')
