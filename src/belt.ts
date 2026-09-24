// Background of "Over ons": a conveyor belt seen from above, snaking down the page around the text card and
// ending in a big fire (seen from the side) where the residual waste is burned. Swipe (touch) or hover (mouse)
// over an item to knock it off the belt in that direction: aim at the right bin (paper, plastic, organic,
// glass, electronics) next to the belt. Three correct items in a bin give sparkles and an arrow to something
// new made from it. Whatever reaches the end falls into the fire (a red sad smiley rises); a battery in the
// fire turns it toxic green with a small explosion. Never finished: it's decor behind the text.
//
// The canvas covers the whole document (not just the screen) and scrolls with it, so the belt can go around
// the card. Everything is in pond pixels (see pixel.ts), scaled up with CSS.

import './belt.css';
import { pondScale } from './pixel';
import { ITEM_MAPS, PRODUCT_MAPS, SYMBOLS, GLYPHS, SMILEY, makeSprite } from './belt-sprites';

type Material = 'paper' | 'plastic' | 'organic' | 'glass' | 'electronics';
type Sprite = HTMLImageElement | HTMLCanvasElement;
type Rect = { x0: number; y0: number; x1: number; y1: number };
type Segment = { x0: number; y0: number; x1: number; y1: number; s0: number; len: number; dx: number; dy: number };

const MATERIALS: Material[] = ['paper', 'plastic', 'organic', 'glass', 'electronics'];
const NAMES: Record<Material, string> = { paper: 'papier', plastic: 'plastic', organic: 'gft', glass: 'glas', electronics: 'elektronica' };
const BIN_COLORS: Record<Material, { lid: string; light: string; dark: string }> = {
  paper: { lid: '#3a6fd0', light: '#5b8fe6', dark: '#26509e' },
  plastic: { lid: '#f08a24', light: '#f7a852', dark: '#b8621a' },
  organic: { lid: '#3f8a32', light: '#5aaa47', dark: '#2a6122' },
  glass: { lid: '#3aa39a', light: '#5cc2b8', dark: '#277770' },
  electronics: { lid: '#8a4fb0', light: '#a870cc', dark: '#613682' },
};
const PRODUCT_TEXT: Record<Material, string> = {
  paper: 'Van papier maak je mooie boeken!',
  plastic: 'Van plastic maak je nieuw speelgoed!',
  organic: 'Van gft maak je compost!',
  glass: 'Van glas maak je mooie nieuwe glazen!',
  electronics: 'Uit oude elektronica haal je waardevolle aardmetalen!',
};

// What lies on the belt, all recyclable and clearly of one material: PNG sprites from public/sprites, or pixel maps from belt-sprites.ts.
const KINDS: { sprite: string; material: Material | 'residual'; battery?: boolean }[] = [
  { sprite: 'newspaper', material: 'paper' },
  { sprite: 'box', material: 'paper' },
  { sprite: 'plasticBottle', material: 'plastic' },
  { sprite: 'zak', material: 'plastic' }, // the plastic bag from the pond
  { sprite: 'appleCore', material: 'organic' },
  { sprite: 'banana', material: 'organic' },
  { sprite: 'fles', material: 'glass' },
  { sprite: 'jar', material: 'glass' },
  { sprite: 'batterij', material: 'electronics', battery: true },
  { sprite: 'phone', material: 'electronics' },
];
const BATTERY_CHANCE = 0.6; // of the electronics, this share is a battery (the rest a phone)

const BELT = 18; // belt width including the rails
const HALF = BELT / 2;
const MARGIN = 4; // belt keeps this far from the edges of the page
const ROW_MIN = 54; // minimum distance between two horizontal runs of the belt (room for bins in between)
const SPEED = 16; // pond pixels per second
const SPAWN_MIN = 7.2; // seconds between two items
const SPAWN_MAX = 10.4;
const SLAT = 4; // distance between the slats on the belt
const BIN = 28;
const ARROW = 12;
const PRODUCT = 26; // room next to the bin for a worker and the thing they made
const BUILD_TIME = 2.6; // seconds the worker hammers away
const FIRE_W = 56;
const FLAME_H = 54;
const PIT_H = 12;
const FIRE_H = FLAME_H + PIT_H - 4;
const HIT = 11; // how close (pond px) the mouse or finger has to pass an item to knock it off; more for touch
const HIT_TOUCH = 12;
const AIM = 0.62; // cos of the widest angle between swipe and bin that still counts as aiming at it
const AIM_RANGE = 110; // bins further away than this aren't reached
const NEEDED = 3; // items per bin before something new is made of them
const SPARKLE_TIME = 1.3;
const PRODUCT_TIME = 8;
const TOXIC_TIME = 5;

type Item = {
  img: Sprite;
  material: Material | 'residual';
  battery: boolean;
  s: number; // distance along the belt
  state: 'belt' | 'flying' | 'falling';
  cooldown: number; // just landed back on the belt: can't be knocked off again for a moment
  fly?: { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; height: number; then: 'belt' | 'return' | 'bin'; bin?: Bin };
  fall?: { x0: number; y0: number; x1: number; y1: number; t: number };
};
type Bin = {
  material: Material;
  x: number; // center
  y: number;
  ax: number; // direction (unit, along the belt) from the bin to where its product appears
  ay: number;
  count: number;
  bump: number; // an item just landed in it
  wrong: number; // a wrong item just bounced off it: red cross
  phase: 'idle' | 'sparkle' | 'build' | 'made';
  worker: Worker;
  t: number;
};
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; gravity: number; kind: 'dot' | 'twinkle' | 'smoke' };
// A little construction worker who turns a full bin into something new; looks different every time.
type Worker = { skin: string; hair: string; female: boolean; beard: boolean; hat: string; vest: string };
type Smiley = { x: number; y: number; t: number };

const canvas = document.getElementById('belt') as HTMLCanvasElement;
let ctx = canvas.getContext('2d')!; // swapped briefly to paint into an offscreen canvas
const recycledEl = document.getElementById('recycled-count');
const burnedEl = document.getElementById('burned-count');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const between = (a: number, b: number) => a + Math.random() * (b - a);
const pickRandom = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const grow = (r: Rect, d: number): Rect => ({ x0: r.x0 - d, y0: r.y0 - d, x1: r.x1 + d, y1: r.y1 + d });

const loadSprite = (name: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`sprite ${name} not found`));
    img.src = `${import.meta.env.BASE_URL}sprites/${name}.png`;
  });

const sprites = new Map<string, Sprite>();
const products = new Map<Material, HTMLCanvasElement>();
const symbols = new Map<Material, HTMLCanvasElement>();
const smileyImg = makeSprite(SMILEY.rows, SMILEY.palette);

let scale = 1;
let W = 0;
let H = 0;
let floor: HTMLCanvasElement;
let segments: Segment[] = [];
let length = 0;
let bins: Bin[] = [];
let fire = { x: 0, y: 0 }; // top-left of the fire (flames); the pit is below the flames
let items: Item[] = [];
let particles: Particle[] = [];
let smileys: Smiley[] = [];
let flashes: { x: number; y: number; t: number; rgb: string }[] = []; // shock waves of an explosion (t < 0: not yet)
let time = 0;
let nextSpawn = 0;
let toxic = 0; // seconds of green fire left
let flare = 0; // the fire flares up for a moment after something falls in
let shake = 0;
const counts = new Map<Material, number>(); // survive a rebuild of the layout
const score = { recycled: 0, burned: 0 };

function renderScore() {
  if (recycledEl) recycledEl.textContent = String(score.recycled);
  if (burnedEl) burnedEl.textContent = String(score.burned);
}

// ---------- Layout ----------

// A rectangle of an element in pond pixels, in document coordinates (the canvas scrolls with the page).
function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x0: (r.left + scrollX) / scale, y0: (r.top + scrollY) / scale, x1: (r.right + scrollX) / scale, y1: (r.bottom + scrollY) / scale };
}

function pos(s: number) {
  const c = Math.min(Math.max(s, 0), length);
  for (const seg of segments) {
    if (c <= seg.s0 + seg.len) {
      const u = c - seg.s0;
      return { x: seg.x0 + seg.dx * u, y: seg.y0 + seg.dy * u };
    }
  }
  const last = segments[segments.length - 1];
  return { x: last.x1, y: last.y1 };
}

const segmentRect = (seg: Segment): Rect => ({
  x0: Math.min(seg.x0, seg.x1) - HALF,
  y0: Math.min(seg.y0, seg.y1) - HALF,
  x1: Math.max(seg.x0, seg.x1) + HALF,
  y1: Math.max(seg.y0, seg.y1) + HALF,
});

