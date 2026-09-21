// Background of "Doe mee": a park where litter and nature slowly fall down. Drag or move the litter bag
// to catch it. Whatever you miss stays on the ground and slowly forms a pile. When litter is lying around,
// people (up to three at a time) with a grabber and their own bag come by to pick it up. The game is never
// finished: it's decor behind the text, with two counters bottom-left: your score and the others' score.

import './catch.css';
import { pondScale } from './pixel';
import { buildBackground, loadBackground, drawBackground } from './background';
import { loadBird, placeBird, drawBird, updateBird } from './bird';

const LITTER = ['batterij', 'schoen', 'fles', 'beker', 'chips', 'sigaret'];
const NATURE = ['blad', 'blad2'];

const BAG_SPEED = 2400; // max bag movement in pixels per second
const SINK = 2; // how many pixels the bag sinks into the pile it stands on
const CLIMB = 40; // pixels per second the bag slides upward as the pile grows
const CATCH_MARGIN = 1; // once the bottom of falling litter is this many pixels below the bag's top edge, it's caught
const SWAY = 3; // leaves sway a little from side to side
const FALL_MIN = 20; // pond pixels per second; slow, since this is a background
const FALL_MAX = 34;
const INTERVAL_MIN = 0.8; // seconds between two items
const INTERVAL_MAX = 1.5;
const NATURE_CHANCE = 0.2;
const PILE_MAX = 0.4; // the pile grows to this fraction of the screen; nothing falls after that
const SCORE_KEY_YOU = 'litter-collected'; // same counter as in the pond, so it survives page navigation
const SCORE_KEY_OTHERS = 'catch-others';
const PEOPLE_MAX = 2; // two people, who sit together at the coffee table until enough litter piles up
const STAND_UP_THRESHOLD = 2; // only once there are more than this many unclaimed lying items do they stand up
const PERSON_SPEED = 14; // pond pixels per second
const PERSON_DISTANCE = 9; // how far from the litter someone stops while picking it up
const LIFE_MIN = 8; // nature decays: after this many seconds (between min and max) it fades and disappears
const LIFE_MAX = 14;
const FADE_DURATION = 1.5; // how long the fade takes
const TABLE_ZONE = 17; // half the width of the zone around the coffee table where no litter lands
const TABLE_SPOTS = [-14, 14]; // where the two people stand during their break, relative to the table's center
const PICKUP_DURATION = 1.9; // seconds per item
const ROLL = 3; // if an item lands this many pixels higher than the spot next to it, it rolls that way

type FallingItem = {
  img: HTMLImageElement;
  nature: boolean;
  x: number;
  y: number;
  vy: number;
  t: number; // game second it started falling
  phase: number;
  gone: boolean; // caught: disappears into the bag
};
type LyingItem = { img: HTMLImageElement; nature: boolean; x: number; bottom: number; claim?: Person; life?: number };
type Person = {
  spot: number; // which spot at the coffee table (index in TABLE_SPOTS)
  standing: boolean; // standing at the coffee table drinking
  coffee: number; // seconds already on break, drives the sip animation
  x: number; // feet, center
  y: number;
  dir: 1 | -1; // facing direction
  walkPhase: number; // phase of the walk animation
  state: 'walking' | 'picking' | 'break';
  target: LyingItem | null;
  t: number; // seconds into the current pickup
  bagCount: number; // how much is already in their bag
  tip: { x: number; y: number }; // grabber tip, relative to the feet and in facing direction
  mouth: number; // 0 = closed, 1 = open
  held: HTMLImageElement | null; // what the grabber is holding
  reach: { x: number; y: number }; // center of the litter being reached for, same coordinates as tip
  skin: string;
  hair: string;
  longHair: boolean;
  cap: boolean;
  shirt: string;
  pants: string;
}; // bottom = distance from the item's bottom edge to the ground

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const youEl = document.getElementById('score-you');
const othersEl = document.getElementById('score-others');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const loadSprite = (name: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`sprite ${name} not found`));
    img.src = `${import.meta.env.BASE_URL}sprites/${name}.png`;
  });

