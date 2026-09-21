// Background for "Catch the litter": sky, clouds, the Delft skyline (Nieuwe Kerk, Oude Kerk, Stadhuis, Oostpoort, windmill)
// and in front of it a park with hedge, trees, path, bench and daffodils. The sprites come from tools/maak_achtergrond.py.
// The sky and skyline+park are pre-drawn once on every resize.

type Load = (name: string) => Promise<HTMLImageElement>;

const SKY = ['#2f6fd0', '#3b82dc', '#5299e6', '#74b4ee', '#9ccdf3']; // top to bottom
const HAZE = 'rgba(156, 205, 243, 0.25)'; // washes out the skyline a bit, so falling litter stands out above it
const SHADOW = ['rgba(16, 48, 26, 0)', 'rgba(16, 48, 26, 0.1)', 'rgba(16, 48, 26, 0.2)']; // grass darkens towards the front
// Distance from the middle to the middle of each building. If a building doesn't fit comfortably on screen, we skip it.
const LANDMARKS = [
  { name: 'delft-molen', dx: 98 },
  { name: 'delft-oostpoort', dx: -80 },
  { name: 'delft-stadhuis', dx: 52 },
  { name: 'delft-oudekerk', dx: -54 },
];
const CLOUDS = [
  { name: 'wolk', x: 0.15, y: 0.1, speed: 1.5 },
  { name: 'wolk2', x: 0.7, y: 0.22, speed: 1 },
  { name: 'wolk', x: 0.45, y: 0.4, speed: 0.6 },
];
const FLOWERS = ['narcis', 'roos', 'viooltje', 'madelief', 'tulp'];
const FLOWER_ODDS = [0.45, 0.6, 0.72, 0.86, 1]; // cumulative: the daffodil is the most common
const HEDGE_OVERLAP = 6; // the hedge starts this many pixels above the horizon

// Where things stand; the bird uses this to know where it can perch.
export const layout = { ground: 0, parkHeight: 0, pathY: 0, benchX: 0, benchY: 0, benchWidth: 0 };

const sprites = {} as Record<string, HTMLImageElement>;
let clouds: { img: HTMLImageElement; x: number; y: number; speed: number }[] = [];
let sky: HTMLCanvasElement;
let foreground: HTMLCanvasElement; // skyline and park, rest transparent

const NAMES = [
  'delft-huizen', 'delft-kerk', 'delft-oudekerk', 'delft-stadhuis', 'delft-oostpoort', 'delft-molen',
  'gras', 'heg', 'boom', 'boom2', 'bankje', 'pad', ...FLOWERS, 'wolk', 'wolk2',
];

export async function loadBackground(load: Load) {
  const imgs = await Promise.all(NAMES.map(load));
  NAMES.forEach((n, i) => (sprites[n] = imgs[i]));
  clouds = CLOUDS.map((c) => ({ img: sprites[c.name], x: c.x, y: c.y, speed: c.speed }));
}

const newCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g] as const;
};

// Tiles horizontally across the whole width, so a tile lands exactly on `center`.
function tile(g: CanvasRenderingContext2D, img: HTMLImageElement, w: number, y: number, center: number) {
  const start = Math.round(center - img.width / 2) % img.width;
  for (let x = start - img.width; x < w; x += img.width) g.drawImage(img, x, y);
}