// The belt: down along the right of the card (if there's room there), then back and forth below it in
// horizontal runs, the last one ending in the fire at the bottom of the page.
function buildPath(card: Rect, menu: Rect) {
  const xL = menu.y1 > card.y1 - 4 && menu.x1 < W / 2 ? Math.round(menu.x1 + MARGIN + HALF) : MARGIN + HALF;
  const xR = W - MARGIN - HALF;
  fire = { x: Math.round((xL + xR) / 2 - FIRE_W / 2), y: H - FIRE_H - Math.ceil(76 / scale) }; // clear of the counters

  const free = W - card.x1;
  const side = free >= BELT + 2 * MARGIN;
  const yFirst = Math.round(card.y1 + 8 + HALF);
  const yLast = fire.y + 18;
  const span = Math.max(ROW_MIN, yLast - yFirst);
  const runs = Math.max(2, Math.floor(span / ROW_MIN) + 1);
  const rowH = span / (runs - 1);

  const points: [number, number][] = [];
  if (side) {
    const cx = Math.round(Math.min(xR, card.x1 + Math.min(free / 2, MARGIN + HALF + 14)));
    if (menu.x1 > cx - HALF && menu.x0 < cx + HALF) {
      // Phone: the menu spans the top, so the belt comes in from the left, between the menu and the card.
      const y = Math.round((menu.y1 + card.y0) / 2);
      points.push([-HALF, y]);
      points.push([cx, y]);
    } else {
      points.push([cx, -HALF]); // comes in from above the page
    }
    points.push([cx, yFirst]);
  } else {
    points.push([W + HALF, yFirst]); // comes in from the right edge
  }
  for (let k = 0; k < runs; k++) {
    const y = Math.round(yFirst + k * rowH);
    const leftwards = k % 2 === 0;
    const last = k === runs - 1;
    const x = last ? (leftwards ? fire.x + FIRE_W - 10 : fire.x + 10) : leftwards ? xL : xR;
    points.push([x, y]);
    if (!last) points.push([x, Math.round(yFirst + (k + 1) * rowH)]);
  }

  segments = [];
  length = 0;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const len = Math.abs(x1 - x0) + Math.abs(y1 - y0);
    if (len === 0) continue;
    segments.push({ x0, y0, x1, y1, s0: length, len, dx: Math.sign(x1 - x0), dy: Math.sign(y1 - y0) });
    length += len;
  }
}

// Bins stand right next to the belt, with room beside them (along the belt) for the arrow and the product.
// Candidates are tried all along the belt; five of them are picked, spread out evenly.
function placeBins(card: Rect, menu: Rect) {
  const obstacles: Rect[] = [
    grow(card, 3),
    grow(menu, 2),
    { x0: fire.x - 8, y0: fire.y - 14, x1: fire.x + FIRE_W + 8, y1: H },
    ...segments.map((seg) => grow(segmentRect(seg), 2)),
  ];
  type Slot = { s: number; x: number; y: number; ax: number; ay: number; foot: Rect };
  const slots: Slot[] = [];
  for (const seg of segments) {
    for (let u = HALF + 4; u <= seg.len - HALF - 4; u += 3) {
      const px = seg.x0 + seg.dx * u;
      const py = seg.y0 + seg.dy * u;
      for (const side of [1, -1]) {
        const x = Math.round(px - seg.dy * side * (HALF + 3 + BIN / 2));
        const y = Math.round(py + seg.dx * side * (HALF + 3 + BIN / 2));
        for (const dir of [1, -1]) {
          const ax = seg.dx * dir;
          const ay = seg.dy * dir;
          const reach = BIN / 2 + ARROW + PRODUCT;
          const foot = grow(
            {
              x0: Math.min(x - BIN / 2, x + ax * reach),
              y0: Math.min(y - BIN / 2, y + ay * reach),
              x1: Math.max(x + BIN / 2, x + ax * reach),
              y1: Math.max(y + BIN / 2, y + ay * reach),
            },
            1,
          );
          if (foot.x0 < 2 || foot.y0 < 2 || foot.x1 > W - 2 || foot.y1 > H - 2) continue;
          if (obstacles.some((o) => overlaps(o, foot))) continue;
          slots.push({ s: seg.s0 + u, x, y, ax, ay, foot });
        }
      }
    }
  }
  const order = [...MATERIALS].sort(() => Math.random() - 0.5);
  const chosen: Slot[] = [];
  for (let i = 0; i < order.length; i++) {
    const target = length * (0.1 + (0.8 * i) / (order.length - 1));
    let best: Slot | undefined;
    for (const slot of slots) {
      if (chosen.some((c) => overlaps(grow(c.foot, 3), slot.foot))) continue;
      if (!best || Math.abs(slot.s - target) < Math.abs(best.s - target)) best = slot;
    }
    if (best) chosen.push(best);
  }
  chosen.sort((a, b) => a.s - b.s);
  bins = chosen.map((slot, i) => ({
    material: order[i],
    x: slot.x,
    y: slot.y,
    ax: slot.ax,
    ay: slot.ay,
    count: counts.get(order[i]) ?? 0,
    bump: 0,
    wrong: 0,
    phase: 'idle',
    worker: newWorker(),
    t: 0,
  }));
}

// Grass background, drawn once per layout.
function buildFloor() {
  floor = document.createElement('canvas');
  floor.width = W;
  floor.height = H;
  const g = floor.getContext('2d')!;
  // Grass in the greens of the duckweed on the pond (ALGAE in pond.ts), with little tufts.
  g.fillStyle = '#3f8232';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < (W * H) / 30; i++) {
    const x = Math.floor(Math.random() * W);
    const y = Math.floor(Math.random() * H);
    const tone = Math.random();
    if (tone < 0.45) {
      g.fillStyle = '#2f6b2a';
      g.fillRect(x, y, 1, 1);
    } else if (tone < 0.85) {
      g.fillStyle = '#519a3a'; // blade of grass: two pixels high
      g.fillRect(x, y, 1, 2);
    } else {
      g.fillStyle = '#69b045';
      g.fillRect(x, y, 1, 1);
    }
  }
  // Flowers, the same ones (and just as common) as in the Doe mee game; the belt is drawn over them.
  for (let i = 0; i < (W * H) / 500; i++) {
    const r = Math.random();
    const img = sprites.get(FLOWERS[FLOWER_ODDS.findIndex((k) => r <= k)]);
    if (img) g.drawImage(img, Math.floor(Math.random() * (W - img.width)), Math.floor(Math.random() * (H - img.height)));
  }
  const saved = ctx;
  ctx = g;
  drawBeltFrame();
  ctx = saved;
}

let layoutKey = '';
function resize() {
  const main = document.querySelector('main');
  const nav = document.querySelector('.pond-menu');
  const width = document.documentElement.clientWidth;
  if (!main || !nav || width <= 0 || innerHeight <= 0) return; // not laid out yet: wait for a real resize
  scale = pondScale(width).scale;
  const docH = main.getBoundingClientRect().bottom + scrollY + parseFloat(getComputedStyle(main).marginBottom);
  const card = grow(rectOf(main), 4 / scale + 1); // including the dark border (a box-shadow outside the box)
  const menu = rectOf(nav);
  const key = [width, Math.round(docH), Math.round(card.x0), Math.round(card.y0), Math.round(card.x1), Math.round(card.y1)].join();
  if (key === layoutKey) return; // e.g. the phone's address bar sliding away: keep everything where it is
  layoutKey = key;

  W = Math.floor(width / scale);
  for (const bin of bins) counts.set(bin.material, bin.count);
  // On a narrow screen fewer bins fit between the runs of the belt: then the belt gets longer (more runs),
  // which makes the page itself a bit longer too (the canvas can reach below the card's bottom margin).
  for (let extra = 0; extra <= 8; extra++) {
    H = Math.floor(docH / scale) + extra * ROW_MIN;
    buildPath(card, menu);
    placeBins(card, menu);
    if (bins.length === MATERIALS.length) break;
  }
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
  ctx.imageSmoothingEnabled = false;

  buildFloor();
  placePickers();
  for (const item of items) {
    item.s = Math.min(item.s, length - 1);
    if (item.state === 'flying') item.state = 'belt';
  }
  items = items.filter((item) => item.state !== 'falling');
  particles = [];
  smileys = [];
}

// ---------- Items ----------

// The belt is filled in rounds of five: every round has exactly one item of each material, in a shuffled
// order, and a round never starts with the material the previous one ended with (so never two of the same
// material in a row).
let round: Material[] = [];
let lastMaterial: Material | undefined;
function nextMaterial(): Material {
  if (round.length === 0) {
    do round = [...MATERIALS].sort(() => Math.random() - 0.5);
    while (round[0] === lastMaterial);
  }
  lastMaterial = round.shift()!;
  return lastMaterial;
}

function makeItem(s = 0): Item {
  const material = nextMaterial();
  const battery = material === 'electronics' && Math.random() < BATTERY_CHANCE;
  const kind = pickRandom(KINDS.filter((k) => k.material === material && !!k.battery === battery));
  return { img: sprites.get(kind.sprite)!, material: kind.material, battery, s, state: 'belt', cooldown: 0 };
}