let bagImg!: HTMLImageElement;
let litterSprites: HTMLImageElement[] = [];
let natureSprites: HTMLImageElement[] = [];

let scale = 1;
let W = 0;
let H = 0;
const bag = { x: 0, y: 0, target: 0, jolt: 0 };

const score = { you: 0, others: 0 };
try {
  score.you = Number(sessionStorage.getItem(SCORE_KEY_YOU)) || 0;
  score.others = Number(sessionStorage.getItem(SCORE_KEY_OTHERS)) || 0;
} catch {
  /* storage blocked: counters then start at 0 */
}
function renderScore() {
  if (youEl) youEl.textContent = String(score.you);
  if (othersEl) othersEl.textContent = String(score.others);
}
function addScore(who: 'you' | 'others') {
  score[who]++;
  renderScore();
  try {
    sessionStorage.setItem(who === 'you' ? SCORE_KEY_YOU : SCORE_KEY_OTHERS, String(score[who]));
  } catch {
    /* see above */
  }
}
renderScore();

// Per column of a sprite: the topmost and bottommost non-transparent pixel (-1 = empty column).
const profiles = new Map<HTMLImageElement, { top: number[]; bottom: number[] }>();
function profileOf(img: HTMLImageElement) {
  let p = profiles.get(img);
  if (p) return p;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, img.width, img.height).data;
  p = { top: Array(img.width).fill(-1), bottom: Array(img.width).fill(-1) };
  for (let x = 0; x < img.width; x++) {
    for (let y = 0; y < img.height; y++) {
      if (data[(y * img.width + x) * 4 + 3] < 128) continue;
      if (p.top[x] < 0) p.top[x] = y;
      p.bottom[x] = y;
    }
  }
  profiles.set(img, p);
  return p;
}

// The pile: height per column, a canvas with everything lying on it, and the list to rebuild it on resize.
let heights = new Int16Array(0);
let pile: HTMLCanvasElement;
let pileCtx: CanvasRenderingContext2D;
let lyingItems: LyingItem[] = [];
const table = { x: 0 }; // center of the coffee table, on the ground
const onTable = (x: number, width: number) => x + width > table.x - TABLE_ZONE && x < table.x + TABLE_ZONE;

// Highest y (top of the sprite) at which the item at x still rests on the pile or the ground.
function landing(img: HTMLImageElement, x: number) {
  const { bottom } = profileOf(img);
  let y = Infinity;
  for (let c = 0; c < img.width; c++) if (bottom[c] >= 0) y = Math.min(y, H - heights[x + c] - bottom[c] - 1);
  return y;
}

function place(img: HTMLImageElement, x: number, y: number) {
  const { top } = profileOf(img);
  for (let c = 0; c < img.width; c++) if (top[c] >= 0) heights[x + c] = Math.max(heights[x + c], H - (y + top[c]));
  pileCtx.drawImage(img, x, y);
}

function buildPile() {
  heights = new Int16Array(W);
  pile = document.createElement('canvas');
  pile.width = W;
  pile.height = H;
  pileCtx = pile.getContext('2d')!;
  pileCtx.imageSmoothingEnabled = false;
  table.x = W - 26;
  lyingItems = lyingItems.filter((it) => it.x + it.img.width <= W && !onTable(it.x, it.img.width));
  for (const it of lyingItems) place(it.img, it.x, H - it.bottom - it.img.height);
}

// Removes one item from the pile. Whatever was on top of it settles down; the rest stays exactly in place.
function removeItem(item: LyingItem) {
  const rest = lyingItems.filter((o) => o !== item).sort((a, b) => a.bottom - b.bottom);
  heights = new Int16Array(W);
  pileCtx.clearRect(0, 0, W, H);
  for (const o of rest) {
    const y = Math.floor(landing(o.img, o.x));
    place(o.img, o.x, y);
    o.bottom = H - y - o.img.height;
  }
  lyingItems = rest;
}

