// Generates the app icon as SVG markup. `bg` = draw the rounded background,
// `scale` shrinks the artwork (used for Android adaptive-icon foregrounds).
export function iconSvg({ bg = true, scale = 1, radius = 112 } = {}) {
    const cx = 256, cy = 238, r = 138;
    const beads = [];
    const total = 30;
    for (let i = 0; i < total; i++) {
        const a = Math.PI / 2 + (i / total) * Math.PI * 2;
        if (i === 0 || i === 1 || i === total - 1) continue; // gap for the tassel at the bottom
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        beads.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13.5" fill="url(#bead)"/>`);
    }
    // Crescent: a gold disc with an offset disc cut out of it, opening to the upper-left.
    const crescent = (R, shift = 0) => {
        const r = R * 0.82, dx = -R * 0.42, dy = -R * 0.26;
        const x = cx + shift;
        return `<mask id="moon"><rect width="512" height="512" fill="#000"/>
            <circle cx="${x}" cy="${cy}" r="${R}" fill="#fff"/>
            <circle cx="${x + dx}" cy="${cy + dy}" r="${r}" fill="#000"/></mask>
            <circle cx="${x}" cy="${cy}" r="${R}" fill="url(#gold)" mask="url(#moon)"/>`;
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bgg" cx="50%" cy="30%" r="80%">
      <stop offset="0" stop-color="#136048"/><stop offset=".6" stop-color="#0a3327"/><stop offset="1" stop-color="#051a13"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6e2b0"/><stop offset=".5" stop-color="#d8b46a"/><stop offset="1" stop-color="#a97f35"/>
    </linearGradient>
    <radialGradient id="bead" cx="35%" cy="30%" r="75%">
      <stop offset="0" stop-color="#fff3d1"/><stop offset=".45" stop-color="#e2bf74"/><stop offset="1" stop-color="#94692a"/>
    </radialGradient>
  </defs>
  ${bg ? `<rect width="512" height="512" rx="${radius}" fill="url(#bgg)"/>` : ''}
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    ${beads.join('\n    ')}
    <path d="M256 ${cy + r - 6} v36" stroke="url(#gold)" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="256" cy="${cy + r + 44}" rx="17" ry="22" fill="url(#bead)"/>
    <path d="M246 ${cy + r + 62} l-12 44 M256 ${cy + r + 64} v46 M266 ${cy + r + 62} l12 44" stroke="url(#gold)" stroke-width="6" stroke-linecap="round"/>
    ${crescent(70, -10)}
  </g>
</svg>`;
}
