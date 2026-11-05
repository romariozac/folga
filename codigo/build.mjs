// Gera dist/: um index.html autossuficiente (CSS, JS e fonte embutidos) + arquivos do PWA.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const src = (p) => path.join(root, 'src', p);
const out = path.join(root, 'dist');

const js = await build({
  entryPoints: [src('js/app.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'chrome90', 'safari15'],
  write: false,
  minify: true,
  legalComments: 'none',
});
const code = js.outputFiles[0].text;
if (code.includes('</script')) throw new Error('o JS contém "</script"');

const font = fs.readFileSync(src('fonts/bricolage-grotesque.woff2')).toString('base64');
const fontCss = `@font-face{font-family:'Bricolage';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:200 800;font-stretch:75% 100%;font-display:swap}`;
const css = fs.readFileSync(src('styles.css'), 'utf8');

let html = fs.readFileSync(src('index.html'), 'utf8');
html = html.replace('<!--INLINE_CSS-->', () => `<style>${fontCss}\n${css}</style>`);
html = html.replace('<!--INLINE_JS-->', () => `<script>${code}</script>`);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);

const version = Date.now().toString(36);
fs.writeFileSync(path.join(out, 'sw.js'), fs.readFileSync(src('sw.js'), 'utf8').replace('__VERSION__', version));
fs.copyFileSync(src('manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));
for (const f of fs.readdirSync(src('icons'))) fs.copyFileSync(src('icons/' + f), path.join(out, 'icons', f));
// vendor/: leitor de PDF (pdf.js) e, em vendor/ocr/, o leitor de prints (Tesseract.js)
fs.cpSync(src('vendor'), path.join(out, 'vendor'), { recursive: true });
fs.copyFileSync(src('fonts/OFL-LICENSE.txt'), path.join(out, 'FONT-LICENSE.txt'));

console.log(`dist/index.html ${(html.length / 1024).toFixed(0)} KB · versão ${version}`);