// Redraws everything lying on the ground; nature that's fading becomes transparent.
function redraw() {
  pileCtx.clearRect(0, 0, W, H);
  for (const it of lyingItems) {
    pileCtx.globalAlpha = it.life !== undefined && it.life < FADE_DURATION ? Math.max(0, it.life / FADE_DURATION) : 1;
    pileCtx.drawImage(it.img, it.x, H - it.bottom - it.img.height);
  }
  pileCtx.globalAlpha = 1;
}

function settleItem(item: FallingItem) {
  let x = Math.min(Math.max(Math.round(item.x), 0), W - item.img.width);
  let y = landing(item.img, x);
  // On a slope the item rolls downhill; that's what turns it into a pile instead of a flat layer.
  for (let step = 0; step < 60; step++) {
    const l = x > 0 && !onTable(x - 1, item.img.width) ? landing(item.img, x - 1) : -Infinity;
    const r = x < W - item.img.width && !onTable(x + 1, item.img.width) ? landing(item.img, x + 1) : -Infinity;
    const best = Math.max(l, r);
    if (best - y < ROLL) break;
    x += l > r ? -1 : 1;
    y = best;
  }
  y = Math.floor(y);
  place(item.img, x, y);
  lyingItems.push({
    img: item.img,
    nature: item.nature,
    x,
    bottom: H - y - item.img.height,
    life: item.nature ? between(LIFE_MIN, LIFE_MAX) : undefined,
  });
}

// The bag stands on the ground, or on the pile if it's higher there.
function bagRestY() {
  const left = Math.max(0, Math.round(bag.x));
  let top = 0;
  for (let c = 0; c < bagImg.width && left + c < W; c++) top = Math.max(top, heights[left + c]);
  return H - bagImg.height - Math.max(0, top - SINK);
}

// The Nieuwe Kerk stands next to the text cloud (to its right) if there's room, otherwise against the right
// edge, so it never disappears behind the text.
function churchSpot() {
  // Right edge of the clouds (or of all the text, otherwise).
  const parts = [...document.querySelectorAll('.cloud, main')];
  if (parts.length === 0) return undefined;
  const right = Math.max(...parts.map((d) => d.getBoundingClientRect().right)) / scale;
  const free = W - right;
  return Math.round(free >= 70 ? right + free / 2 : W - 12);
}

function resize() {
  scale = pondScale().scale;
  W = Math.ceil(innerWidth / scale);
  H = Math.ceil(innerHeight / scale);
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
  ctx.imageSmoothingEnabled = false;
  buildBackground(W, H, churchSpot());
  placeBird(W, H);
  buildPile();
  bag.y = bagRestY();
  bag.target = Math.min(Math.max(bag.target, 0), W - bagImg.width);
  bag.x = Math.min(bag.x, W - bagImg.width);
  fallingItems = fallingItems.filter((it) => it.x + it.img.width <= W);
}

let fallingItems: FallingItem[] = [];
let time = 0;
let nextDrop = 0.5;
let keyDir = 0;

const between = (a: number, b: number) => a + Math.random() * (b - a);
const pickRandom = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

function spawnItem() {
  if (Math.max(...heights) >= H * PILE_MAX) return; // the pile is full
  const isNature = Math.random() < NATURE_CHANCE;
  const img = pickRandom(isNature ? natureSprites : litterSprites);
  // More towards the middle than the edges: that gives a pile instead of an even layer.
  let x = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    x = Math.round((0.5 + (Math.random() + Math.random() - 1) * 0.5) * (W - img.width));
    if (!onTable(x, img.width)) break;
  }
  if (onTable(x, img.width)) return; // nothing falls near the coffee table
  fallingItems.push({ img, nature: isNature, x, y: -img.height, vy: between(FALL_MIN, FALL_MAX), t: time, phase: Math.random() * 6, gone: false });
}

const swayOffset = (item: FallingItem) => (item.nature && !reducedMotion ? Math.sin(time * 3 + item.phase) * SWAY : 0);

