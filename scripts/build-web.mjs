// Copies the static web app into www/ (Capacitor's webDir).
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const OUT = 'www';
const ENTRIES = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'img', 'fonts', 'icons'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const entry of ENTRIES) cpSync(entry, `${OUT}/${entry}`, { recursive: true });
console.log(`Copied ${ENTRIES.length} entries to ${OUT}/`);