function spawnItem(s = 0) {
  items.push(makeItem(s));
}

function flyTo(item: Item, x1: number, y1: number, then: 'belt' | 'return' | 'bin', bin?: Bin) {
  const from = item.state === 'flying' && item.fly ? { x: item.fly.x1, y: item.fly.y1 } : pos(item.s);
  const dist = Math.hypot(x1 - from.x, y1 - from.y);
  item.state = 'flying';
  item.fly = { x0: from.x, y0: from.y, x1, y1, t: 0, dur: 0.22 + dist / 260, height: Math.min(14, 4 + dist / 5), then, bin };
}

// Knocked off the belt in direction (dx, dy): into the bin it's aimed at, or a little hop that ends back on
// the belt when no bin is in that direction.
function knock(item: Item, dx: number, dy: number) {
  const p = pos(item.s);
  let best: Bin | undefined;
  let bestScore = Infinity;
  for (const bin of bins) {
    const vx = bin.x - p.x;
    const vy = bin.y - p.y;
    const dist = Math.hypot(vx, vy);
    if (dist > AIM_RANGE) continue;
    const cos = (vx * dx + vy * dy) / (dist || 1);
    if (cos < AIM) continue;
    const s = dist * (2 - cos);
    if (s < bestScore) {
      bestScore = s;
      best = bin;
    }
  }
  if (best) flyTo(item, best.x, best.y - 2, 'bin', best);
  else flyTo(item, p.x + dx * 12, p.y + dy * 12, 'return');
}

function landInBin(item: Item, bin: Bin) {
  if (item.material !== bin.material) {
    bin.wrong = 0.8;
    popup(item.material === 'residual' ? 'Oeps, dit is restafval!' : `Oeps, dit is geen ${NAMES[bin.material]}!`, bin.x, bin.y - BIN / 2 - 2, 'bad');
    const p = pos(item.s);
    flyTo(item, p.x, p.y, 'belt');
    return;
  }
  items = items.filter((o) => o !== item);
  bin.count++;
  bin.bump = 0.25;
  score.recycled++;
  renderScore();
  if (bin.count >= NEEDED && bin.phase !== 'sparkle') {
    bin.phase = 'sparkle';
    bin.t = 0;
  }
}

function intoFire(item: Item) {
  items = items.filter((o) => o !== item);
  score.burned++;
  renderScore();
  flare = 0.8;
  if (item.material === 'electronics') explode(item.battery);
  else smileys.push({ x: fire.x + FIRE_W / 2 + between(-10, 10), y: fire.y + 16, t: 0 });
}

// Electronics in the fire: a huge green explosion (instead of the smiley): a fireball, shock waves, flying
// bits and smoke, and the fire stays green for a while.
function explode(battery: boolean) {
  toxic = TOXIC_TIME;
  const cx = fire.x + FIRE_W / 2;
  const cy = fire.y + FLAME_H - 16;
  const rgb = '170, 255, 90';
  for (let k = 0; k < 3; k++) flashes.push({ x: cx, y: cy, t: -k * 0.15, rgb });
  if (!reducedMotion) shake = 1;
  const colors = ['#b6f23a', '#7ad321', '#e8ff7a', '#ffffff', '#5a6660', '#2e222f'];
  for (let i = 0; i < 160; i++) {
    const a = between(Math.PI * 0.9, Math.PI * 2.1); // mostly upward
    const v = between(40, 230);
    particles.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: between(0.8, 1.8), color: pickRandom(colors), size: pickRandom([1, 2, 2, 3]), gravity: 140, kind: 'dot' });
  }
  for (let i = 0; i < 24; i++) {
    particles.push({ x: cx + between(-20, 20), y: cy + between(-16, 4), vx: between(-10, 10), vy: between(-26, -10), life: 0, max: between(1.5, 3), color: pickRandom(['#7fae4a', '#9cbf5e', '#6b8a52']), size: pickRandom([3, 4, 5]), gravity: 0, kind: 'smoke' });
  }
  knockOver(cx, cy);
  popup(battery ? 'Batterij in het vuur!' : 'Elektronica in het vuur!', cx, fire.y - 10, 'bad');
}

// ---------- Popups (DOM, so the text is crisp) ----------

function popup(text: string, x: number, y: number, tone: 'good' | 'bad') {
  const el = document.createElement('div');
  el.className = `belt-popup belt-popup-${tone}`;
  el.textContent = text;
  el.style.left = `${Math.round(Math.min(Math.max(x * scale, 120), W * scale - 120))}px`;
  el.style.top = `${Math.round(y * scale)}px`;
  document.body.appendChild(el);
  const shown = tone === 'good' ? 4500 : 1800; // what a bin made stays a while longer, to read it
  setTimeout(() => el.classList.add('belt-popup-out'), shown);
  setTimeout(() => el.remove(), shown + 400);
}

// ---------- Fire: the classic "Doom fire" (each pixel takes the heat from below, a bit cooler and shifted) ----------

// Simulated at a third of the resolution and drawn 3x bigger, with a few flat colors: chunky pixels
// that match the rest of the pixel art.
const HEAT = 36;
const CELL = 3;
const GRID_W = Math.round(FIRE_W / CELL);
const GRID_H = Math.round(FLAME_H / CELL);
const heat = new Uint8Array(GRID_W * GRID_H);
const fireCanvas = document.createElement('canvas');
fireCanvas.width = GRID_W;
fireCanvas.height = GRID_H;
const fireCtx = fireCanvas.getContext('2d')!;
const fireImage = fireCtx.createImageData(GRID_W, GRID_H);

type RGBA = [number, number, number, number];
function palette(stops: [number, RGBA][]): RGBA[] {
  const out: RGBA[] = [];
  for (let i = 0; i <= HEAT; i++) {
    let k = 0;
    while (k < stops.length - 2 && stops[k + 1][0] < i) k++;
    const [i0, c0] = stops[k];
    const [i1, c1] = stops[k + 1];
    out.push((i >= i1 ? c1 : c0).slice() as RGBA); // flat bands, no gradient
    void i0;
  }
  return out;
}
const FLAMES = palette([
  [0, [60, 10, 5, 0]],
  [3, [110, 20, 10, 0]],
  [6, [140, 25, 10, 0.7]],
  [10, [180, 35, 12, 0.95]],
  [18, [232, 88, 22, 1]],
  [26, [250, 160, 40, 1]],
  [32, [255, 220, 90, 1]],
  [36, [255, 250, 215, 1]],
]);
const TOXIC_FLAMES = palette([
  [0, [20, 50, 20, 0]],
  [3, [30, 70, 25, 0]],
  [6, [35, 95, 28, 0.7]],
  [10, [45, 130, 35, 0.95]],
  [18, [95, 195, 40, 1]],
  [26, [165, 232, 60, 1]],
  [32, [215, 250, 120, 1]],
  [36, [240, 255, 215, 1]],
]);

let fireClock = 0;
function updateFire(dt: number) {
  fireClock += dt;
  if (fireClock < 1 / 30) return;
  fireClock = 0;
  // Average cooling per row: normal flames reach about 30 rows high, toxic ones (and a flare-up) higher.
  const cool = toxic > 0 ? 3.6 : flare > 0 ? 4.4 : 5.6;
  for (let x = 0; x < GRID_W; x++) {
    const hump = Math.sin(((x + 0.5) / GRID_W) * Math.PI); // hotter in the middle: a pointed fire, not a wall
    heat[(GRID_H - 1) * GRID_W + x] = Math.round(HEAT * (0.35 + 0.65 * hump) * between(0.75, 1));
  }
  for (let x = 0; x < GRID_W; x++) {
    for (let y = 1; y < GRID_H; y++) {
      const src = y * GRID_W + x;
      const p = heat[src];
      if (p === 0) {
        heat[src - GRID_W] = 0;
        continue;
      }
      const r = (Math.random() * 3) | 0;
      const dst = src - r + 1 - GRID_W;
      if (dst < 0) continue;
      heat[dst] = Math.max(0, p - Math.floor(Math.random() * cool));
    }
  }
  const mixToxic = Math.min(1, toxic);
  const data = fireImage.data;
  for (let i = 0; i < heat.length; i++) {
    const a = FLAMES[heat[i]];
    const b = TOXIC_FLAMES[heat[i]];
    data[i * 4] = a[0] + (b[0] - a[0]) * mixToxic;
    data[i * 4 + 1] = a[1] + (b[1] - a[1]) * mixToxic;
    data[i * 4 + 2] = a[2] + (b[2] - a[2]) * mixToxic;
    data[i * 4 + 3] = (a[3] + (b[3] - a[3]) * mixToxic) * 255;
  }
  fireCtx.putImageData(fireImage, 0, 0);
}

// ---------- Update ----------