function update(dt: number) {
  updateBird(dt, reducedMotion);
  if (keyDir) bag.target = Math.min(Math.max(bag.target + keyDir * BAG_SPEED * dt, 0), W - bagImg.width);
  const step = BAG_SPEED * dt;
  bag.x += Math.min(step, Math.max(-step, bag.target - bag.x));
  bag.jolt = Math.max(0, bag.jolt - dt);
  const stepY = CLIMB * dt;
  bag.y += Math.min(stepY, Math.max(-stepY, bagRestY() - bag.y));

  time += dt;
  nextDrop -= dt;
  if (nextDrop <= 0) {
    spawnItem();
    nextDrop += between(INTERVAL_MIN, INTERVAL_MAX);
  }

  const bagY = Math.round(bag.y);
  for (const item of fallingItems) {
    item.y += item.vy * dt;
    // If falling litter even just touches the bag, it's caught. Nature and litter already lying don't count.
    if (
      !item.nature &&
      item.x + item.img.width > bag.x &&
      item.x < bag.x + bagImg.width &&
      item.y + item.img.height > bagY + CATCH_MARGIN &&
      item.y < bagY + bagImg.height
    ) {
      item.gone = true;
      bag.jolt = reducedMotion ? 0 : 0.12;
      addScore('you');
      continue;
    }
    // Swaying leaves land wherever they happen to be hanging at that moment.
    const x = Math.min(Math.max(Math.round(item.x + swayOffset(item)), 0), W - item.img.width);
    if (item.y >= landing(item.img, x)) {
      item.x = x;
      item.gone = true;
      settleItem(item);
    }
  }
  fallingItems = fallingItems.filter((item) => !item.gone);

  let fading = false;
  for (const it of [...lyingItems]) {
    if (it.life === undefined) continue;
    it.life -= dt;
    if (it.life <= 0) removeItem(it);
    else if (it.life < FADE_DURATION) fading = true;
  }
  if (fading) redraw();

  managePeople();
  for (const p of people) updatePerson(p, dt);
}

function draw() {
  const now = performance.now() / 1000;
  drawBackground(ctx, W, now, reducedMotion);
  drawBird(ctx, now);
  ctx.drawImage(pile, 0, 0);
  for (const item of fallingItems) ctx.drawImage(item.img, Math.round(item.x + swayOffset(item)), Math.round(item.y));
  drawTable(now);
  for (const p of people) drawPerson(p, now);
  ctx.drawImage(bagImg, Math.round(bag.x), Math.round(bag.y) + (bag.jolt > 0 ? 1 : 0));
}


// ---------- People who pick up the litter ----------

const SKIN_TONES = ['#f6d2b8', '#e8b48f', '#c98f66', '#a0674a', '#6d4432', '#4a2c1e'];
const HAIR_COLORS = ['#1e1a17', '#3b2a1e', '#6b4a2b', '#c9a24a', '#a8432a', '#8d8d8d'];
const SHIRT_COLORS = ['#f08a24', '#e6c229', '#3a8ad6', '#c0392b', '#2e8b57', '#8a4fb0']; // orange and yellow: hi-vis vest
const PANTS_COLORS = ['#2a3a5c', '#3a3a3a', '#5a4630', '#1f4d3a'];

let people: Person[] = [];

const groundY = (x: number) => {
  let h = 0;
  for (let i = Math.max(0, Math.round(x) - 2); i <= Math.min(W - 1, Math.round(x) + 2); i++) h = Math.max(h, heights[i]);
  return H - h; // people walk over the pile
};
const smoothstep = (u: number) => u * u * (3 - 2 * u);
const mix = (a: number, b: number, u: number) => a + (b - a) * u;
// Only once more than STAND_UP_THRESHOLD items are lying around (unclaimed) do people stand up.
const unclaimedLitter = () => lyingItems.filter((it) => !it.nature && !it.claim).length > STAND_UP_THRESHOLD;

