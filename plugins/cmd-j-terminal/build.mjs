// Embeds the vendored xterm files into client.js: `node build.mjs`.
import { readFileSync, writeFileSync } from 'node:fs';

const here = (path) => new URL(path, import.meta.url);
const strip = (code) => code.replace(/^\/\/# sourceMappingURL=.*$/gm, '');
const source = readFileSync(here('./client.src.js'), 'utf8');
const output = source
  .replace('/*__XTERM__*/', () => `${strip(readFileSync(here('./vendor/xterm.js'), 'utf8'))}\n`)
  .replace('/*__FIT__*/', () => `${strip(readFileSync(here('./vendor/addon-fit.js'), 'utf8'))}\n`)
  .replace('/*__XTERM_CSS__*/', () => JSON.stringify(readFileSync(here('./vendor/xterm.css'), 'utf8')));
writeFileSync(here('./client.js'), output);
console.log(`client.js: ${output.length} bytes`);
