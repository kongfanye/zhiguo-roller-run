import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';

const minify = !process.argv.includes('--dev');
const define={__ZHIGUO_FACE_URL__:JSON.stringify('data:image/jpeg;base64,'+readFileSync('assets/zhiguo-identity-v8.jpg').toString('base64'))};
const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify,
  write: false,
  target: ['es2020'],
  legalComments: 'none',
  define,
  logLevel: 'warning',
});
let js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
let html = readFileSync('index.template.html', 'utf8');
const og = process.env.OG_IMAGE ? `<meta property="og:image" content="${process.env.OG_IMAGE}" />` : '';
html = html.replace('<!--OG_IMAGE-->', og).replace('/*APP_JS*/', () => js);
for (const [asset, mime] of [['zhiguo-cover-photo-v10.png', 'image/png'], ['kongfanye-avatar.jpg', 'image/jpeg']]) {
  html=html.replace(`src="./assets/${asset}"`, `src="data:${mime};base64,${readFileSync('assets/'+asset).toString('base64')}"`);
}
mkdirSync('docs', { recursive: true });
writeFileSync('docs/index.html', html);
console.log(`docs/index.html ${(html.length / 1024).toFixed(1)} KB (js ${(js.length / 1024).toFixed(1)} KB)`);

const studio=await build({entryPoints:['src/character-preview.js'],bundle:true,format:'iife',minify,write:false,target:['es2020'],legalComments:'none',define,logLevel:'warning'});
const studioJs=studio.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
writeFileSync('docs/character.html',readFileSync('character.template.html','utf8').replace('/*APP_JS*/',()=>studioJs));
console.log('docs/character.html: interactive eight-view character and motion preview');

cpSync('assets', 'docs/assets', {recursive:true});
writeFileSync('docs/.nojekyll','');
cpSync('THIRD-PARTY-NOTICES.md','docs/THIRD-PARTY-NOTICES.md');
cpSync('MAKEHUMAN-ASSET-LICENSE.md','docs/MAKEHUMAN-ASSET-LICENSE.md');
