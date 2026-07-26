// A tiled, WhatsApp-style repeating background of faint SDR/sales-tool
// doodles (mail, target, funnel, briefcase…). Built as a real CSS
// background-image tile (not per-icon DOM nodes) so density is controlled
// by a single `tileSize` and stays crisp/cheap at any page length.

type Glyph = (color: string) => string;

const mail: Glyph = (c) => `
  <rect x="-14" y="-10" width="28" height="20" rx="2" fill="none" stroke="${c}" stroke-width="2.4"/>
  <path d="M -14 -10 L 0 3 L 14 -10" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
`;

const chatBubble: Glyph = (c) => `
  <rect x="-14" y="-11" width="28" height="18" rx="6" fill="none" stroke="${c}" stroke-width="2.4"/>
  <path d="M -6 7 L -9 15 L 1 7 Z" fill="${c}"/>
`;

const target: Glyph = (c) => `
  <circle r="13" fill="none" stroke="${c}" stroke-width="2.2"/>
  <circle r="8" fill="none" stroke="${c}" stroke-width="2.2"/>
  <circle r="2.4" fill="${c}"/>
`;

const barChart: Glyph = (c) => `
  <rect x="-12" y="6" width="6" height="8" fill="${c}"/>
  <rect x="-2" y="-2" width="6" height="16" fill="${c}"/>
  <rect x="8" y="-9" width="6" height="23" fill="${c}"/>
`;

const dollar: Glyph = (c) => `
  <text x="0" y="8" font-size="27" font-weight="700" font-family="Arial, sans-serif" text-anchor="middle" fill="${c}">$</text>
`;

const briefcase: Glyph = (c) => `
  <rect x="-14" y="-6" width="28" height="18" rx="2" fill="none" stroke="${c}" stroke-width="2.4"/>
  <rect x="-6" y="-12" width="12" height="7" rx="1.5" fill="none" stroke="${c}" stroke-width="2.2"/>
  <line x1="-14" y1="3" x2="14" y2="3" stroke="${c}" stroke-width="2"/>
`;

const building: Glyph = (c) => `
  <rect x="-10" y="-16" width="20" height="32" fill="none" stroke="${c}" stroke-width="2.2"/>
  <rect x="-7" y="-12" width="4" height="4" fill="${c}"/>
  <rect x="3" y="-12" width="4" height="4" fill="${c}"/>
  <rect x="-7" y="-4" width="4" height="4" fill="${c}"/>
  <rect x="3" y="-4" width="4" height="4" fill="${c}"/>
  <rect x="-7" y="4" width="4" height="4" fill="${c}"/>
  <rect x="3" y="4" width="4" height="4" fill="${c}"/>
`;

const funnel: Glyph = (c) => `
  <path d="M -13 -12 L 13 -12 L 3 4 L 3 14 L -3 14 L -3 4 Z" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round"/>
`;

const calendar: Glyph = (c) => `
  <rect x="-13" y="-11" width="26" height="24" rx="2" fill="none" stroke="${c}" stroke-width="2.2"/>
  <line x1="-13" y1="-4" x2="13" y2="-4" stroke="${c}" stroke-width="2"/>
  <line x1="-7" y1="-15" x2="-7" y2="-9" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="7" y1="-15" x2="7" y2="-9" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="-6" cy="4" r="1.6" fill="${c}"/>
  <circle cx="0" cy="4" r="1.6" fill="${c}"/>
  <circle cx="6" cy="4" r="1.6" fill="${c}"/>
`;

const trendingUp: Glyph = (c) => `
  <polyline points="-14,10 -4,-2 4,4 14,-12" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 6 -12 L 14 -12 L 14 -4" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
`;

const megaphone: Glyph = (c) => `
  <path d="M -14 -4 L -2 -10 L -2 10 L -14 4 Z" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round"/>
  <rect x="-19" y="-3" width="5" height="6" fill="${c}"/>
  <path d="M 4 -6 Q 11 0 4 6" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
`;

const star: Glyph = (c) => `
  <polygon points="0,-14 3.3,-4.3 13.3,-4.3 5.5,1.7 8.5,11.3 0,5.4 -8.5,11.3 -5.5,1.7 -13.3,-4.3 -3.3,-4.3" fill="${c}"/>
`;

const search: Glyph = (c) => `
  <circle cx="-2" cy="-2" r="9" fill="none" stroke="${c}" stroke-width="2.4"/>
  <line x1="5" y1="5" x2="13" y2="13" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>
`;

const network: Glyph = (c) => `
  <circle cx="-6" cy="0" r="7" fill="none" stroke="${c}" stroke-width="2.2"/>
  <circle cx="6" cy="0" r="7" fill="none" stroke="${c}" stroke-width="2.2"/>
`;

const send: Glyph = (c) => `
  <polygon points="-14,-10 14,0 -14,10 -6,0" fill="${c}"/>
`;

const qualified: Glyph = (c) => `
  <circle r="13" fill="none" stroke="${c}" stroke-width="2.2"/>
  <path d="M -6 0 L -2 5 L 7 -6" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
`;

const GLYPHS: Glyph[] = [
  mail, chatBubble, target, barChart, dollar, briefcase, building, funnel,
  calendar, trendingUp, megaphone, star, search, network, send, qualified,
];

function seeded(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

const TILE = 300;
const GRID = 6; // 6x6 = 36 glyphs per tile (cycling the 16 designs) — dense, WhatsApp-wallpaper-like

function buildTileSvg(color: string): string {
  const cell = TILE / GRID;
  const groups: string[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const i = row * GRID + col;
      const seed = i * 12.9898 + 3;
      const glyph = GLYPHS[i % GLYPHS.length];
      const cx = col * cell + cell / 2 + (seeded(seed) - 0.5) * cell * 0.4;
      const cy = row * cell + cell / 2 + (seeded(seed + 1) - 0.5) * cell * 0.4;
      const rotate = (seeded(seed + 2) - 0.5) * 50;
      const scale = 0.75 + seeded(seed + 3) * 0.5;
      groups.push(
        `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${rotate.toFixed(1)}) scale(${scale.toFixed(2)})">${glyph(color)}</g>`
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">${groups.join("")}</svg>`;
}

export function wallpaperDataUri(color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(buildTileSvg(color))}`;
}

export const WALLPAPER_TILE_PX = TILE;
