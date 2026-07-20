// Generator ikon PWA. Buduje rysunek SVG (tło z gradientem + słupki + linia trendu)
// i zapisuje go jako pliki PNG w różnych rozmiarach za pomocą biblioteki sharp.
// Uruchomienie:  node scripts/gen-icons.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// Zawartość ikony (słupki + linia trendu) w układzie 512x512.
function content() {
  return `
    <g fill="#ffffff">
      <rect x="118" y="288" width="64" height="120" rx="16"/>
      <rect x="224" y="224" width="64" height="184" rx="16"/>
      <rect x="330" y="150" width="64" height="258" rx="16"/>
    </g>
    <polyline points="112,244 214,196 318,214 406,116" fill="none"
      stroke="#ffffff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
    <circle cx="406" cy="116" r="20" fill="#ffffff"/>`;
}

// Buduje pełny SVG. fullBleed=true -> tło wypełnia cały kwadrat (bez zaokrągleń, dla maskable/iOS).
// contentScale skaluje zawartość względem środka (dla maskable trzymamy ją w strefie bezpiecznej).
function buildSVG({ fullBleed, contentScale = 1 }) {
  const bg = fullBleed
    ? `<rect width="512" height="512" fill="url(#g)"/>`
    : `<rect width="512" height="512" rx="112" fill="url(#g)"/>`;
  const s = contentScale;
  const shift = 256 * (1 - s);
  const inner = s === 1 ? content() : `<g transform="translate(${shift} ${shift}) scale(${s})">${content()}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#a855f7"/>
        <stop offset="1" stop-color="#ec4899"/>
      </linearGradient>
    </defs>
    ${bg}
    ${inner}
  </svg>`;
}

async function png(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(OUT, file));
  console.log('  zapisano', file);
}

(async () => {
  const rounded = buildSVG({ fullBleed: false });
  const solid = buildSVG({ fullBleed: true });
  const maskable = buildSVG({ fullBleed: true, contentScale: 0.78 });

  await png(rounded, 192, 'icon-192.png');
  await png(rounded, 512, 'icon-512.png');
  await png(maskable, 512, 'icon-maskable-512.png');
  await png(solid, 180, 'icon-180.png');
  console.log('Gotowe.');
})();