function makePerson(spot: number): Person {
  const x = table.x + TABLE_SPOTS[spot];
  return {
    spot,
    standing: true,
    coffee: Math.random() * 5,
    x,
    y: groundY(x),
    dir: TABLE_SPOTS[spot] < 0 ? 1 : -1,
    walkPhase: 0,
    state: 'break',
    target: null,
    t: 0,
    bagCount: 0,
    tip: { x: 6, y: -12 },
    mouth: 0,
    held: null,
    reach: { x: 0, y: 0 },
    skin: pickRandom(SKIN_TONES),
    hair: pickRandom(HAIR_COLORS),
    longHair: Math.random() < 0.5,
    cap: Math.random() < 0.3,
    shirt: pickRandom(SHIRT_COLORS),
    pants: pickRandom(PANTS_COLORS),
  };
}

// The two people already sit at the coffee table as soon as the pile is first known (buildPile gives table.x).
function managePeople() {
  if (people.length >= PEOPLE_MAX) return;
  for (let spot = people.length; spot < PEOPLE_MAX; spot++) people.push(makePerson(spot));
}

const centerOf = (it: LyingItem) => ({ x: it.x + it.img.width / 2, y: H - it.bottom - it.img.height / 2 });

function chooseTarget(p: Person) {
  let best: LyingItem | null = null;
  for (const it of lyingItems) {
    if (it.nature || it.claim) continue;
    if (!best || Math.abs(centerOf(it).x - p.x) < Math.abs(centerOf(best).x - p.x)) best = it;
  }
  if (best) best.claim = p;
  return best;
}

function updatePerson(p: Person, dt: number) {
  const stepY = 40 * dt;
  p.y += Math.min(stepY, Math.max(-stepY, groundY(p.x) - p.y));

  if (p.state === 'picking') return pickUp(p, dt);

  // If litter is lying around, everyone goes to work; otherwise it's a break at the coffee table.
  if (p.state === 'break' && unclaimedLitter()) {
    p.state = 'walking';
    p.standing = false;
    p.target = null;
  }
  if (p.state === 'walking' && (!p.target || !lyingItems.includes(p.target))) {
    p.target = chooseTarget(p);
    if (!p.target) {
      p.state = 'break';
      p.standing = false;
      let spot = 0;
      while (people.some((o) => o !== p && o.state === 'break' && o.spot === spot)) spot++;
      p.spot = spot % TABLE_SPOTS.length;
    }
  }

  let destination: number;
  if (p.state === 'break') {
    destination = table.x + TABLE_SPOTS[p.spot];
  } else {
    const c = centerOf(p.target!);
    const side = Math.sign(c.x - p.x) || 1;
    destination = c.x - side * PERSON_DISTANCE;
    if (Math.abs(destination - p.x) < 1) {
      p.x = destination;
      p.dir = side as 1 | -1;
      p.state = 'picking';
      p.t = 0;
      return;
    }
  }
  const diff = destination - p.x;
  if (p.state === 'break' && Math.abs(diff) < 1) {
    // At the table: face the table and drink a coffee, with the occasional sip.
    p.x = destination;
    p.dir = TABLE_SPOTS[p.spot] < 0 ? 1 : -1;
    p.standing = true;
    p.coffee += dt;
    const sip = p.coffee % 6;
    const u = sip > 4 ? Math.sin(((sip - 4) / 2) * Math.PI) : 0; // 0 = cup at the chest, 1 = at the mouth
    p.tip = { x: mix(6, 3, u), y: mix(-12, -19, u) };
    return;
  }
  p.standing = false;
  p.dir = diff < 0 ? -1 : 1;
  p.x += Math.sign(diff) * Math.min(PERSON_SPEED * dt, Math.abs(diff));
  p.walkPhase += dt * 7;
  p.tip = { x: 11, y: -2 + Math.round(Math.sin(p.walkPhase * 2)) };
  p.mouth = 0;
}

