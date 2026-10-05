import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';

const minify = !process.argv.includes('--dev');
const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify,
  write: false,
  target: ['es2020'],
  legalComments: 'none',
  logLevel: 'warning',
});
let js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
let html = readFileSync('index.template.html', 'utf8');
const og = process.env.OG_IMAGE ? `<meta property="og:image" content="${process.env.OG_IMAGE}" />` : '';
html = html.replace('<!--OG_IMAGE-->', og).replace('/*APP_JS*/', () => js);
mkdirSync('docs', { recursive: true });
writeFileSync('docs/index.html', html);
console.log(`docs/index.html ${(html.length / 1024).toFixed(1)} KB (js ${(js.length / 1024).toFixed(1)} KB)`);

cpSync('assets', 'docs/assets', {recursive:true});
writeFileSync('docs/.nojekyll','');
cpSync('THIRD-PARTY-NOTICES.md','docs/THIRD-PARTY-NOTICES.md');
cpSync('MAKEHUMAN-ASSET-LICENSE.md','docs/MAKEHUMAN-ASSET-LICENSE.md');
