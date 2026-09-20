// Pixel-art vijver: eenden, meerkoeten, zwanen, algen die tijdelijke sporen krijgen en klikbaar zwerfafval.
// Alles wordt op een laag-resolutie canvas getekend en met CSS opgeschaald (pixelated).

import '@fontsource/press-start-2p';
import './pond.css';

const DUCK_COUNT = 3;
const COOT_COUNT = 4;
const SWAN_COUNT = 2;
const BIRD_COUNT = 2;
const LITTER_COUNT = 28;
const ALGAE_REGROW = 0.18; // dekking per seconde
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const WATER = ['#3b8bb0', '#3f92b6', '#4599bd'];
const ALGAE = ['#2f6b2a', '#3f8232', '#519a3a', '#69b045', '#86c452'];
// Al het afval is 16x16 zodat het even groot is.
const LITTER_SPRITES = ['zak', 'batterij', 'handschoen', 'fles', 'beker', 'vork', 'chips', 'wiel'];

interface Rect { x0: number; y0: number; x1: number; y1: number }
interface Bubble { text: string; age: number }
interface Duck {
  img: HTMLImageElement;
  words: string[];
  x: number; y: number; angle: number; turn: number; speed: number; phase: number;
  bubble: Bubble | null;
}
interface Litter { img: HTMLImageElement; x: number; y: number; vx: number; vy: number; phase: number }
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

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// Klein 3x5 pixellettertype voor de praatwolkjes (W is 5 breed).
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
const BIRD_WORDS = ['PIEP!', 'TWEET!', 'PIEP PIEP!'];
const BUBBLE_SECONDS = 1.4;