// Fixed seed: the same park at the same screen size every time, so it doesn't flicker on resize.
function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// churchX: where the Nieuwe Kerk (and the skyline) stands, in pixels; centered by default.
export function buildBackground(W: number, H: number, churchX = Math.round(W / 2)) {
  const parkHeight = Math.min(130, Math.max(64, Math.round(H * 0.36)));
  const ground = H - parkHeight;
  const center = churchX;
  const random = seededRandom(W * 7919 + H);
  const s = sprites;
  layout.ground = ground;
  layout.parkHeight = parkHeight;

  let g: CanvasRenderingContext2D;
  [sky, g] = newCanvas(W, H);
  // Fixed-height bands from the horizon up; on a tall screen the darkest band fills the rest.
  const band = Math.min(45, Math.ceil(ground / SKY.length));
  SKY.forEach((color, k) => {
    g.fillStyle = color;
    g.fillRect(0, k === 0 ? 0 : ground - (SKY.length - k) * band, W, H); // each lighter band overpaints the rest
  });

  // Skyline: low houses, then the landmark buildings, all hazed over. The Nieuwe Kerk always stands in the middle.
  const [skyline, sg] = newCanvas(W, H);
  const base = ground + 2;
  tile(sg, s['delft-huizen'], W, base - s['delft-huizen'].height, center);
  for (const { name, dx } of LANDMARKS) {
    const img = s[name];
    const x = center + dx - Math.floor(img.width / 2);
    if (x >= 1 && x + img.width <= W - 1) sg.drawImage(img, x, base - img.height);
  }
  const church = s['delft-kerk'];
  sg.drawImage(church, center - Math.floor(church.width / 2), base - church.height);
  sg.globalCompositeOperation = 'source-atop';
  sg.fillStyle = HAZE;
  sg.fillRect(0, 0, W, H);

  [foreground, g] = newCanvas(W, H);
  g.drawImage(skyline, 0, 0);

  // Park: hedge, grass, trees along the edge, path, bench and daffodils.
  const tree = W > 260 ? s.boom : s.boom2;
  const treeBase = ground + 12;
  tile(g, s.heg, W, ground - HEDGE_OVERLAP, center);

  const grass = s.gras;
  const lawn = ground - HEDGE_OVERLAP + s.heg.height - 3;
  for (let y = lawn; y < H; y += grass.height) tile(g, grass, W, y, center);
  SHADOW.forEach((color, i) => {
    g.fillStyle = color;
    g.fillRect(0, lawn + Math.round(((H - lawn) * i) / SHADOW.length), W, H);
  });
  g.drawImage(tree, 4, treeBase - tree.height); // the trees stand in front of the hedge
  g.drawImage(tree, W - 4 - tree.width, treeBase - tree.height);

  const pathY = ground + Math.round(parkHeight * 0.4);
  tile(g, s.pad, W, pathY, center);
  layout.pathY = pathY;

  const bench = s.bankje;
  const benchX = Math.round(W * 0.24);
  const benchY = pathY + 2 - bench.height;
  g.drawImage(bench, benchX - Math.floor(bench.width / 2), benchY);
  Object.assign(layout, { benchX, benchY, benchWidth: bench.width });

  // Daffodils in clusters, drawn back to front.
  const flowers: { img: HTMLImageElement; x: number; y: number }[] = [];
  const clusters = Math.max(6, Math.round(W / 16));
  for (let i = 0; i < clusters; i++) {
    const cx = random() * W;
    const cy = lawn + 6 + random() * (H - lawn - 12);
    const n = 4 + Math.floor(random() * 5);
    for (let k = 0; k < n; k++) {
      const x = Math.round(cx + (random() - 0.5) * 24);
      const y = Math.round(cy + (random() - 0.5) * 10);
      const r = random();
      const onPath = y + 9 > pathY - 1 && y < pathY + s.pad.height;
      const onBench = Math.abs(x - benchX) < bench.width / 2 + 4 && y + 9 > benchY && y < benchY + bench.height;
      if (!onPath && !onBench) flowers.push({ img: s[FLOWERS[FLOWER_ODDS.findIndex((k) => r <= k)]], x, y });
    }
  }
  flowers.sort((a, b) => a.y - b.y);
  for (const f of flowers) g.drawImage(f.img, f.x, f.y);
}

export function drawBackground(ctx: CanvasRenderingContext2D, W: number, time: number, still: boolean) {
  ctx.drawImage(sky, 0, 0);
  for (const c of clouds) {
    const b = W + c.img.width;
    const x = ((c.x * b + (still ? 0 : time * c.speed)) % b) - c.img.width;
    ctx.drawImage(c.img, Math.round(x), Math.round(c.y * layout.ground));
  }
  ctx.drawImage(foreground, 0, 0);
}
