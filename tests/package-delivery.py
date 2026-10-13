from pathlib import Path
from shutil import copyfile
from zipfile import ZipFile, ZIP_DEFLATED
import json

repo = Path(__file__).resolve().parents[1]
output = repo.parent
checks = output / 'character-v9-checks'
copies = {
    repo / 'docs/index.html': output / 'zhiguo-roller-run.html',
    repo / 'docs/character.html': output / 'zhiguo-character-preview.html',
    checks / 'game.png': output / 'zhiguo-game-preview.png',
    checks / 'game-mobile.png': output / 'zhiguo-mobile-preview.png',
    checks / 'top.png': output / 'zhiguo-top-view-check.png',
}
for source, target in copies.items():
    copyfile(source, target)

website = output / 'zhiguo-website.zip'
with ZipFile(website, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted((repo / 'docs').rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(repo / 'docs').as_posix())

source_zip = output / 'zhiguo-source.zip'
with ZipFile(source_zip, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(repo.rglob('*')):
        if path.is_file() and not any(p in {'.git', 'node_modules', '.openai', '.edgeone'} for p in path.relative_to(repo).parts) and not path.name.startswith('.env'):
            archive.write(path, path.relative_to(repo).as_posix())

manifest = [{'path': str(p), 'bytes': p.stat().st_size} for p in [*copies.values(), website, source_zip, output / 'zhiguo-photo-character-comparison.png', output / 'zhiguo-skating-preview.gif', output / 'zhiguo-hair-eight-views.png', output / 'zhiguo-hair-reference-comparison.png']]
(checks / 'delivery.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print('Updated game, character preview, screenshots and both project archives.')
