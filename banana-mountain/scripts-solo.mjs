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