// One pickup: reach, close the grabber, bring it to their own bag, release and lower the grabber again.
function pickUp(p: Person, dt: number) {
  const item = p.target;
  p.t += dt;
  const t = p.t;
  const rest = { x: 11, y: -2 };
  const mouth = { x: -7, y: -12 }; // opening of their own bag
  if (t < 0.75 && item) {
    const c = centerOf(item);
    p.reach = { x: (c.x - p.x) * p.dir, y: c.y - p.y };
  }
  if (t < 0.55) {
    const u = smoothstep(t / 0.55);
    p.tip = { x: mix(rest.x, p.reach.x, u), y: mix(rest.y, p.reach.y, u) };
    p.mouth = 1;
  } else if (t < 0.75) {
    p.tip = p.reach;
    p.mouth = 1 - (t - 0.55) / 0.2;
  } else if (t < 1.4) {
    if (!p.held && item) {
      p.held = item.img;
      removeItem(item);
    }
    const u = (t - 0.75) / 0.65;
    p.tip = { x: mix(p.reach.x, mouth.x, smoothstep(u)), y: mix(p.reach.y, mouth.y, smoothstep(u)) - Math.sin(Math.PI * u) * 6 };
    p.mouth = 0;
  } else if (t < 1.65) {
    p.tip = mouth;
    p.mouth = Math.min(1, (t - 1.4) / 0.12);
    if (p.held && t >= 1.52) {
      p.held = null;
      p.target = null;
      p.bagCount++;
      addScore('others');
    }
  } else if (t < PICKUP_DURATION) {
    const u = smoothstep((t - 1.65) / (PICKUP_DURATION - 1.65));
    p.tip = { x: mix(mouth.x, rest.x, u), y: mix(mouth.y, rest.y, u) };
    p.mouth = 1 - u;
  } else {
    p.state = 'walking';
    p.target = null;
    p.t = 0;
  }
}

// Coffee table on the ground, bottom right, with a thermos and two mugs.
function drawTable(now: number) {
  const r = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(table.x) + x, H + y, w, h);
  };
  r(-11, -8, 2, 8, '#6b4423');
  r(9, -8, 2, 8, '#6b4423');
  r(-13, -10, 26, 2, '#b98550');
  r(-13, -8, 26, 1, '#7a4f28');
  r(-10, -17, 4, 7, '#c0392b'); // thermos
  r(-10, -18, 4, 1, '#8a97a3');
  r(-9, -14, 2, 1, '#f4f4f4');
  r(0, -13, 3, 3, '#f4f4f4'); // mugs
  r(0, -13, 3, 1, '#5a3a22');
  r(5, -13, 3, 3, '#f4f4f4');
  r(5, -13, 3, 1, '#5a3a22');
  if (!reducedMotion) {
    const k = Math.floor(now * 2) % 2; // steam
    r(1, -15 - k, 1, 1, '#ffffff');
    r(6, -16 + k, 1, 1, '#ffffff');
  }
}

