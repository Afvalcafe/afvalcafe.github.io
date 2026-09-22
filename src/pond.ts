// Pixel-art pond: ducks, water lilies, coots, swans, algae that get temporary trails and clickable litter.
// Everything is drawn on a low-resolution canvas and scaled up with CSS (pixelated).

import '@fontsource/press-start-2p';
import '@fontsource/eb-garamond/500.css';
import './pond.css';
import './menu';
import { pondScale } from './pixel';
import { createRafts } from './rafts';
import { confetti } from './confetti';

const DUCK_COUNT = 4;
const COOT_COUNT = 4;
const SWAN_COUNT = 2;
const LITTER_COUNT = 16;
// Water lilies float around slowly; click one and a white flower blooms for a while.
const PAD_SPRITES = ['waterlelie', 'waterlelie', 'waterlelie', 'waterlelie', 'lelieblad', 'lelieblad', 'lelieblad2', 'lelieblad2'];
const MAX_PER_KIND = 3; // nooit meer dan 3 van hetzelfde soort afval tegelijk
const MILESTONE_FIRST = 10; // eerste melding bij 10, daarna na elke 20 extra (30, 50, ...)
const MILESTONE_EVERY = 20;
// Messages get more and more enthusiastic, then loop back to the start ({n} = number collected).
const MILESTONE_MESSAGES = [
  'Wauw wat ben jij hier goed in! Doe je mee met de volgende Afval & Café?',
  'Al {n} stuks afval opgeruimd?! Wij hebben jou echt nodig in ons team!',
  '{n} stuks! Zo help je de Delftse natuur echt vooruit. Kom eens meeprikken!',
  '{n} al?! Jij hoort gewoon bij Afval & Café. Kom een keer mee prikken!',
  'Onvoorstelbaar: {n} stuks! Jij bent de afvalkampioen van de gracht. Kom langs!',
];
const TOAST_SECONDS = 15; // sluit vanzelf, of eerder met het kruisje
const BLOOM_SECONDS = 8; // zo lang blijft een bloem staan
const ALGAE_REGROW = 0.18; // dekking per seconde
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const WATER = ['#3b8bb0', '#3f92b6', '#4599bd'];
const ALGAE = ['#2f6b2a', '#3f8232', '#519a3a', '#69b045', '#86c452'];
// All litter is 16x16 so it's the same size.
const LITTER_SPRITES = ['zak', 'batterij', 'schoen', 'fles', 'beker', 'chips', 'sigaret'];
// After clicking a cigarette butt or battery, the nearest duck sometimes shares a fact. One list per kind of litter.
// Figures are estimates from common sources; hence "can" and "may" in the Dutch text.
const FACT_SECONDS = 7;
const FACT_CHANCE = 0.35; // kans per klik, zodat het speciaal blijft
const FACTS: Record<string, string[]> = {
  sigaret: [
    'Eén sigarettenpeuk kan tot wel 1000 liter water vervuilen!',
    'Een peuk ligt 12 tot 15 jaar in het water. Het filter is namelijk plastic!',
    'Er zijn peuken gevonden in de magen van vissen en vogels. Niet lekker!',
  ],
  batterij: [
    'Sommige stoffen in batterijen zijn schadelijk voor de natuur. Lever hem in!',
    'Winkels die batterijen verkopen, moeten lege batterijen terugnemen!',
    'Uit lege batterijen worden nikkel en koper teruggewonnen voor nieuwe batterijen!',
  ],
};

interface Rect { x0: number; y0: number; x1: number; y1: number }
interface Bubble { text: string; age: number }
interface Duck {
  img: HTMLImageElement;
  words: string[];
  x: number; y: number; angle: number; turn: number; speed: number; phase: number;
  bubble: Bubble | null;
}
interface Litter { img: HTMLImageElement; x: number; y: number; vx: number; vy: number; phase: number; bloom?: number }
interface Sparkle { x: number; y: number; age: number }

const canvas = document.getElementById('pond') as HTMLCanvasElement | null;
if (canvas) {
  void start(canvas);
}

function loadSprite(name: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`sprite ${name} niet gevonden`));
    img.src = `${import.meta.env.BASE_URL}sprites/${name}.png`;
  });
}

// '#rrggbb' -> 0xAABBGGRR (little-endian ImageData)
function abgr(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
}

const isMilestone = (n: number) => n === MILESTONE_FIRST || (n > MILESTONE_FIRST && (n - MILESTONE_FIRST) % MILESTONE_EVERY === 0);