function update(dt: number) {
  time += dt;
  nextSpawn -= dt;
  if (nextSpawn <= 0) {
    spawnItem();
    nextSpawn = between(SPAWN_MIN, SPAWN_MAX);
  }
  toxic = Math.max(0, toxic - dt);
  flare = Math.max(0, flare - dt);
  shake = Math.max(0, shake - dt);

  for (const item of [...items]) {
    item.cooldown = Math.max(0, item.cooldown - dt);
    if (item.state === 'belt') {
      item.s += SPEED * dt;
      if (item.s >= length) {
        const end = pos(length);
        item.state = 'falling';
        item.fall = { x0: end.x, y0: end.y, x1: fire.x + FIRE_W / 2 + between(-12, 12), y1: fire.y + FLAME_H - 6, t: 0 };
      }
    } else if (item.state === 'flying' && item.fly) {
      const f = item.fly;
      f.t += dt;
      if (f.t < f.dur) continue;
      if (f.then === 'bin' && f.bin) landInBin(item, f.bin);
      else if (f.then === 'return') {
        const p = pos(item.s);
        flyTo(item, p.x, p.y, 'belt');
      } else {
        item.state = 'belt';
        item.fly = undefined;
        item.cooldown = 0.35;
      }
    } else if (item.state === 'falling' && item.fall) {
      item.fall.t += dt;
      if (item.fall.t >= 0.55) intoFire(item);
    }
  }

  for (const bin of bins) {
    bin.bump = Math.max(0, bin.bump - dt);
    bin.wrong = Math.max(0, bin.wrong - dt);
    if (bin.phase === 'idle') continue;
    bin.t += dt;
    if (bin.phase === 'sparkle') {
      for (let k = 0; k < 2; k++) {
        if (Math.random() > dt * 30) continue;
        particles.push({
          x: bin.x + between(-BIN / 2 - 8, BIN / 2 + 8),
          y: bin.y + between(-BIN / 2 - 8, BIN / 2 + 8),
          vx: between(-4, 4),
          vy: between(-14, -4),
          life: 0,
          max: between(0.5, 1),
          color: pickRandom(['#ffffff', '#fff3a0', '#9ff2ff', '#ffd23f']),
          size: 1,
          gravity: 0,
          kind: 'twinkle',
        });
      }
      if (bin.t >= SPARKLE_TIME) {
        bin.phase = 'build';
        bin.t = 0;
        bin.count -= NEEDED;
        bin.worker = newWorker();
      }
    } else if (bin.phase === 'build') {
      if (bin.t >= BUILD_TIME) {
        bin.phase = 'made';
        bin.t = 0;
        const { px, py } = workshop(bin);
        popup(PRODUCT_TEXT[bin.material], px, py - 14, 'good');
      }
    } else if (bin.t >= PRODUCT_TIME || (bin.count >= NEEDED && bin.t > 1.5)) {
      bin.phase = bin.count >= NEEDED ? 'sparkle' : 'idle';
      bin.t = 0;
    }
  }

  if (toxic > 0 && Math.random() < dt * 9) {
    particles.push({
      x: fire.x + between(10, FIRE_W - 10),
      y: fire.y + 14,
      vx: between(-4, 4),
      vy: between(-14, -8),
      life: 0,
      max: between(1.6, 2.6),
      color: pickRandom(['#7fae4a', '#9cbf5e', '#6b8a52']),
      size: pickRandom([2, 3, 4]),
      gravity: 0,
      kind: 'smoke',
    });
  }
  for (const p of particles) {
    p.life += dt;
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  particles = particles.filter((p) => p.life < p.max);
  for (const s of smileys) {
    s.t += dt;
    s.y -= 11 * dt;
  }
  smileys = smileys.filter((s) => s.t < 2.2);
  for (const f of flashes) f.t += dt;
  flashes = flashes.filter((f) => f.t < 0.6);
  updateFire(dt);
  updatePickers(dt);
}

// ---------- Draw ----------

const rect = (x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

// Frame, rails and rivets of the belt: static, drawn once into the floor (see buildFloor).
function drawBeltFrame() {
  for (const seg of segments) {
    const r = segmentRect(seg);
    rect(r.x0 - 1, r.y0 - 1, r.x1 - r.x0 + 2, r.y1 - r.y0 + 2, '#1d2124');
    rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, '#8e979e');
  }
  // rivets on the rails
  ctx.fillStyle = '#c3cad0';
  for (const seg of segments) {
    for (let u = 2; u < seg.len; u += 8) {
      const x = seg.x0 + seg.dx * u;
      const y = seg.y0 + seg.dy * u;
      if (seg.dx) {
        ctx.fillRect(x, y - HALF + 1, 1, 1);
        ctx.fillRect(x, y + HALF - 2, 1, 1);
      } else {
        ctx.fillRect(x - HALF + 1, y, 1, 1);
        ctx.fillRect(x + HALF - 2, y, 1, 1);
      }
    }
  }
  for (const seg of segments) {
    const r = segmentRect(seg);
    rect(r.x0 + 2, r.y0 + 2, r.x1 - r.x0 - 4, r.y1 - r.y0 - 4, '#2c3034');
  }
}

function drawBelt() {
  // moving slats across the belt (not in the corners)
  const offset = (time * SPEED) % SLAT;
  ctx.fillStyle = '#3f454b';
  for (const seg of segments) {
    const first = Math.ceil((seg.s0 + HALF - offset) / SLAT) * SLAT + offset;
    for (let s = first; s < seg.s0 + seg.len - HALF; s += SLAT) {
      const u = s - seg.s0;
      const x = seg.x0 + seg.dx * u;
      const y = seg.y0 + seg.dy * u;
      if (seg.dx) ctx.fillRect(Math.round(x), Math.round(y - HALF + 2), 1, BELT - 4);
      else ctx.fillRect(Math.round(x - HALF + 2), Math.round(y), BELT - 4, 1);
    }
  }
}

function drawSprite(img: Sprite, cx: number, cy: number) {
  ctx.drawImage(img, Math.round(cx - img.width / 2), Math.round(cy - img.height / 2));
}

function drawText(text: string, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) g.forEach((row, j) => [...row].forEach((c, i) => c === 'w' && ctx.fillRect(cx + i, y + j, 1, 1)));
    cx += 4;
  }
}

// Straight pixel arrow from the bin to its product; `u` grows it from 0 to full length.
function drawArrow(bin: Bin, u: number) {
  const len = Math.max(1, Math.round((ARROW - 2) * u));
  const sx = bin.x + bin.ax * (BIN / 2 + 1);
  const sy = bin.y + bin.ay * (BIN / 2 + 1);
  const px = -bin.ay; // perpendicular
  const py = bin.ax;
  const dot = (along: number, across: number, color: string) => rect(sx + bin.ax * along + px * across, sy + bin.ay * along + py * across, 1, 1, color);
  for (let a = 0; a < len; a++) {
    dot(a, -2, '#1d2124');
    dot(a, -1, '#ffffff');
    dot(a, 0, '#ffffff');
    dot(a, 1, '#1d2124');
  }
  for (let k = 0; k < 4; k++) {
    for (let c = -k - 1; c <= k; c++) dot(len - k + 2, c, '#ffffff');
  }
}

function drawBin(bin: Bin) {
  const c = BIN_COLORS[bin.material];
  const jolt = bin.bump > 0 ? 1 : 0;
  const shiver = bin.wrong > 0.4 ? Math.round(Math.sin(time * 60)) : 0;
  const x = Math.round(bin.x - BIN / 2) + shiver;
  const y = Math.round(bin.y - BIN / 2) + jolt;
  // A Dutch street container column seen from above: anthracite housing with a roof ridge, a steel drum
  // inlet at the back and a big colored circle with the material's symbol, like the real ones.
  rect(x + 2, y + 3, BIN, BIN, 'rgba(0, 0, 0, 0.3)');
  rect(x - 1, y - 1, BIN + 2, BIN + 2, '#1d2124');
  rect(x, y, BIN, BIN, '#454b51'); // roof, front slope
  rect(x, y, BIN, 11, '#555c63'); // roof, back slope (catches the light)
  rect(x, y + 11, BIN, 1, '#2c3136'); // ridge
  rect(x, y, 1, BIN, '#5f666d');
  rect(x + BIN - 1, y, 1, BIN, '#33383d');
  // steel drum inlet with its handle
  rect(x + 4, y + 1, BIN - 8, 9, '#2c3136');
  rect(x + 5, y + 2, BIN - 10, 7, '#c9ced3');
  rect(x + 5, y + 2, BIN - 10, 1, '#eef1f3');
  rect(x + 5, y + 8, BIN - 10, 1, '#8f979e');
  // colored circle with the symbol
  const cx = x + BIN / 2;
  const cy = y + 19;
  for (let j = -8; j <= 7; j++) {
    const half = Math.round(Math.sqrt(72 - j * j));
    rect(cx - half, cy + j, half * 2 + 1, 1, c.lid);
  }
  for (let j = -8; j <= -5; j++) {
    const half = Math.round(Math.sqrt(72 - j * j));
    rect(cx - half + 1, cy + j, half * 2 - 1, 1, c.light);
  }
  const symbol = symbols.get(bin.material)!;
  ctx.drawImage(symbol, cx - Math.floor(symbol.width / 2), cy - 4);
  // how many are in it, printed on the steel inlet
  drawText(`${Math.min(bin.count, NEEDED)}/${NEEDED}`, x + BIN / 2 - 5, y + 3, '#1d2124');

  if (bin.wrong > 0) {
    for (let i = 0; i < 12; i++) {
      rect(x + 8 + i, y + 8 + i, 2, 2, '#e0312b');
      rect(x + 19 - i, y + 8 + i, 2, 2, '#e0312b');
    }
  }

  if (bin.phase === 'build' || bin.phase === 'made') drawWorkshop(bin);
}