function drawPerson(p: Person, now: number) {
  const d = p.dir;
  const fx = Math.round(p.x);
  const fy = Math.round(p.y);
  // (x, y) is forward (in facing direction), up is negative, measured from the feet
  const r = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(fx + (d > 0 ? x : -x - w), fy + y, w, h);
  };
  const onBreak = p.state === 'break' && p.standing;
  const walking = p.state !== 'picking' && !onBreak;
  const sway = walking ? Math.round(Math.sin(p.walkPhase) * 1) : 0;
  const liftFront = walking && Math.cos(p.walkPhase) > 0 ? 1 : 0;
  const liftBack = walking && !liftFront ? 1 : 0;

  // bag on their back: fills up with every item of litter; they leave it standing for coffee
  if (!onBreak) {
    const zh = 6 + Math.min(3, p.bagCount);
    r(-10, -11, 6, zh + 1, '#222e26');
    r(-10, -11, 6, 1, '#5a6f61');
    r(-9, -10, 1, 2, '#3a4e41');
    r(-10, -11 + zh, 6, 1, '#141b16');
  }

  r(-3 - sway, -9, 3, 9 - liftBack, p.pants);
  r(-3 - sway, -2 - liftBack, 3, 2, '#1f1f1f');
  r(1 + sway, -9, 3, 9 - liftFront, p.pants);
  r(1 + sway, -2 - liftFront, 3, 2, '#1f1f1f');

  r(-4, -18, 8, 9, p.shirt);
  if (p.shirt === SHIRT_COLORS[0] || p.shirt === SHIRT_COLORS[1]) r(-4, -13, 8, 1, '#f4f4f4'); // hi-vis vest
  r(-6, -17, 2, 6, p.shirt); // back arm with bag
  r(-6, -11, 2, 2, p.skin);

  // head
  r(-3, -24, 6, 6, p.skin);
  r(-3, -24, 6, 2, p.hair);
  r(-3, -22, 1, 3, p.hair);
  if (p.longHair) r(-4, -23, 2, 9, p.hair);
  if (p.cap) {
    r(-3, -25, 6, 2, p.shirt);
    r(2, -23, 3, 1, p.shirt);
  }
  r(1, -21, 1, 1, '#1a1a1a');

  // forearm: points at the tip of the grabber, or at the coffee cup
  const shoulder = { x: 3, y: -16 };
  const vx = p.tip.x - shoulder.x;
  const vy = p.tip.y - shoulder.y;
  const length = Math.hypot(vx, vy) || 1;
  const arm = Math.min(length, 5);
  for (let k = 0; k <= arm; k++) r(Math.round(shoulder.x + (vx / length) * k), Math.round(shoulder.y + (vy / length) * k), 2, 2, p.shirt);
  const hand = { x: Math.round(shoulder.x + (vx / length) * arm), y: Math.round(shoulder.y + (vy / length) * arm) };
  r(hand.x, hand.y, 2, 2, p.skin);

  if (onBreak) {
    // coffee cup; the grabber is briefly out of frame
    r(hand.x + 1, hand.y - 2, 3, 3, '#f4f4f4');
    r(hand.x + 1, hand.y - 2, 3, 1, '#5a3a22');
    if (!reducedMotion && Math.floor(now * 3) % 2) r(hand.x + 2, hand.y - 4, 1, 1, '#ffffff');
    return;
  }

  const tip = { x: Math.round(p.tip.x), y: Math.round(p.tip.y) };
  const steps = Math.max(1, Math.round(Math.hypot(tip.x - hand.x, tip.y - hand.y)));
  for (let k = 0; k <= steps; k++) {
    const x = Math.round(mix(hand.x, tip.x, k / steps));
    const y = Math.round(mix(hand.y, tip.y, k / steps));
    r(x, y, 1, 1, k < 3 ? '#c0392b' : '#8a97a3'); // red grip, gray shaft
  }
  if (p.held) ctx.drawImage(p.held, Math.round(fx + d * tip.x - p.held.width / 2), Math.round(fy + tip.y - p.held.height / 2));
  const open = 1 + Math.round(p.mouth * 2);
  r(tip.x - open, tip.y - 1, 1, 3, '#4a5560');
  r(tip.x + open, tip.y - 1, 1, 3, '#4a5560');
}

let previous = 0;
function loop(now: number) {
  const dt = Math.min(0.05, (now - previous) / 1000); // no jump after a hidden tab
  previous = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

async function init() {
  [bagImg, litterSprites, natureSprites] = await Promise.all([loadSprite('vuilniszak'), Promise.all(LITTER.map(loadSprite)), Promise.all(NATURE.map(loadSprite))]);
  await loadBackground(loadSprite);
  loadBird(await loadSprite('vogel'));
  resize();
  addEventListener('resize', resize);
  void document.fonts.ready.then(resize); // the text gets taller or shorter once the font is in: the church must still stand next to it
  bag.x = bag.target = (W - bagImg.width) / 2;
  requestAnimationFrame((now) => {
    previous = now;
    requestAnimationFrame(loop);
  });
}
init();

// Input: the bag follows your finger or mouse, or the arrow keys.
addEventListener('pointermove', (e) => {
  if (bagImg) bag.target = Math.min(Math.max(e.clientX / scale - bagImg.width / 2, 0), W - bagImg.width);
});
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') keyDir = -1;
  else if (e.key === 'ArrowRight') keyDir = 1;
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') keyDir = 0;
});
