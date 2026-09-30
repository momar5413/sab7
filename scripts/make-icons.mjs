// Renders PNG icons (web + Android) from scripts/icon.svg.mjs using Playwright's Chromium.
// Usage: node scripts/make-icons.mjs   (needs `playwright` available, e.g. globally)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { iconSvg } from './icon.svg.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch {
    playwright = require(`${execSync('npm root -g').toString().trim()}/playwright`);
}

const browser = await playwright.chromium.launch();
const page = await browser.newPage();

async function render(svg, size, out, { transparent = true } = {}) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
    mkdirSync(out.substring(0, out.lastIndexOf('/')), { recursive: true });
    writeFileSync(out, await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } }));
}

// Web / PWA
await render(iconSvg(), 192, 'icons/icon-192.png');
await render(iconSvg(), 512, 'icons/icon-512.png');
await render(iconSvg({ radius: 0, scale: 0.78 }), 512, 'icons/icon-maskable-512.png');

// Android launcher icons
const res = 'android/app/src/main/res';
if (existsSync(res)) {
    const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
    for (const [d, f] of Object.entries(dens)) {
        await render(iconSvg({ radius: 96 }), Math.round(48 * f), `${res}/mipmap-${d}/ic_launcher.png`);
        await render(iconSvg({ radius: 256 }), Math.round(48 * f), `${res}/mipmap-${d}/ic_launcher_round.png`);
        // Adaptive foreground: 108dp canvas, artwork kept inside the 66dp safe zone.
        await render(iconSvg({ bg: false, scale: 0.6 }), Math.round(108 * f), `${res}/mipmap-${d}/ic_launcher_foreground.png`);
    }
    // Splash (Android 12+ shows the launcher icon; older versions use this image).
    await render(iconSvg({ bg: false, scale: 0.9 }), 288, `${res}/drawable-nodpi/splash_logo.png`);
}

await browser.close();
console.log('icons generated');