const SKIN_TONES = ['#f6d2b8', '#e8b48f', '#c98f66', '#a0674a', '#6d4432', '#4a2c1e'];
const HAIR_COLORS = ['#1e1a17', '#3b2a1e', '#6b4a2b', '#c9a24a', '#a8432a'];
function newWorker(): Worker {
  return {
    skin: pickRandom(SKIN_TONES),
    hair: pickRandom(HAIR_COLORS),
    female: Math.random() < 0.5,
    beard: Math.random() < 0.3,
    hat: pickRandom(['#f2c230', '#f4f4f4', '#f08a24']),
    vest: pickRandom(['#f08a24', '#c6e030']),
  };
}

// Where the worker stands and where the product appears: side by side in the free spot next to the bin,
// the worker nearest the arrow.
function workshop(bin: Bin) {
  const px = bin.x + bin.ax * (BIN / 2 + ARROW + PRODUCT / 2);
  const py = bin.y + bin.ay * (BIN / 2 + ARROW + PRODUCT / 2);
  const toArrow = bin.ax !== 0 ? -bin.ax : -1;
  return { px, py, wx: Math.round(px + toArrow * 7), prodX: Math.round(px - toArrow * 5), ground: Math.round(py + 8), toArrow };
}

// First the worker hammers on a heap of the material (with sparks), then shows off what they made:
// arms in the air, jumping for joy.
function drawWorkshop(bin: Bin) {
  const { wx, prodX, ground, toArrow } = workshop(bin);
  const facing = -toArrow as 1 | -1; // towards the heap / product
  const building = bin.phase === 'build';
  const fade = building ? 1 : Math.min(1, (PRODUCT_TIME - bin.t) / 1);
  ctx.globalAlpha = Math.max(0, fade);
  drawArrow(bin, building ? Math.min(1, bin.t / 0.35) : 1);
  const c = BIN_COLORS[bin.material];
  if (building) {
    // heap of material, getting smaller as the work goes on
    const left = Math.max(1, 3 - Math.floor((bin.t / BUILD_TIME) * 3));
    for (let i = 0; i < left; i++) {
      rect(prodX - 5 + i * 3, ground - 3 - (i % 2) * 2, 4, 3, i % 2 ? c.light : c.lid);
      rect(prodX - 5 + i * 3, ground - 3 - (i % 2) * 2, 4, 1, '#2e222f');
    }
    const swing = Math.sin(bin.t * 14);
    drawWorker(bin.worker, wx, ground, facing, 'hammer', swing);
    if (swing < -0.9) for (let k = 0; k < 3; k++) rect(prodX - 3 + between(-3, 3), ground - 5 - between(0, 4), 1, 1, pickRandom(['#ffffff', '#ffd23f']));
  } else {
    const img = products.get(bin.material)!;
    const hop = Math.abs(Math.sin(bin.t * 6)) * (bin.t < 3 ? 3 : 1);
    rect(prodX - img.width / 2 + 1, ground - 1, img.width - 2, 2, 'rgba(0, 0, 0, 0.25)');
    const pop = bin.t < 0.3 ? Math.round((1 - bin.t / 0.3) * 4) : 0;
    drawSprite(img, prodX, ground - img.height / 2 - 1 + pop);
    drawWorker(bin.worker, wx, ground - Math.round(hop), facing, 'cheer', 0);
    if (Math.floor(bin.t * 4) % 3 === 0) twinkle(prodX + Math.round(Math.sin(bin.t * 5) * 7), ground - 16, '#fff3a0', 2);
  }
  ctx.globalAlpha = 1;
}

// Side view, about 17 pixels tall; (x, y) is between the feet, dir is where they face.
function drawWorker(w: Worker, x: number, y: number, dir: 1 | -1, pose: 'hammer' | 'cheer', swing: number) {
  const p = (dx: number, dy: number, width: number, height: number, color: string) =>
    rect(dir > 0 ? x + dx : x - dx - width, y + dy, width, height, color);
  p(-3, -2, 2, 2, '#3a2a1e'); // boots
  p(1, -2, 2, 2, '#3a2a1e');
  p(-3, -6, 2, 4, '#2a3a5c'); // work trousers
  p(1, -6, 2, 4, '#2a3a5c');
  p(-3, -11, 6, 5, w.vest); // hi-vis vest with a reflective stripe
  p(-3, -8, 6, 1, '#f4f4f4');
  p(-2, -15, 4, 4, w.skin); // head
  p(1, -13, 1, 1, '#1a1a1a'); // eye
  if (pose === 'cheer') p(0, -12, 2, 1, '#1a1a1a'); // big smile
  if (w.female) p(-4, -14, 2, 4, w.hair); // ponytail
  else p(-2, -14, 1, 2, w.hair);
  if (w.beard && !w.female) p(-1, -12, 3, 1, w.hair);
  p(-3, -17, 6, 2, w.hat); // hard hat with brim
  p(-3, -15, 7, 1, w.hat);
  if (pose === 'cheer') {
    p(-4, -19, 1, 8, w.vest); // both arms up
    p(3, -19, 1, 8, w.vest);
    p(-4, -20, 1, 1, w.skin);
    p(3, -20, 1, 1, w.skin);
  } else {
    // arm with a hammer going up and down
    const up = swing > 0;
    p(2, -10, 2, 2, w.vest);
    p(4, up ? -13 : -9, 1, up ? 4 : 2, w.skin);
    p(4, up ? -15 : -8, 1, 2, '#8a5a30'); // handle
    p(up ? 3 : 5, up ? -16 : -8, 3, 2, '#6b737b'); // hammer head
  }
}

function twinkle(x: number, y: number, color: string, arm: number) {
  rect(x, y, 1, 1, '#ffffff');
  for (let k = 1; k <= arm; k++) {
    rect(x - k, y, 1, 1, color);
    rect(x + k, y, 1, 1, color);
    rect(x, y - k, 1, 1, color);
    rect(x, y + k, 1, 1, color);
  }
}

function drawItem(item: Item) {
  if (item.state === 'belt') {
    const p = pos(item.s);
    drawSprite(item.img, p.x, p.y);
  } else if (item.state === 'flying' && item.fly) {
    const f = item.fly;
    const u = Math.min(1, f.t / f.dur);
    const x = f.x0 + (f.x1 - f.x0) * u;
    const y = f.y0 + (f.y1 - f.y0) * u;
    const lift = Math.sin(u * Math.PI) * f.height;
    rect(x - 5, y + item.img.height / 2 - 2, 10, 2, 'rgba(0, 0, 0, 0.3)');
    drawSprite(item.img, x, y - lift);
  }
}

function drawFire() {
  const sx = shake > 0 ? Math.round(between(-4, 4) * shake) : 0;
  const sy = shake > 0 ? Math.round(between(-2, 2) * shake) : 0;
  const fx = fire.x + sx;
  const fy = fire.y + sy;
  const pitY = fy + FLAME_H - 4;

  // glow on the floor around the fire
  const glow = toxic > 0 ? '140, 230, 60' : '255, 140, 40';
  const flicker = 0.08 + Math.sin(time * 9) * 0.02 + Math.random() * 0.02;
  for (let k = 3; k >= 1; k--) {
    ctx.fillStyle = `rgba(${glow}, ${flicker})`;
    ctx.fillRect(fx - k * 6, fy + 10 - k * 4, FIRE_W + k * 12, FIRE_H - 6 + k * 8);
  }

  // bed of embers and logs (behind the flames and whatever falls in)
  rect(fx + 4, pitY, FIRE_W - 8, PIT_H - 2, '#2a1510');
  rect(fx + 6, pitY + 1, FIRE_W - 12, 2, toxic > 0 ? '#9be03a' : '#f08a24');
  rect(fx + 8, pitY + 3, FIRE_W - 16, 1, toxic > 0 ? '#4d8a24' : '#b8401a');
  for (let i = 0; i < 3; i++) {
    const lx = fx + 8 + i * 14;
    rect(lx, pitY + 3 - (i % 2), 18, 4, '#6b4423');
    rect(lx, pitY + 3 - (i % 2), 18, 1, '#8a5a30');
    rect(lx + 17, pitY + 3 - (i % 2), 2, 4, '#c9a06a');
  }

  for (const item of items) {
    if (item.state !== 'falling' || !item.fall) continue;
    const f = item.fall;
    const u = Math.min(1, f.t / 0.55);
    const x = f.x0 + (f.x1 - f.x0) * u + sx;
    const y = f.y0 + (f.y1 - f.y0) * u * u - Math.sin(u * Math.PI) * 6 + sy;
    drawSprite(item.img, x, y);
  }

  ctx.drawImage(fireCanvas, fx, fy, GRID_W * CELL, GRID_H * CELL);

  // a straight line as the ground under the fire
  rect(fx - 4, pitY + PIT_H - 3, FIRE_W + 8, 2, '#2e222f');
}

