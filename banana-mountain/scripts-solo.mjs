// Fügt JS und CSS der Solo-Version in eine einzige HTML-Datei ein
import fs from 'fs';
import path from 'path';
const dir = 'dist-solo';
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const js = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+)"><\/script>/);
const css = html.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+)">/);
const code = fs.readFileSync(path.join(dir, js[1]), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = css ? fs.readFileSync(path.join(dir, css[1]), 'utf8') : '';
const font = style.match(/@import url\([^)]*\);?/);
const out = [
  '<title>Banana Mountain</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<meta name="theme-color" content="#1b1f27">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">',
  '<style>' + style.replace(font ? font[0] : '', '') + '</style>',
  '<div id="root"></div>',
  '<script type="module">' + code + '</script>',
].join('\n');
fs.writeFileSync('banana-mountain-solo.html', out);
console.log('banana-mountain-solo.html', (out.length / 1024 / 1024).toFixed(2), 'MB');

// Gleiche Datei auch für die Android-App (mit vollständigem HTML-Gerüst)
const androidAssets = path.join('android', 'app', 'src', 'main', 'assets');
if (fs.existsSync(path.join('android', 'app'))) {
  fs.mkdirSync(androidAssets, { recursive: true });
  const page = '<!doctype html><html lang="de"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">'
    + '<style>html,body{margin:0;height:100%;background:#1b1f27;overflow:hidden}</style></head><body>'
    + out + '</body></html>';
  fs.writeFileSync(path.join(androidAssets, 'index.html'), page);
  console.log('android/app/src/main/assets/index.html geschrieben');
}