// Toast with email address and a close button. Closes itself after TOAST_SECONDS; confetti falls during the first few seconds.
function showToast(n: number) {
  document.querySelector('.toast')?.remove();
  const index = n === MILESTONE_FIRST ? 0 : (n - MILESTONE_FIRST) / MILESTONE_EVERY;
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Bericht van Afval & Café');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Sluiten');
  close.textContent = 'X';
  const text = document.createElement('p');
  text.textContent = MILESTONE_MESSAGES[index % MILESTONE_MESSAGES.length].replace('{n}', String(n));
  const link = document.createElement('a');
  link.className = 'toast-link';
  link.href = `${import.meta.env.BASE_URL}doe-mee.html`;
  link.textContent = 'Doe mee!';
  el.append(close, text, link);
  document.body.appendChild(el);

  const timers: number[] = [];
  for (let s = 0; s < 6; s += 2) timers.push(window.setTimeout(() => confetti(60), s * 1000));
  const sluit = () => {
    timers.forEach(clearTimeout);
    document.removeEventListener('keydown', onKey);
    el.classList.add('toast-out');
    window.setTimeout(() => el.remove(), 400);
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && sluit();
  document.addEventListener('keydown', onKey);
  close.addEventListener('click', sluit);
  timers.push(window.setTimeout(sluit, TOAST_SECONDS * 1000));
}

// Sprites are written into the pixel buffer in software (no drawImage): no resampling by
// the GPU, so no half pixels or missing columns, and the whole frame goes to the screen in one go.
interface Bitmap { w: number; h: number; px: Uint32Array }
const bitmapCache = new Map<HTMLImageElement, { normal: Bitmap; flipped: Bitmap }>();

function bitmapsOf(img: HTMLImageElement) {
  let b = bitmapCache.get(img);
  if (!b) {
    const w = img.width;
    const h = img.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true })!;
    cx.drawImage(img, 0, 0);
    const px = new Uint32Array(cx.getImageData(0, 0, w, h).data.buffer);
    const flipped = new Uint32Array(px.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) flipped[y * w + x] = px[y * w + (w - 1 - x)];
    b = { normal: { w, h, px }, flipped: { w, h, px: flipped } };
    bitmapCache.set(img, b);
  }
  return b;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// Small 3x5 pixel font for the speech bubbles (W is 5 wide).
