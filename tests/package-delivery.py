from pathlib import Path
from shutil import copyfile
from zipfile import ZipFile, ZIP_DEFLATED
import json

repo = Path(__file__).resolve().parents[1]
output = repo.parent
checks = output / 'character-v9-checks'
copies = {
    repo / 'docs/index.html': output / '指锅快跑.html',
    repo / 'docs/character.html': output / '指锅-三维人物预览.html',
    checks / 'game.png': output / '指锅快跑-新版游戏画面.png',
    checks / 'game-mobile.png': output / '指锅快跑-手机版.png',
    checks / 'top.png': output / '指锅快跑-俯视形体检查.png',
}
for source, target in copies.items():
    copyfile(source, target)

website = output / '指锅快跑-网站部署包.zip'
with ZipFile(website, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted((repo / 'docs').rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(repo / 'docs').as_posix())

source_zip = output / '指锅快跑-GitHub发布包.zip'
with ZipFile(source_zip, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(repo.rglob('*')):
        if path.is_file() and not any(p in {'.git', 'node_modules', '.openai', '.edgeone'} for p in path.relative_to(repo).parts) and not path.name.startswith('.env'):
            archive.write(path, path.relative_to(repo).as_posix())

manifest = [{'path': str(p), 'bytes': p.stat().st_size} for p in [*copies.values(), website, source_zip, output / '指锅-本人照片与游戏形态对照.png', output / '指锅-连续轮滑预览.gif', output / '指锅-新版发型八方向.png', output / '指锅-发型参考与修改效果.png']]
(checks / 'delivery.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print('Updated game, character preview, screenshots and both project archives.')