function drawEffects() {
  for (const p of particles) {
    const fade = 1 - p.life / p.max;
    if (p.kind === 'twinkle') {
      const arm = fade > 0.75 ? 1 : fade > 0.4 ? 3 : fade > 0.15 ? 2 : 0; // grows, then shrinks away
      twinkle(Math.round(p.x), Math.round(p.y), p.color, arm);
    } else {
      ctx.globalAlpha = p.kind === 'smoke' ? fade * 0.55 : Math.min(1, fade * 2);
      rect(p.x, p.y, p.size, p.size, p.color);
      ctx.globalAlpha = 1;
    }
  }
  for (const f of flashes) {
    if (f.t < 0) continue;
    const u = f.t / 0.6;
    // chunky fireball (only the first wave), then an expanding ring
    if (flashes.indexOf(f) === flashes.findIndex((o) => o.rgb === f.rgb) && u < 0.6) {
      const ball = Math.round(6 + u * 50);
      ctx.fillStyle = `rgba(${f.rgb}, ${0.85 * (1 - u / 0.6)})`;
      for (let y = -ball; y <= ball; y += 3)
        for (let x = -ball; x <= ball; x += 3) if (x * x + y * y * 1.4 <= ball * ball) ctx.fillRect(Math.round(f.x + x), Math.round(f.y + y), 3, 3);
    }
    const radius = 6 + f.t * 220;
    ctx.fillStyle = `rgba(${f.rgb}, ${1 - u})`;
    for (let a = 0; a < Math.PI * 2; a += 1.5 / radius) {
      ctx.fillRect(Math.round(f.x + Math.cos(a) * radius), Math.round(f.y + Math.sin(a) * radius * 0.7), 3, 3);
    }
  }
  for (const s of smileys) {
    ctx.globalAlpha = Math.min(1, (2.2 - s.t) / 0.6, s.t / 0.15);
    const wobble = Math.round(Math.sin(s.t * 5) * 1);
    drawSprite(smileyImg, s.x + wobble, s.y);
    ctx.globalAlpha = 1;
  }
}

function draw() {
  ctx.drawImage(floor, 0, 0);
  drawBelt();
  for (const bin of bins) drawBin(bin);
  drawGrassLitter();
  const jumping = (p: Picker) => !!p.jump;
  for (const picker of [...pickers].sort((a, b) => a.y - b.y)) if (!jumping(picker)) drawPicker(picker);
  for (const item of items) if (item.state === 'belt') drawItem(item);
  for (const picker of pickers) if (jumping(picker)) drawPicker(picker); // over the belt
  drawFire();
  for (const item of items) if (item.state === 'flying') drawItem(item);
  drawEffects();
}

// ---------- Input: swipe (touch) or move the mouse over an item to knock it off the belt ----------

const lastPoint = new Map<number, { x: number; y: number }>();

function sweep(x0: number, y0: number, x1: number, y1: number, touch: boolean) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.05) return;
  const reach = touch ? HIT_TOUCH : HIT;
  for (const item of items) {
    if (item.state !== 'belt' || item.cooldown > 0) continue;
    const p = pos(item.s);
    // distance from the item to the line the pointer just traced
    const u = Math.min(1, Math.max(0, ((p.x - x0) * dx + (p.y - y0) * dy) / (len * len)));
    if (Math.hypot(x0 + dx * u - p.x, y0 + dy * u - p.y) < reach) knock(item, dx / len, dy / len);
  }
}

// Mouse resting on the belt: whatever glides under the cursor is knocked off as well, in the direction the
// mouse last moved (or towards the nearest bin if it hasn't moved yet).
const mouse = { x: -999, y: -999, dx: 0, dy: 0 };
function hoverResting() {
  for (const item of items) {
    if (item.state !== 'belt' || item.cooldown > 0) continue;
    const p = pos(item.s);
    if (Math.hypot(p.x - mouse.x, p.y - mouse.y) >= HIT) continue;
    let { dx, dy } = mouse;
    if (!dx && !dy) {
      const near = [...bins].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (!near) continue;
      const l = Math.hypot(near.x - p.x, near.y - p.y) || 1;
      dx = (near.x - p.x) / l;
      dy = (near.y - p.y) / l;
    }
    knock(item, dx, dy);
  }
}

addEventListener('pointermove', (e) => {
  if (!floor) return;
  const x = (e.clientX + scrollX) / scale;
  const y = (e.clientY + scrollY) / scale;
  const last = lastPoint.get(e.pointerId);
  lastPoint.set(e.pointerId, { x, y });
  if (last) sweep(last.x, last.y, x, y, e.pointerType !== 'mouse');
  if (e.pointerType === 'mouse') {
    const l = last ? Math.hypot(x - last.x, y - last.y) : 0;
    if (last && l > 0.05) Object.assign(mouse, { dx: (x - last.x) / l, dy: (y - last.y) / l });
    Object.assign(mouse, { x, y });
  }
});
addEventListener('pointerdown', (e) => lastPoint.set(e.pointerId, { x: (e.clientX + scrollX) / scale, y: (e.clientY + scrollY) / scale }));
addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && lastPoint.delete(e.pointerId));
addEventListener('pointercancel', (e) => lastPoint.delete(e.pointerId));
// A finger that starts on (or right next to) an item swipes it instead of scrolling the page; anywhere else
// the page scrolls as usual.
addEventListener(
  'touchstart',
  (e) => {
    if (!floor || e.touches.length !== 1) return;
    const t = e.touches[0];
    const x = (t.clientX + scrollX) / scale;
    const y = (t.clientY + scrollY) / scale;
    const onItem = items.some((item) => {
      if (item.state !== 'belt') return false;
      const p = pos(item.s);
      return Math.hypot(p.x - x, p.y - y) < HIT_TOUCH + 2;
    });
    if (onItem) e.preventDefault();
  },
  { passive: false },
);

// ---------- Loop ----------

let previous = 0;
function loop(now: number) {
  const dt = Math.min(0.05, (now - previous) / 1000); // no jump after a hidden tab
  previous = now;
  if (floor) {
    update(dt);
    hoverResting();
    draw();
  }
  requestAnimationFrame(loop);
}

async function init() {
  const pngs = [...KINDS.map((k) => k.sprite).filter((name) => !ITEM_MAPS[name]), ...GRASS_LITTER, ...FLOWERS];
  const loaded = await Promise.all(pngs.map(loadSprite));
  pngs.forEach((name, i) => sprites.set(name, loaded[i]));
  for (const [name, map] of Object.entries(ITEM_MAPS)) sprites.set(name, makeSprite(map.rows, map.palette));
  for (const m of MATERIALS) {
    products.set(m, makeSprite(PRODUCT_MAPS[m].rows, PRODUCT_MAPS[m].palette));
    symbols.set(m, makeSprite(SYMBOLS[m], { w: '#ffffff' }));
  }
  addEventListener('resize', resize);
  void document.fonts.ready.then(resize); // the card gets taller once the font is in
  const main = document.querySelector('main');
  if (main) new ResizeObserver(resize).observe(main);
  resize();
  // Start with a belt that's already running, so there's something to swipe (and to burn) right away.
  if (floor) for (let s = length - 30; s > 0; s -= between(SPAWN_MIN, SPAWN_MAX) * SPEED) spawnItem(s);
  nextSpawn = 0.5;
  renderScore();
  requestAnimationFrame((now) => {
    previous = now;
    requestAnimationFrame(loop);
  });
}

// ---------- Litter pickers on the grass ----------
// Not interactive: a few people like the ones in the Doe mee game walk around on the grass with a grabber and
// a bag. Now and then some litter turns up on the grass; they walk over, pick it up and put it in their bag.