async function start(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  const [duckImg, cootImg, swanImg, birdImg, sparkleImg, ...litterImgs] = await Promise.all([
    loadSprite('eend'),
    loadSprite('meerkoet'),
    loadSprite('zwaan'),
    loadSprite('bird'),
    loadSprite('sparkles'),
    ...LITTER_SPRITES.map(loadSprite),
  ]);

  const water = WATER.map(abgr);
  const algae = ALGAE.map(abgr);
  const counter = document.getElementById('litter-count');
  const solid = ['main', '.pond-menu'].map((q) => document.querySelector(q)).filter(
    (el): el is Element => el !== null,
  );

  let scale = 4;
  let W = 0;
  let H = 0;
  // Textuurruimte (TW x TH) is tegelbaar en schuift langzaam onder het scherm door.
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
  let sparkles: Sparkle[] = [];
  let respawn: number[] = [];
  // Teller blijft bewaard tijdens het bladeren door de site.
  let collected = Number(sessionStorage.getItem('litter-collected')) || 0;
  if (counter) counter.textContent = String(collected);
  let blocked: Rect[] = [];

  // Zachte, tegelbare ruis: willekeurige waarden op een grof raster, bilineair geïnterpoleerd.
  // `cell` moet TW en TH delen.
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

  function resize() {
    scale = clamp(Math.round(window.innerWidth / 360), 2, 6);
    W = Math.ceil(window.innerWidth / scale);
    H = Math.ceil(window.innerHeight / scale);
    canvas!.width = W;
    canvas!.height = H;
    canvas!.style.width = `${W * scale}px`;
    canvas!.style.height = `${H * scale}px`;
    ctx.imageSmoothingEnabled = false;

    updateBlocked(); // vóór het plaatsen van eenden en afval
    TW = Math.ceil(W / 48) * 48;
    TH = Math.ceil(H / 48) * 48;
    const n = W * H;
    const tn = TW * TH;
    cover = new Float32Array(n).fill(1);
    thr = new Float32Array(tn).map(Math.random);
    frame = ctx.createImageData(W, H);
    pixels = new Uint32Array(frame.data.buffer);

    // Vlekken van dichte en ijle algen; de dichtheid blijft onder 1 zodat er water doorschijnt.
    const big = smoothNoise(48);
    const small = smoothNoise(16);
    dens = new Float32Array(tn);
    for (let i = 0; i < tn; i++) dens[i] = clamp(0.5 + 0.35 * big[i] + 0.25 * small[i], 0.6, 0.97);

    // Kleurvariatie: grote zones plus korrel; de zones kleuren later langzaam op en neer.
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
      d.y = clamp(d.y, 8, H - 8);
    }
    if (ducks.length === 0) {
      const kinds = [
        ...Array.from({ length: DUCK_COUNT }, () => ({ img: duckImg, words: DUCK_WORDS })),
        ...Array.from({ length: COOT_COUNT }, () => ({ img: cootImg, words: COOT_WORDS })),
        ...Array.from({ length: SWAN_COUNT }, () => ({ img: swanImg, words: SWAN_WORDS })),
        ...Array.from({ length: BIRD_COUNT }, () => ({ img: birdImg, words: BIRD_WORDS })),
      ];
      ducks = kinds.map((kind) => {
        let x = 0;
        let y = 0;
        for (let tries = 0; tries < 40; tries++) {
          x = rand(30, W - 30);
          y = rand(30, H - 30);
          if (!inBlocked(x, y, 10)) break;
        }
        return {
          ...kind, x, y, angle: rand(0, Math.PI * 2), turn: 0, phase: rand(0, 6), bubble: null,
          speed: rand(9, 14) * (reduceMotion ? 0.3 : 1),
        };
      });
    }
    if (litter.length === 0) for (let i = 0; i < LITTER_COUNT; i++) litter.push(newLitter());
  }

  function updateBlocked() {
    blocked = solid.map((el) => {
      const r = el.getBoundingClientRect();
      return { x0: r.left / scale, y0: r.top / scale, x1: r.right / scale, y1: r.bottom / scale };
    });
  }

  const inBlocked = (x: number, y: number, pad: number) =>
    blocked.some((r) => x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad);

  function newLitter(): Litter {
    const img = litterImgs[Math.floor(Math.random() * litterImgs.length)];
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 40; tries++) {
      x = rand(20, W - 20);
      y = rand(20, H - 20);
      if (!inBlocked(x, y, img.width / 2)) break;
    }
    const a = rand(0, Math.PI * 2);
    const s = rand(1.5, 4);
    return { img, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, phase: rand(0, 6) };
  }

  // Ruim algen op in een zachte schijf; hoe verder van het midden, hoe minder schoon.
  function clearDisc(cx: number, cy: number, r: number) {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(H - 1, Math.ceil(cy + r));
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

  function updateDuck(d: Duck, dt: number) {
    d.turn = clamp(d.turn + rand(-1.5, 1.5) * dt * 2, -0.8, 0.8);
    d.angle += d.turn * dt;
    const margin = 28;
    const edge = Math.max(margin - d.x, d.x - (W - margin), margin - d.y, d.y - (H - margin), 0) / margin;
    if (edge > 0) {
      let diff = Math.atan2(H / 2 - d.y, W / 2 - d.x) - d.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      d.angle += clamp(diff, -1, 1) * dt * 4 * Math.min(edge, 1);
    }
    // Blijf zichtbaar: draai weg van de tekstkaart en de kop.
    const ax = d.x + Math.cos(d.angle) * 14;
    const ay = d.y + Math.sin(d.angle) * 14;
    if (!inBlocked(d.x, d.y, 6) && inBlocked(ax, ay, 6)) d.angle += (d.turn >= 0 ? 1 : -1) * dt * 6;
    d.x += Math.cos(d.angle) * d.speed * dt;
    d.y += Math.sin(d.angle) * d.speed * dt;
    // Het spoor ontstaat achter de eend, niet ervoor.
    clearDisc(d.x - Math.cos(d.angle) * 7, d.y - Math.sin(d.angle) * 7 + 2, 6);
    if (d.bubble && (d.bubble.age += dt) > BUBBLE_SECONDS) d.bubble = null;
  }

  function updateLitter(l: Litter, dt: number) {
    const pad = l.img.width / 2;
    const nx = l.x + l.vx * dt;
    const ny = l.y + l.vy * dt;
    const inside = inBlocked(l.x, l.y, pad);
    if (nx < pad || nx > W - pad || (!inside && inBlocked(nx, l.y, pad))) l.vx = -l.vx;
    else l.x = nx;
    if (ny < pad || ny > H - pad || (!inside && inBlocked(l.x, ny, pad))) l.vy = -l.vy;
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

  function duckAt(x: number, y: number): Duck | undefined {
    const slop = 3;
    for (let i = ducks.length - 1; i >= 0; i--) {
      const d = ducks[i];
      if (Math.abs(x - d.x) <= d.img.width / 2 + slop && Math.abs(y - d.y) <= d.img.height / 2 + slop) return d;
    }
    return undefined;
  }

  const toPond = (e: PointerEvent) => ({ x: e.clientX / scale, y: e.clientY / scale });
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
    return e.target instanceof Element && e.target.closest('a, button, input') !== null;
  }

  window.addEventListener('pointermove', (e) => {
    const p = toPond(e);
    trail(p);
    canvas.style.cursor = !inBlocked(p.x, p.y, 0) && (duckAt(p.x, p.y) || litterAt(p.x, p.y) >= 0) ? 'pointer' : '';
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
    if (i < 0) return;
    const [gone] = litter.splice(i, 1);
    sparkles.push({ x: gone.x, y: gone.y, age: 0 });
    respawn.push(rand(2, 4));
    collected++;
    if (counter) counter.textContent = String(collected);
    sessionStorage.setItem('litter-collected', String(collected));
    window.dispatchEvent(new CustomEvent('litter-cleared', { detail: { x: e.clientX, y: e.clientY, count: collected } }));
  });
  document.documentElement.addEventListener('pointerleave', () => (last = null));
  window.addEventListener('resize', resize);

  resize();

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
    const by = Math.max(3, Math.round(d.y) - 12 - h);
    const px = (x: number, y: number, pw: number, ph: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, pw, ph);
    };
    px(bx - 1, by - 1, w + 2, h + 2, INK);
    px(bx, by, w, h, '#fff');
    // staartje richting de eend
    const tx = clamp(cx, bx + 2, bx + w - 3);
    px(tx, by + h, 2, 2, '#fff');
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

    for (let i = 0; i < cover.length; i++) if (cover[i] < 1) cover[i] = Math.min(1, cover[i] + ALGAE_REGROW * dt);
    ducks.forEach((d) => updateDuck(d, dt));
    litter.forEach((l) => updateLitter(l, dt));
    respawn = respawn.map((t) => t - dt);
    while (respawn.some((t) => t <= 0)) {
      respawn.splice(respawn.findIndex((t) => t <= 0), 1);
      litter.push(newLitter());
    }

    // Het algenveld blijft op zijn plek en verkleurt alleen heel traag.
    const drift = reduceMotion ? 0 : time;
    for (let k = 0; k < 16; k++) shift[k] = 0.25 * Math.sin(drift * 0.15 + (k * Math.PI) / 8);
    const top = algae.length - 1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const j = y * TW + x;
        if (cover[i] * dens[j] > thr[j]) {
          const c = Math.floor((tone[j] + shift[tonePhase[j]]) * algae.length);
          pixels[i] = algae[c < 0 ? 0 : c > top ? top : c];
        } else {
          pixels[i] = waterColor[j];
        }
      }
    }
    ctx.putImageData(frame, 0, 0);

    const bob = (phase: number, amp: number) => (reduceMotion ? 0 : Math.round(Math.sin(time * 1.6 + phase) * amp));
    for (const l of litter) {
      ctx.drawImage(l.img, Math.round(l.x - l.img.width / 2), Math.round(l.y - l.img.height / 2) + bob(l.phase, 1));
    }
    for (const d of ducks) {
      const flip = Math.cos(d.angle) < 0;
      const dx = Math.round(d.x);
      const dy = Math.round(d.y) + bob(d.phase, 1);
      ctx.save();
      ctx.translate(dx, dy);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(d.img, -d.img.width / 2, -d.img.height / 2);
      ctx.restore();
    }
    for (const d of ducks) if (d.bubble) drawBubble(d);
    sparkles = sparkles.filter((s) => (s.age += dt) < 0.5);
    for (const s of sparkles) {
      ctx.globalAlpha = 1 - s.age / 0.5;
      ctx.drawImage(sparkleImg, Math.round(s.x - 8), Math.round(s.y - 8 - s.age * 10));
    }
    ctx.globalAlpha = 1;

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