const GLYPHS: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  C: ['111', '100', '100', '100', '111'],
  E: ['111', '100', '110', '100', '111'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  K: ['101', '101', '110', '101', '101'],
  O: ['111', '101', '101', '101', '111'],
  P: ['111', '101', '111', '100', '100'],
  Q: ['111', '101', '101', '111', '001'],
  S: ['111', '100', '111', '001', '111'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  W: ['10001', '10001', '10101', '11011', '10001'],
  '!': ['1', '1', '1', '0', '1'],
  ' ': ['00', '00', '00', '00', '00'],
};
const INK = '#16301a';
const DUCK_WORDS = ['KWAK KWAK!'];
const COOT_WORDS = ['KEP!', 'KOEK!', 'KEP KEP!'];
const SWAN_WORDS = ['HISS!', 'SSS!', 'PSST!'];
const BUBBLE_SECONDS = 1.4;

async function start(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  const [duckImg, cootImg, swanImg, sparkleImg, bloomImg, budImg, logImg, ...loaded] = await Promise.all([
    loadSprite('eend'),
    loadSprite('meerkoet'),
    loadSprite('zwaan'),
    loadSprite('sparkles'),
    loadSprite('bloem'),
    loadSprite('knop'),
    loadSprite('boomstam'),
    ...LITTER_SPRITES.map(loadSprite),
    ...[...new Set(PAD_SPRITES)].map(loadSprite),
  ]);

  const litterImgs = loaded.slice(0, LITTER_SPRITES.length);
  const padByName = new Map([...new Set(PAD_SPRITES)].map((n, i) => [n, loaded[LITTER_SPRITES.length + i]]));

  const water = WATER.map(abgr);
  const algae = ALGAE.map(abgr);
  const counter = document.getElementById('litter-count');
  // Calm pond (afvalpaspoort): no litter to click, and the birds also swim underneath the page content.
  const calmPond = document.body.dataset.pond === 'calm';
  const solid = (calmPond ? ['.pond-menu'] : ['main', '.pond-menu']).map((q) => document.querySelector(q)).filter(
    (el): el is Element => el !== null,
  );

  let scale = 4;
  let W = 0;
  let H = 0; // hoogte van het scherm in pond-pixels
  let WH = 0; // height of the pond: taller than the screen on the gallery, where the page then scrolls through it
  // Texture space (TW x TH) is tileable and slowly scrolls underneath the screen.
  let TW = 0;
  let TH = 0;
  let cover = new Float32Array(0); // schermruimte: 1 = vol algen, 0 = schoon water
  let dens = new Float32Array(0); // maximale dichtheid per pixel (vlekken)
  let thr = new Float32Array(0); // dither-drempel per pixel
  let tone = new Float32Array(0); // kleurwaarde per pixel, 0..1
  let tonePhase = new Uint8Array(0); // gebied (0..15) dat op eigen tempo van kleur wisselt
  let waterColor = new Uint32Array(0);
  let frame: ImageData;
  let pixels: Uint32Array;

  let ducks: Duck[] = [];
  let litter: Litter[] = [];
  let pads: Litter[] = []; // waterlelies: zelfde beweging als afval, maar veel trager en niet klikbaar
  let sparkles: Sparkle[] = [];
  let respawn: number[] = [];
  // Counter is preserved while navigating around the site.
  let collected = Number(sessionStorage.getItem('litter-collected')) || 0;
  if (counter) counter.textContent = String(collected);
  let blocked: Rect[] = [];
  const raftSim = createRafts(); // galerij: foto's op boomstammen; op andere pagina's zijn er geen
  let raftRects: Rect[] = []; // bewegende, vaste voorwerpen: vogels en afval kunnen er niet doorheen
  // Top of the screen within the pond, in whole pond pixels; only on the gallery does the pond scroll along.
  const camera = () => (raftSim.has ? clamp(Math.round(window.scrollY / scale), 0, Math.max(0, WH - H)) : 0);

  // Soft, tileable noise: random values on a coarse grid, bilinearly interpolated.
  // `cell` must divide TW and TH.
  function smoothNoise(cell: number): Float32Array {
    const gw = TW / cell;
    const gh = TH / cell;
    const g = new Float32Array(gw * gh).map(Math.random);
    const out = new Float32Array(TW * TH);
    for (let y = 0; y < TH; y++) {
      const fy = y / cell;
      const iy = Math.floor(fy);
      const ty = fy - iy;
      const sy = ty * ty * (3 - 2 * ty);
      const r0 = iy * gw;
      const r1 = ((iy + 1) % gh) * gw;
      for (let x = 0; x < TW; x++) {
        const fx = x / cell;
        const ix = Math.floor(fx);
        const tx = fx - ix;
        const sx = tx * tx * (3 - 2 * tx);
        const ix1 = (ix + 1) % gw;
        const a = g[r0 + ix];
        const b = g[r0 + ix1];
        const c = g[r1 + ix];
        const d = g[r1 + ix1];
        out[y * TW + x] = a + (b - a) * sx + (c - a + (a - b + d - c) * sx) * sy;
      }
    }
    return out;
  }

  // Large viewport height (100lvh): doesn't change when the address bar collapses or expands on a phone.
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const viewportHeight = () => probe.offsetHeight || window.innerHeight;

  let sized = '';
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = viewportHeight();
    const key = `${cssW}x${cssH}@${dpr}`;
    if (key === sized) return; // bv. alleen de adresbalk die beweegt: niets herbouwen
    sized = key;

    const { deviceScale, scale: cssScale } = pondScale(cssW, dpr);
    scale = cssScale; // CSS-pixels per pond-pixel
    W = Math.ceil(cssW / scale);
    H = Math.ceil(cssH / scale);
    WH = H;
    canvas!.width = W;
    canvas!.height = H;
    canvas!.style.width = `${(W * deviceScale) / dpr}px`;
    canvas!.style.height = `${(H * deviceScale) / dpr}px`;
    ctx.imageSmoothingEnabled = false;

    updateBlocked(); // vóór het plaatsen van eenden en afval
    if (raftSim.has) {
      const nav = document.querySelector('.pond-menu')?.getBoundingClientRect();
      const off = window.scrollY / scale;
      WH = raftSim.layout(W, H, nav ? { x0: nav.left / scale, y0: nav.top / scale + off, x1: nav.right / scale, y1: nav.bottom / scale + off } : null, phone.matches);
      document.body.style.minHeight = `${WH * scale}px`; // the page is as tall as the pond
    }
    raftRects = raftSim.rects();
    TW = Math.ceil(W / 48) * 48;
    TH = Math.ceil(H / 48) * 48;
    const n = W * WH;
    const tn = TW * TH;
    cover = new Float32Array(n).fill(1);
    thr = new Float32Array(tn).map(Math.random);
    frame = ctx.createImageData(W, H);
    pixels = new Uint32Array(frame.data.buffer);

    // Patches of dense and thin algae; the density stays below 1 so water shows through.
    const big = smoothNoise(48);
    const small = smoothNoise(16);
    dens = new Float32Array(tn);
    for (let i = 0; i < tn; i++) dens[i] = clamp(0.5 + 0.35 * big[i] + 0.25 * small[i], 0.6, 0.97);

    // Color variation: large zones plus grain; the zones later shift color slowly up and down.
    const zone = smoothNoise(24);
    const zoneFine = smoothNoise(8);
    const phase = smoothNoise(48);
    tone = new Float32Array(tn);
    tonePhase = new Uint8Array(tn);
    waterColor = new Uint32Array(tn);
    for (let i = 0; i < tn; i++) {
      tone[i] = 0.6 * zone[i] + 0.4 * zoneFine[i] + (Math.random() - 0.5) * 0.25;
      tonePhase[i] = Math.min(15, Math.floor(phase[i] * 16));
      waterColor[i] = water[clamp(Math.floor(zoneFine[i] * water.length), 0, water.length - 1)];
    }

    for (const d of ducks) {
      d.x = clamp(d.x, 8, W - 8);
      d.y = clamp(d.y, 8, WH - 8);
    }
    if (ducks.length === 0) {
      const screens = Math.max(1, Math.round(WH / H)); // op de hoge galerij evenredig meer vogels en afval
      const kinds = [
        ...Array.from({ length: DUCK_COUNT * screens }, () => ({ img: duckImg, words: DUCK_WORDS })),
        ...Array.from({ length: COOT_COUNT * screens }, () => ({ img: cootImg, words: COOT_WORDS })),
        ...Array.from({ length: SWAN_COUNT * screens }, () => ({ img: swanImg, words: SWAN_WORDS })),
      ];
      ducks = kinds.map((kind) => {
        let x = 0;
        let y = 0;
        for (let tries = 0; tries < 40; tries++) {
          x = rand(30, W - 30);
          y = rand(30, WH - 30);
          if (!inBlocked(x, y, 10)) break;
        }
        return {
          ...kind, x, y, angle: rand(0, Math.PI * 2), turn: 0, phase: rand(0, 6), bubble: null,
          speed: rand(9, 14) * (reduceMotion ? 0.3 : 1),
        };
      });
    }
    const screens = Math.max(1, Math.round(WH / H));
    if (pads.length === 0) for (let k = 0; k < screens; k++) for (const name of PAD_SPRITES) pads.push(newPad(padByName.get(name)!));
    if (litter.length === 0 && !calmPond) for (let i = 0; i < LITTER_COUNT * screens; i++) litter.push(newLitter());
  }

  function updateBlocked() {
    const off = raftSim.has ? window.scrollY / scale : 0; // paginacoördinaten: menu en tekst scrollen mee
    blocked = solid.map((el) => {
      const r = el.getBoundingClientRect();
      return { x0: r.left / scale, y0: r.top / scale + off, x1: r.right / scale, y1: r.bottom / scale + off };
    });
  }

  const inRect = (r: Rect, x: number, y: number, pad: number) => x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad;
  const inBlocked = (x: number, y: number, pad: number) => blocked.some((r) => inRect(r, x, y, pad));
  const inRaft = (x: number, y: number, pad: number) => raftRects.some((r) => inRect(r, x, y, pad));

  function newPad(img: HTMLImageElement): Litter {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 40; tries++) {
      x = rand(20, W - 20);
      y = rand(20, WH - 20);
      if (!inBlocked(x, y, img.width / 2)) break;
    }
    const a = rand(0, Math.PI * 2);
    const s = rand(0.6, 1.6);
    return { img, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, phase: rand(0, 6) };
  }

  function newLitter(fromEdge = false): Litter {
    const free = litterImgs.filter((i) => litter.filter((l) => l.img === i).length < MAX_PER_KIND);
    const pool = free.length > 0 ? free : litterImgs;
    const img = pool[Math.floor(Math.random() * pool.length)];
    const half = img.width / 2;
    let x = 0;
    let y = 0;
    if (fromEdge) {
      // New litter drifts in from off-screen, never appearing under the text card or the menu.
      let vx = 0;
      let vy = 0;
      for (let tries = 0; tries < 40; tries++) {
        const side = Math.floor(Math.random() * 4);
        const s = rand(3, 5);
        if (side === 0) { x = -half - 1; y = rand(20, WH - 20); vx = s; vy = rand(-1, 1); }
        else if (side === 1) { x = W + half + 1; y = rand(20, WH - 20); vx = -s; vy = rand(-1, 1); }
        else if (side === 2) { x = rand(20, W - 20); y = -half - 1; vy = s; vx = rand(-1, 1); }
        else { x = rand(20, W - 20); y = WH + half + 1; vy = -s; vx = rand(-1, 1); }
        if (!inBlocked(clamp(x, 25, W - 25), clamp(y, 25, WH - 25), half)) break;
      }
      return { img, x, y, vx, vy, phase: rand(0, 6) };
    }
    for (let tries = 0; tries < 40; tries++) {
      x = rand(20, W - 20);
      y = rand(20, WH - 20);
      if (!inBlocked(x, y, img.width / 2)) break;
    }
    const a = rand(0, Math.PI * 2);
    const s = rand(1.5, 4);
    return { img, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, phase: rand(0, 6) };
  }

  // Clear algae in a soft disc; the further from the center, the less clean.
  function clearDisc(cx: number, cy: number, r: number) {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(WH - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d < 1) {
          const i = y * W + x;
          cover[i] = Math.min(cover[i], d * d);
        }
      }
    }
  }

  // On a phone the card is narrow and the animals swim freely underneath it (otherwise they'd be stuck in two narrow channels).
  const phone = window.matchMedia('(max-width: 699px)');

  function updateDuck(d: Duck, dt: number) {
    // The duck telling a fact doesn't swim away for a moment.
    if (fact?.bird === d) {
      if (d.bubble && (d.bubble.age += dt) > BUBBLE_SECONDS) d.bubble = null;
      return;
    }
    d.turn = clamp(d.turn + rand(-1.5, 1.5) * dt * 2, -0.8, 0.8);
    d.angle += d.turn * dt;
    // If the animal is under the text card, swim out towards the nearest edge.
    const under = (phone.matches ? undefined : blocked.find((r) => inRect(r, d.x, d.y, 0))) ?? raftRects.find((r) => inRect(r, d.x, d.y, 0));
    if (under) {
      const exits = [
        { x: under.x0 - 10, y: d.y }, { x: under.x1 + 10, y: d.y },
        { x: d.x, y: under.y0 - 10 }, { x: d.x, y: under.y1 + 10 },
      ].map((o) => ({ x: clamp(o.x, 8, W - 8), y: clamp(o.y, 8, WH - 8) }));
      const to = exits.reduce((a, b) => (Math.hypot(a.x - d.x, a.y - d.y) <= Math.hypot(b.x - d.x, b.y - d.y) ? a : b));
      let diff = Math.atan2(to.y - d.y, to.x - d.x) - d.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      d.angle += clamp(diff, -1, 1) * dt * 4;
    }
    const margin = 28;
    const edge = Math.max(margin - d.x, d.x - (W - margin), margin - d.y, d.y - (WH - margin), 0) / margin;
    if (edge > 0) {
      const cx = !phone.matches && inBlocked(W / 2, WH / 2, 0) ? (d.x < W / 2 ? W * 0.1 : W * 0.9) : W / 2;
      let diff = Math.atan2(WH / 2 - d.y, cx - d.x) - d.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      d.angle += clamp(diff, -1, 1) * dt * 4 * Math.min(edge, 1);
    }
    // Stay visible: turn away from the text card, the edge and the rafts.
    const ax = d.x + Math.cos(d.angle) * 14;
    const ay = d.y + Math.sin(d.angle) * 14;
    const wall = (x: number, y: number) => (!phone.matches && inBlocked(x, y, 6)) || inRaft(x, y, 6);
    if (!wall(d.x, d.y) && wall(ax, ay)) d.angle += (d.turn >= 0 ? 1 : -1) * dt * 6;
    // Avoid running into other animals: turn away from whoever swims right in front of you.
    for (const o of ducks) {
      if (o === d) continue;
      const { dist, req } = clearance(o.x - d.x, o.y - d.y, bodyW(d.img) + bodyW(o.img), bodyH(d.img) + bodyH(o.img));
      const look = req * 1.8;
      if (dist >= look) continue;
      let diff = Math.atan2(o.y - d.y, o.x - d.x) - d.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) < Math.PI * 0.6) d.angle -= (diff >= 0 ? 1 : -1) * (1 - dist / look) * dt * 5;
    }
    d.x += Math.cos(d.angle) * d.speed * dt;
    d.y += Math.sin(d.angle) * d.speed * dt;
    // The trail forms behind the duck, not in front of it.
    clearDisc(d.x - Math.cos(d.angle) * 7, d.y - Math.sin(d.angle) * 7 + 2, 6);
    if (d.bubble && (d.bubble.age += dt) > BUBBLE_SECONDS) d.bubble = null;
  }

  // Body as an ellipse (half width/height); `clearance` gives the distance and the minimal distance
  // at which two ellipses just avoid touching, in the direction of dx,dy.
  const bodyW = (img: HTMLImageElement) => img.width * 0.42;
  const bodyH = (img: HTMLImageElement) => img.height * 0.4;
  function clearance(dx: number, dy: number, hw: number, hh: number) {
    const dist = Math.hypot(dx, dy) || 0.001;
    return { dist, req: 1 / Math.hypot(dx / dist / hw, dy / dist / hh) };
  }

  // Nothing may overlap: animals push each other apart, litter too, and animals
  // shove litter aside (the litter doesn't push the animals).
  function separate(dt: number) {
    const k = Math.min(1, dt * 8);
    const push = (a: { x: number; y: number }, b: { x: number; y: number }, hw: number, hh: number, shareA: number) => {
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      if (Math.abs(dx) + Math.abs(dy) < 0.01) { dx = rand(-1, 1); dy = rand(-1, 1); }
      const { dist, req } = clearance(dx, dy, hw, hh);
      if (dist >= req) return;
      const move = (req - dist) * k;
      const ux = dx / dist;
      const uy = dy / dist;
      a.x -= ux * move * shareA;
      a.y -= uy * move * shareA;
      b.x += ux * move * (1 - shareA);
      b.y += uy * move * (1 - shareA);
    };
    for (let i = 0; i < ducks.length; i++) {
      for (let j = i + 1; j < ducks.length; j++) {
        push(ducks[i], ducks[j], bodyW(ducks[i].img) + bodyW(ducks[j].img), bodyH(ducks[i].img) + bodyH(ducks[j].img), 0.5);
      }
    }
    // Rafts are fixed: animals and litter that end up on one get gently pushed out.
    const pushOut = (o: { x: number; y: number }, hw: number, hh: number) => {
      for (const r of raftRects) {
        const l = r.x0 - hw;
        const rr = r.x1 + hw;
        const t = r.y0 - hh;
        const b = r.y1 + hh;
        if (o.x <= l || o.x >= rr || o.y <= t || o.y >= b) continue;
        const m = Math.min(o.x - l, rr - o.x, o.y - t, b - o.y);
        if (m === o.x - l) o.x -= m * k;
        else if (m === rr - o.x) o.x += m * k;
        else if (m === o.y - t) o.y -= m * k;
        else o.y += m * k;
      }
    };
    for (const d of ducks) pushOut(d, d.img.width / 2, d.img.height / 2);
    const binnen = (l: Litter) => l.x > 8 && l.x < W - 8 && l.y > 8 && l.y < WH - 8; // afval dat nog binnendrijft laten we met rust
    for (let i = 0; i < litter.length; i++) {
      if (!binnen(litter[i])) continue;
      for (let j = i + 1; j < litter.length; j++) {
        if (binnen(litter[j])) push(litter[i], litter[j], 14, 14, 0.5);
      }
      for (const d of ducks) push(d, litter[i], bodyW(d.img) + 6, bodyH(d.img) + 6, 0); // alleen het afval schuift
      pushOut(litter[i], litter[i].img.width / 2, litter[i].img.height / 2);
    }
    // Waterlelies liggen los op het water: een langsdrijvend vlot (galerij) duwt ze net als afval opzij.
    for (const p of pads) pushOut(p, p.img.width / 2, p.img.height / 2);
  }

  function updateLitter(l: Litter, dt: number) {
    const pad = l.img.width / 2;
    const nx = l.x + l.vx * dt;
    const ny = l.y + l.vy * dt;
    const hit = (x: number, y: number) => inBlocked(x, y, pad) || inRaft(x, y, pad);
    const inside = hit(l.x, l.y);
    // Only bounce at the edge if the litter is drifting outward: drifting inward is always allowed.
    const outX = (nx < pad && l.vx < 0) || (nx > W - pad && l.vx > 0);
    const outY = (ny < pad && l.vy < 0) || (ny > WH - pad && l.vy > 0);
    if (outX || (!inside && hit(nx, l.y))) l.vx = -l.vx;
    else l.x = nx;
    if (outY || (!inside && hit(l.x, ny))) l.vy = -l.vy;
    else l.y = ny;
  }

  function litterAt(x: number, y: number): number {
    const slop = 3; // ruimer klikvlak, handig met vingers
    for (let i = litter.length - 1; i >= 0; i--) {
      const l = litter[i];
      if (Math.abs(x - l.x) <= l.img.width / 2 + slop && Math.abs(y - l.y) <= l.img.height / 2 + slop) return i;
    }
    return -1;
  }

  function padAt(x: number, y: number): Litter | undefined {
    const slop = 2;
    for (let i = pads.length - 1; i >= 0; i--) {
      const p = pads[i];
      if (Math.abs(x - p.x) <= p.img.width / 2 + slop && Math.abs(y - p.y) <= p.img.height / 2 + slop) return p;
    }
    return undefined;
  }

  function duckAt(x: number, y: number): Duck | undefined {
    const slop = 3;
    for (let i = ducks.length - 1; i >= 0; i--) {
      const d = ducks[i];
      if (Math.abs(x - d.x) <= d.img.width / 2 + slop && Math.abs(y - d.y) <= d.img.height / 2 + slop) return d;
    }
    return undefined;
  }

  // Fact shown in an HTML bubble (the pixel font has too few letters); it follows the duck telling it.
  const factsByImg = new Map(litterImgs.map((img, i) => [img, FACTS[LITTER_SPRITES[i]] ?? []]));
  const FACT_KIND = new Map(litterImgs.map((img, i) => [img, LITTER_SPRITES[i]])); // ook het anker op de bronnenpagina
  const lastFact = new Map<string[], number>();
  let fact: { el: HTMLElement; bird: Duck; timer: number } | null = null;

  function tellFact(item: Litter) {
    const facts = factsByImg.get(item.img);
    if (!facts || facts.length === 0 || ducks.length === 0 || Math.random() > FACT_CHANCE) return;
    // Next fact for this kind of litter, so you don't keep hearing the same one.
    const next = ((lastFact.get(facts) ?? -1) + 1 + Math.floor(Math.random() * (facts.length - 1))) % facts.length;
    lastFact.set(facts, next);
    const bird = ducks.reduce((a, b) => (Math.hypot(a.x - item.x, a.y - item.y) <= Math.hypot(b.x - item.x, b.y - item.y) ? a : b));
    bird.bubble = null; // geen kwak-wolkje óp het weetje
    if (fact) {
      clearTimeout(fact.timer);
      fact.el.remove();
    }
    const el = document.createElement('div');
    el.className = 'fact';
    el.setAttribute('role', 'status');
    const link = document.createElement('a');
    link.className = 'fact-link';
    link.href = `${import.meta.env.BASE_URL}bronnen.html#${FACT_KIND.get(item.img)}`;
    link.append(facts[next], Object.assign(document.createElement('span'), { className: 'fact-more', textContent: 'Bronnen >' }));
    el.append(link);
    document.body.appendChild(el);
    fact = { el, bird, timer: window.setTimeout(hideFact, FACT_SECONDS * 1000) };
    placeFact();
  }

  function hideFact() {
    if (!fact) return;
    const { el } = fact;
    clearTimeout(fact.timer);
    fact = null;
    el.classList.add('fact-out');
    window.setTimeout(() => el.remove(), 300);
  }

  function placeFact() {
    if (!fact) return;
    const { el, bird } = fact;
    const w = el.offsetWidth;
    const tail = clamp(bird.x * scale, 16, window.innerWidth - 16);
    const left = clamp(bird.x * scale - w / 2, 8, Math.max(8, window.innerWidth - w - 8));
    el.style.left = `${left}px`;
    el.style.top = `${Math.max(8, (bird.y - camera() - bird.img.height / 2) * scale - el.offsetHeight - 26)}px`;
    el.style.setProperty('--tail', `${clamp(tail - left, 12, Math.max(12, w - 12))}px`);
  }

  const toPond = (e: PointerEvent) => ({ x: e.clientX / scale, y: e.clientY / scale + camera() });
  let last: { x: number; y: number } | null = null;

  function trail(p: { x: number; y: number }) {
    const from = last ?? p;
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / 2));
    for (let s = 1; s <= steps; s++) {
      clearDisc(from.x + ((p.x - from.x) * s) / steps, from.y + ((p.y - from.y) * s) / steps, 4);
    }
    last = p;
  }

  function overInteractive(e: PointerEvent) {
    return e.target instanceof Element && e.target.closest('a, button, input, .toast, .lightbox') !== null;
  }

  window.addEventListener('pointermove', (e) => {
    const p = toPond(e);
    trail(p);
    canvas.style.cursor = !inBlocked(p.x, p.y, 0) && (duckAt(p.x, p.y) || litterAt(p.x, p.y) >= 0 || padAt(p.x, p.y)) ? 'pointer' : '';
  });
  window.addEventListener('pointerdown', (e) => {
    if (overInteractive(e)) return;
    const p = toPond(e);
    last = null;
    trail(p);
    if (inBlocked(p.x, p.y, 0)) return;
    const duck = duckAt(p.x, p.y);
    if (duck) {
      duck.bubble = { text: duck.words[Math.floor(Math.random() * duck.words.length)], age: 0 };
      return;
    }
    const i = litterAt(p.x, p.y);
    if (i < 0) {
      const pad = padAt(p.x, p.y);
      if (pad && pad.bloom === undefined) {
        pad.bloom = 0;
        }
      return;
    }
    const [gone] = litter.splice(i, 1);
    tellFact(gone);
    sparkles.push({ x: gone.x, y: gone.y, age: 0 });
    respawn.push(rand(2, 4));
    collected++;
    if (counter) counter.textContent = String(collected);
    sessionStorage.setItem('litter-collected', String(collected));
    if (isMilestone(collected)) showToast(collected);
    window.dispatchEvent(new CustomEvent('litter-cleared', { detail: { x: e.clientX, y: e.clientY, count: collected } }));
  });
  document.documentElement.addEventListener('pointerleave', () => (last = null));
  window.addEventListener('resize', resize);

  resize();

  let viewTop = 0; // top of the screen within the pond (see camera); drawing happens in pond coordinates
  function blit(bmp: Bitmap, x0: number, y0: number, alpha = 1) {
    for (let y = 0; y < bmp.h; y++) {
      const dy = y0 + y - viewTop;
      if (dy < 0 || dy >= H) continue;
      for (let x = 0; x < bmp.w; x++) {
        const dx = x0 + x;
        if (dx < 0 || dx >= W) continue;
        const src = bmp.px[y * bmp.w + x];
        const sa = (src >>> 24) / 255;
        if (sa === 0) continue;
        const i = dy * W + dx;
        if (sa === 1 && alpha === 1) {
          pixels[i] = src;
        } else {
          const a = sa * alpha;
          const dst = pixels[i];
          const r = (src & 255) * a + (dst & 255) * (1 - a);
          const g = ((src >>> 8) & 255) * a + ((dst >>> 8) & 255) * (1 - a);
          const b = ((src >>> 16) & 255) * a + ((dst >>> 16) & 255) * (1 - a);
          pixels[i] = (0xff000000 | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
        }
      }
    }
  }

  function fillRectPx(x: number, y: number, w: number, h: number, color: number) {
    for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) pixels[yy * W + xx] = color;
    }
  }

  function textWidth(text: string): number {
    return [...text].reduce((w, ch) => w + (GLYPHS[ch]?.[0].length ?? 0) + 1, -1);
  }

  function drawBubble(d: Duck) {
    if (!d.bubble) return;
    const tw = textWidth(d.bubble.text);
    const w = tw + 4;
    const h = 9;
    const cx = Math.round(d.x);
    const bx = clamp(cx - Math.floor(w / 2), 3, W - w - 3);
    const by = Math.max(3, Math.round(d.y - viewTop) - 12 - h);
    const px = (x: number, y: number, pw: number, ph: number, color: string) => {
      fillRectPx(x, y, pw, ph, abgr(color));
    };
    px(bx - 1, by - 1, w + 2, h + 2, INK);
    px(bx, by, w, h, '#ffffff');
    // little tail pointing towards the duck
    const tx = clamp(cx, bx + 2, bx + w - 3);
    px(tx, by + h, 2, 2, '#ffffff');
    px(tx - 1, by + h + 1, 1, 1, INK);
    px(tx + 2, by + h + 1, 1, 1, INK);
    px(tx, by + h + 2, 2, 1, INK);
    let gx = bx + 2;
    for (const ch of d.bubble.text) {
      const glyph = GLYPHS[ch];
      if (!glyph) continue;
      glyph.forEach((rowBits, gy) => {
        for (let k = 0; k < rowBits.length; k++) if (rowBits[k] === '1') px(gx + k, by + 2 + gy, 1, 1, INK);
      });
      gx += glyph[0].length + 1;
    }
  }

  const shift = new Float32Array(16);
  let prev = performance.now();
  let time = 0;
  function tick(now: number) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    time += dt;
    updateBlocked();
    const cam = camera();
    viewTop = cam;
    raftSim.update(dt, W, WH, blocked, scale, reduceMotion, cam, H);
    raftRects = raftSim.rects();

    for (let i = 0; i < cover.length; i++) if (cover[i] < 1) cover[i] = Math.min(1, cover[i] + ALGAE_REGROW * dt);
    ducks.forEach((d) => updateDuck(d, dt));
    placeFact();
    pads.forEach((p) => {
      updateLitter(p, dt);
      if (p.bloom !== undefined && (p.bloom += dt) > BLOOM_SECONDS) p.bloom = undefined; // bloem verdwijnt weer
    });
    litter.forEach((l) => updateLitter(l, dt));
    separate(dt);
    respawn = respawn.map((t) => t - dt);
    while (respawn.some((t) => t <= 0)) {
      respawn.splice(respawn.findIndex((t) => t <= 0), 1);
      litter.push(newLitter(true));
    }

    // The algae field stays in place and only changes color very slowly.
    const drift = reduceMotion ? 0 : time;
    for (let k = 0; k < 16; k++) shift[k] = 0.25 * Math.sin(drift * 0.15 + (k * Math.PI) / 8);
    const top = algae.length - 1;
    for (let y = 0; y < H; y++) {
      const wy = y + cam; // row within the pond; the texture is tileable and repeats vertically
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const j = (wy % TH) * TW + x;
        if (cover[wy * W + x] * dens[j] > thr[j]) {
          const c = Math.floor((tone[j] + shift[tonePhase[j]]) * algae.length);
          pixels[i] = algae[c < 0 ? 0 : c > top ? top : c];
        } else {
          pixels[i] = waterColor[j];
        }
      }
    }
    const bob = (phase: number, amp: number) => (reduceMotion ? 0 : Math.round(Math.sin(time * 1.6 + phase) * amp));
    for (const p of pads) {
      const b = bitmapsOf(p.img).normal;
      const px0 = Math.round(p.x - b.w / 2);
      const py0 = Math.round(p.y - b.h / 2) + bob(p.phase, 1);
      blit(b, px0, py0);
      if (p.bloom !== undefined) {
        // bud -> flower -> bud again, then gone
        const stage = p.bloom < 0.4 || p.bloom > BLOOM_SECONDS - 0.8 ? budImg : bloomImg;
        blit(bitmapsOf(stage).normal, px0, py0);
      }
    }
    const logBmp = bitmapsOf(logImg).normal;
    for (const log of raftSim.logs()) {
      // the rafts slide through the algae, leaving a trail of open water behind
      for (const cx of [13, 27, 41]) clearDisc(log.x + cx, log.y + 9, 7);
      blit(logBmp, log.x, log.y);
    }
    for (const l of litter) {
      const b = bitmapsOf(l.img).normal;
      blit(b, Math.round(l.x - b.w / 2), Math.round(l.y - b.h / 2) + bob(l.phase, 1));
    }
    for (const d of ducks) {
      const flip = Math.cos(d.angle) < 0;
      const bm = bitmapsOf(d.img);
      const b = flip ? bm.flipped : bm.normal;
      blit(b, Math.round(d.x) - Math.floor(b.w / 2), Math.round(d.y) + bob(d.phase, 1) - Math.floor(b.h / 2));
    }
    for (const d of ducks) if (d.bubble) drawBubble(d);
    sparkles = sparkles.filter((s) => (s.age += dt) < 0.5);
    const sparkle = bitmapsOf(sparkleImg).normal;
    for (const s of sparkles) blit(sparkle, Math.round(s.x - 8), Math.round(s.y - 8 - s.age * 10), 1 - s.age / 0.5);

    ctx.putImageData(frame, 0, 0); // het hele beeld in één keer

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