type Picker = {
  x: number; // feet
  y: number;
  dir: 1 | -1;
  walk: number; // walk animation phase
  state: 'walk' | 'rest' | 'pick' | 'travel' | 'gone' | 'knocked';
  knock: { t: number; away: 1 | -1; before: 'walk' | 'rest' | 'pick' | 'travel' } | null; // blown over by an explosion
  leaving: boolean; // travelling off the screen at the end of their shift (otherwise: coming on)
  age: number; // seconds on shift; after about half a minute someone else takes over
  shift: number;
  jump: { x0: number; y0: number; x1: number; y1: number; t: number } | null; // hopping over the belt
  tx: number; // where they're walking to
  ty: number;
  t: number;
  target: GrassLitter | null; // litter they're going for
  held: HTMLCanvasElement | null; // in the grabber, on its way to the bag
  bag: number; // how full their bag is
  tip: { x: number; y: number }; // grabber tip, relative to the feet, in facing direction
  skin: string;
  hair: string;
  longHair: boolean;
  shirt: string;
  pants: string;
};
type GrassLitter = { img: HTMLCanvasElement; x: number; y: number; claimed: boolean };

const PICKER_SPEED = 13;
const SHIFT_MIN = 25; // seconds before someone hands over to a new picker
const SHIFT_MAX = 35;
const JUMP_TIME = 0.7;
const KNOCK_RANGE = 90; // people this close to an exploding fire are blown over
const KNOCK_TIME = 3.6; // falling, lying, getting up and standing there dizzy
const FLOWERS = ['narcis', 'roos', 'viooltje', 'madelief', 'tulp'];
const FLOWER_ODDS = [0.45, 0.6, 0.72, 0.86, 1]; // cumulative, as in background.ts: the daffodil is the most common
const GRASS_LITTER = ['sigaret', 'chips', 'beker', 'schoen', 'wiel', 'knop'];
const GRASS_MAX = 4; // at most this much litter on the grass at once
const GRASS_MIN_T = 2; // seconds between two new bits of litter on the grass
const GRASS_MAX_T = 5;
const SHIRTS = ['#f08a24', '#e6c229', '#3a8ad6', '#c0392b', '#8a4fb0', '#f4f4f4'];
const PANTS = ['#2a3a5c', '#3a3a3a', '#5a4630', '#1f4d3a'];
let pickers: Picker[] = [];
let grassLitter: GrassLitter[] = [];
let grassSprites: HTMLCanvasElement[] = []; // half size: background litter, not part of the game
let grassDeck: HTMLCanvasElement[] = [];
let nextGrassLitter = 1;
let blocked: Rect[] = [];

// Only the legs have to be on free grass: seen from this angle the head may stick out over the belt behind them.
const personRect = (x: number, y: number): Rect => ({ x0: x - 6, y0: y - 9, x1: x + 6, y1: y + 1 });
const isFree = (x: number, y: number) => {
  if (x < 8 || x > W - 8 || y < 26 || y > H - 4) return false;
  const r = personRect(x, y);
  return !blocked.some((b) => overlaps(b, r));
};
function clearPath(x0: number, y0: number, x1: number, y1: number) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3);
  for (let i = 1; i <= steps; i++) if (!isFree(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps)) return false;
  return true;
}

// On every new layout: work out where the grass is free and put a few people on it.
function placePickers() {
  const card = document.querySelector('main');
  const nav = document.querySelector('.pond-menu');
  blocked = [
    ...segments.map((seg) => grow(segmentRect(seg), 2)),
    ...bins.map((bin) => grow({ x0: bin.x - BIN / 2, y0: bin.y - BIN / 2 - 6, x1: bin.x + BIN / 2, y1: bin.y + BIN / 2 }, 2)),
    { x0: fire.x - 10, y0: fire.y - 20, x1: fire.x + FIRE_W + 10, y1: H },
  ];
  if (card) blocked.push(grow(rectOf(card), 4 / scale + 2));
  if (nav) blocked.push(rectOf(nav));
  grassSprites = GRASS_LITTER.map((name) => {
    const img = sprites.get(name)!;
    const c = document.createElement('canvas');
    c.width = Math.ceil(img.width / 2);
    c.height = Math.ceil(img.height / 2);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  });
  grassLitter = [];
  pickers = [];
  const count = W < 220 ? 2 : 3;
  for (let tries = 0; tries < 400 && pickers.length < count; tries++) {
    const x = Math.round(between(10, W - 10));
    const y = Math.round(between(30, H - 6));
    if (!isFree(x, y) || pickers.some((p) => Math.hypot(p.x - x, p.y - y) < 30)) continue;
    pickers.push(newPicker(x, y));
  }
}

function newPicker(x: number, y: number): Picker {
  return {
    x,
    y,
    dir: Math.random() < 0.5 ? 1 : -1,
    walk: 0,
    state: 'rest',
    tx: x,
    ty: y,
    t: between(0.5, 3),
    target: null,
    held: null,
    bag: 0,
    tip: { x: 9, y: -3 },
    age: 0,
    shift: between(SHIFT_MIN, SHIFT_MAX),
    jump: null,
    leaving: false,
    knock: null,
    skin: pickRandom(SKIN_TONES),
    hair: pickRandom(HAIR_COLORS),
    longHair: Math.random() < 0.5,
    shirt: pickRandom(SHIRTS),
    pants: pickRandom(PANTS),
  };
}

// An explosion in the fire blows everyone nearby over: they fall (away from the fire), lie there for a
// moment, get up again and stand there dizzy before carrying on.
function knockOver(x: number, y: number) {
  for (const p of pickers) {
    if (p.jump || p.state === 'knocked' || Math.hypot(p.x - x, p.y - y) > KNOCK_RANGE) continue;
    if (p.state === 'pick' && p.target) p.target.claimed = false;
    if (p.state === 'pick') p.target = null;
    p.held = null;
    p.knock = { t: 0, away: p.x < x ? -1 : 1, before: p.state as 'walk' | 'rest' | 'pick' | 'travel' };
    p.state = 'knocked';
  }
}

// Coming on and going off shift: people walk straight in from, or out to, the side of the screen, and hop over
// any belt in their way.
const onBelt = (x: number, y: number) => {
  const r = personRect(x, y);
  return segments.some((seg) => overlaps(grow(segmentRect(seg), 1), r));
};

function goHome(p: Picker) {
  if (p.target) p.target.claimed = false;
  p.target = null;
  p.state = 'travel';
  p.leaving = true;
  p.tx = p.x < W / 2 ? -12 : W + 12;
  p.ty = p.y;
}

// Someone new takes over: they walk in from the side of the screen to a free spot on the grass.
function sendReplacement() {
  for (let tries = 0; tries < 100; tries++) {
    const x = Math.round(between(12, W - 12));
    const y = Math.round(between(30, H - 6));
    if (!isFree(x, y)) continue;
    const p = newPicker(x < W / 2 ? -12 : W + 12, y);
    p.state = 'travel';
    p.tx = x;
    p.ty = y;
    pickers.push(p);
    return;
  }
}

function travel(p: Picker, dt: number) {
  if (p.jump) {
    const j = p.jump;
    j.t += dt;
    const u = Math.min(1, j.t / JUMP_TIME);
    p.x = j.x0 + (j.x1 - j.x0) * u;
    p.tip = { x: 7, y: -12 };
    if (u >= 1) p.jump = null;
    return;
  }
  const dx = p.tx - p.x;
  if (Math.abs(dx) < 0.5) {
    if (p.leaving) p.state = 'gone';
    else {
      p.state = 'rest';
      p.t = between(0.3, 1);
    }
    return;
  }
  const dir = dx < 0 ? -1 : 1;
  p.dir = dir;
  const nx = p.x + dir * Math.min(Math.abs(dx), PICKER_SPEED * dt);
  if (onBelt(nx, p.y)) {
    // belt ahead: hop over it to the first free grass on the other side
    for (let k = 1; k < 80; k++) {
      const lx = p.x + dir * k;
      if (!onBelt(lx, p.y)) {
        p.jump = { x0: p.x, y0: p.y, x1: lx + dir * 2, y1: p.y, t: 0 };
        return;
      }
    }
  }
  p.x = nx;
  p.walk += dt * 8;
  p.tip = { x: 9, y: -3 + Math.round(Math.sin(p.walk * 2)) };
}

// New litter turns up somewhere on the grass, not too far from one of the people, where they can reach it.
function dropGrassLitter() {
  if (grassLitter.length >= GRASS_MAX || pickers.length === 0) return;
  for (let tries = 0; tries < 150; tries++) {
    const p = pickRandom(pickers);
    const a = Math.random() * Math.PI * 2;
    const d = between(20, 120);
    const x = Math.round(p.x + Math.cos(a) * d);
    const y = Math.round(p.y + Math.sin(a) * d * 0.6);
    if (!isFree(x, y)) continue;
    if (!(isFree(x - 10, y) && clearPath(p.x, p.y, x - 10, y)) && !(isFree(x + 10, y) && clearPath(p.x, p.y, x + 10, y))) continue;
    // a shuffled deck, so it's a different item every time instead of the same thing over and over
    if (grassDeck.length === 0) grassDeck = [...grassSprites].sort(() => Math.random() - 0.5);
    grassLitter.push({ img: grassDeck.pop()!, x, y, claimed: false });
    return;
  }
}

