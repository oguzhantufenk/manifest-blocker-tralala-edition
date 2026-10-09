import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('manifest-blocker.js', root), 'utf8');
const preview = readFileSync(new URL('assets/preview.png', root)).toString('base64');
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const template = readFileSync(new URL('scripts/page-template.html', root), 'utf8');
writeFileSync(new URL('index.html', root), template.replace('__CODE__', () => escape(source)).replace('__PREVIEW__', preview));
console.log('copy page updated: manifest blocker: tralala edition');
