import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('manifest-blocker.js', root), 'utf8');
const preview = readFileSync(new URL('assets/preview.png', root)).toString('base64');
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const template = readFileSync(new URL('scripts/page-template.html', root), 'utf8');
const page = template.replace('__CODE__', () => escape(source)).replace('__PREVIEW__', preview);
writeFileSync(new URL('index.html', root), page);
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/index.html', root), page);
writeFileSync(new URL('dist/manifest-blocker.js', root), source);
console.log('copy page updated: manifest blocker: tralala edition');