// A spot next to the litter they can walk to in a straight line.
function goFor(p: Picker, it: GrassLitter) {
  for (const side of [p.x < it.x ? -1 : 1, p.x < it.x ? 1 : -1]) {
    const x = it.x + side * 8;
    if (isFree(x, it.y) && clearPath(p.x, p.y, x, it.y)) {
      it.claimed = true;
      p.target = it;
      p.tx = x;
      p.ty = it.y;
      p.state = 'walk';
      return true;
    }
  }
  return false;
}

// Otherwise: stroll to a new spot, not too far, without walking through the belt, a bin or the card.
function wander(p: Picker) {
  for (let tries = 0; tries < 30; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = between(15, 60);
    const x = Math.round(p.x + Math.cos(a) * d);
    const y = Math.round(p.y + Math.sin(a) * d * 0.6);
    if (isFree(x, y) && clearPath(p.x, p.y, x, y)) {
      p.tx = x;
      p.ty = y;
      p.state = 'walk';
      return;
    }
  }
  p.state = 'rest';
  p.t = between(1, 2);
}

function walkTowards(p: Picker, dt: number) {
  const dx = p.tx - p.x;
  const dy = p.ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) return true;
  const step = Math.min(d, PICKER_SPEED * dt);
  p.x += (dx / d) * step;
  p.y += (dy / d) * step;
  if (Math.abs(dx) > 0.5) p.dir = dx < 0 ? -1 : 1;
  p.walk += dt * 8;
  p.tip = { x: 9, y: -3 + Math.round(Math.sin(p.walk * 2)) };
  return false;
}

function updatePickers(dt: number) {
  nextGrassLitter -= dt;
  if (nextGrassLitter <= 0) {
    dropGrassLitter();
    nextGrassLitter = between(GRASS_MIN_T, GRASS_MAX_T);
  }
  for (const p of [...pickers]) updatePicker(p, dt);
  pickers = pickers.filter((p) => p.state !== 'gone');
  const working = pickers.filter((p) => !p.leaving).length;
  if (working < (W < 220 ? 2 : 3) && Math.random() < dt) sendReplacement();
}

function updatePicker(p: Picker, dt: number) {
  p.t -= dt;
  p.age += dt;
  if (p.state === 'knocked' && p.knock) {
    p.knock.t += dt;
    if (p.knock.t >= KNOCK_TIME) {
      p.state = p.knock.before === 'pick' ? 'rest' : p.knock.before;
      p.knock = null;
    }
    return;
  }
  if (p.state === 'travel') return travel(p, dt);
  // shift over: off they go (not in the middle of picking something up)
  if (p.age > p.shift && p.state === 'rest' && !p.held) return goHome(p);
  if (p.state === 'walk') {
    if (!walkTowards(p, dt)) return;
    if (p.target) {
      p.dir = p.target.x < p.x ? -1 : 1;
      p.state = 'pick';
      p.t = 1.4;
    } else {
      p.state = 'rest';
      p.t = between(0.6, 2.2);
    }
  } else if (p.state === 'rest') {
    p.tip = { x: 9, y: -3 };
    if (p.t > 0) return;
    const free = grassLitter.filter((it) => !it.claimed).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    if (!free.some((it) => goFor(p, it))) wander(p);
  } else if (p.state === 'pick') {
    // reach down, close the grabber, bring it round to the bag on their back and let go
    const u = 1 - p.t / 1.4;
    if (u < 0.3) p.tip = { x: 10, y: -1 };
    else {
      if (p.target) {
        p.held = p.target.img;
        grassLitter = grassLitter.filter((it) => it !== p.target);
        p.target = null;
      }
      const v = Math.min(1, (u - 0.3) / 0.5);
      p.tip = { x: 10 - v * 17, y: -1 - Math.sin(v * Math.PI) * 10 - v * 10 };
      if (u > 0.8 && p.held) {
        p.held = null;
        p.bag = Math.min(3, p.bag + 1);
      }
    }
    if (p.t > 0) return;
    p.state = 'rest';
    p.t = between(0.4, 1.2);
  }
}

// Litter lying on the grass (before the people so they stand in front of it).
function drawGrassLitter() {
  for (const it of grassLitter) ctx.drawImage(it.img, Math.round(it.x - it.img.width / 2), Math.round(it.y - it.img.height + 1));
}

// Side view, like the people in the Doe mee game: feet at (x, y), bag on the back, grabber in front.
function drawPicker(p: Picker) {
  const fx = Math.round(p.x);
  const hop = p.jump ? Math.sin(Math.min(1, p.jump.t / JUMP_TIME) * Math.PI) * 14 : 0;
  const fy = Math.round(p.y - hop);
  const d = p.dir;
  const q = (x: number, y: number, w: number, h: number, c: string) => rect(d > 0 ? fx + x : fx - x - w, fy + y, w, h, c);
  let tilt = 0; // blown over: 0 = standing, ±90° = lying on the ground
  if (p.knock) {
    const t = p.knock.t;
    const fall = t < 0.3 ? t / 0.3 : t < 1.6 ? 1 : t < 2.1 ? 1 - (t - 1.6) / 0.5 : 0;
    tilt = p.knock.away * (fall * Math.PI) / 2;
    if (t >= 2.1) tilt = Math.sin(t * 9) * 0.12; // wobbly on their feet
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(tilt);
    ctx.translate(-fx, -fy);
  }
  const walking = (p.state === 'walk' || p.state === 'travel') && !p.jump;
  const sway = walking ? Math.round(Math.sin(p.walk)) : 0;
  const lift = walking && Math.cos(p.walk) > 0 ? 1 : 0;

  rect(fx - 5, Math.round(p.y) - 1, 10, 2, 'rgba(0, 0, 0, 0.2)'); // shadow, stays on the ground during a jump
  q(-10, -11 - p.bag, 6, 7 + p.bag, '#222e26'); // bag on the back, filling up
  q(-10, -11 - p.bag, 6, 1, '#5a6f61');
  q(-3 - sway, -9, 3, 9 - (lift ? 0 : 1), p.pants);
  q(-3 - sway, -2, 3, 2, '#1f1f1f');
  q(1 + sway, -9, 3, 9 - lift, p.pants);
  q(1 + sway, -2 - lift, 3, 2, '#1f1f1f');
  q(-4, -18, 8, 9, p.shirt);
  q(-6, -17, 2, 6, p.shirt);
  q(-6, -11, 2, 2, p.skin);
  q(-3, -24, 6, 6, p.skin);
  q(-3, -24, 6, 2, p.hair);
  q(-3, -22, 1, 3, p.hair);
  if (p.longHair) q(-4, -23, 2, 9, p.hair);
  q(1, -21, 1, 1, '#1a1a1a');

  // arm towards the grabber tip, then the grabber itself
  const shoulder = { x: 3, y: -16 };
  const vx = p.tip.x - shoulder.x;
  const vy = p.tip.y - shoulder.y;
  const len = Math.hypot(vx, vy) || 1;
  const arm = Math.min(len, 5);
  for (let k = 0; k <= arm; k++) q(Math.round(shoulder.x + (vx / len) * k), Math.round(shoulder.y + (vy / len) * k), 2, 2, p.shirt);
  const hand = { x: Math.round(shoulder.x + (vx / len) * arm), y: Math.round(shoulder.y + (vy / len) * arm) };
  q(hand.x, hand.y, 2, 2, p.skin);
  const tip = { x: Math.round(p.tip.x), y: Math.round(p.tip.y) };
  const steps = Math.max(1, Math.round(Math.hypot(tip.x - hand.x, tip.y - hand.y)));
  for (let k = 0; k <= steps; k++) {
    const x = Math.round(hand.x + ((tip.x - hand.x) * k) / steps);
    const y = Math.round(hand.y + ((tip.y - hand.y) * k) / steps);
    q(x, y, 1, 1, k < 3 ? '#c0392b' : '#8a97a3');
  }
  if (p.held) ctx.drawImage(p.held, Math.round(fx + d * tip.x - p.held.width / 2), Math.round(fy + tip.y - p.held.height / 2));
  if (p.knock) {
    ctx.restore();
    // dizzy: little stars circling around their head, from the moment they're down until they carry on
    if (p.knock.t > 0.4) {
      const head = p.knock.t < 2.1 ? { x: fx + p.knock.away * 20 * Math.sin(Math.abs(tilt)), y: fy - 20 * Math.cos(tilt) } : { x: fx, y: fy - 22 };
      for (let k = 0; k < 3; k++) {
        const a = time * 5 + (k * Math.PI * 2) / 3;
        rect(Math.round(head.x + Math.cos(a) * 6), Math.round(head.y - 4 + Math.sin(a) * 2), 1, 1, '#ffe14d');
        rect(Math.round(head.x + Math.cos(a) * 6) - 1, Math.round(head.y - 4 + Math.sin(a) * 2), 3, 1, 'rgba(255, 225, 77, 0.5)');
      }
    }
  }
}

init();
