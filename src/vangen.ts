// Achtergrond van "Doe mee": een park waar langzaam afval en natuur naar beneden vallen. Sleep of beweeg de vuilniszak
// om afval op te vangen. Wat je mist blijft op de grond liggen en vormt langzaam een berg. Ligt er afval, dan komen
// er (maximaal drie tegelijk) mensen met grijper en eigen zak langs om het op te ruimen. Het spel is nooit af:
// het is decor bij de tekst, met linksonder twee tellers: jouw score en die van de anderen.

import './vangen.css';
import { pondScale } from './pixel';
import { bouwAchtergrond, laadAchtergrond, tekenAchtergrond } from './achtergrond';
import { laadVogel, plaatsVogel, tekenVogel, updateVogel } from './vogel';

const AFVAL = ['batterij', 'schoen', 'fles', 'beker', 'chips', 'sigaret'];
const NATUUR = ['blad', 'blad2', 'tak', 'dennenappel'];

const BAG_SNELHEID = 900; // max. verplaatsing van de zak in pixels per seconde
const VANG = 8; // een voorwerp valt in de zak als zijn midden zo dichtbij het midden van de zak is
const INZAKKEN = 2; // de zak zakt zoveel pixels in de berg waarop hij staat
const KLIM = 40; // pixels per seconde waarmee de zak met de berg mee omhoog schuift
const MONDING = 3; // hoe diep een voorwerp de zak in gaat voordat het telt (de zak wordt eroverheen getekend)
const ZWAAI = 3; // bladeren zwaaien een beetje heen en weer
const VAL_MIN = 20; // pond-pixels per seconde; rustig, want het is een achtergrond
const VAL_MAX = 34;
const TUSSENPOOS_MIN = 0.8; // seconden tussen twee voorwerpen
const TUSSENPOOS_MAX = 1.5;
const NATUUR_KANS = 0.2;
const STAPEL_MAX = 0.4; // de berg groeit tot dit deel van het scherm; daarna valt er niets meer
const TELLER_JIJ = 'litter-collected'; // zelfde teller als in de vijver, zodat hij bewaard blijft tijdens het bladeren
const TELLER_ANDEREN = 'vangen-anderen';
const MENS_MAX = 3; // nooit meer dan drie mensen tegelijk
const MENS_DREMPEL = [1, 6, 12]; // zoveel liggend afval (zonder opruimer) moet er zijn voor de 1e, 2e en 3e persoon
const MENS_TEMPO = 14; // pond-pixels per seconde
const MENS_AFSTAND = 9; // zo ver van het afval blijft iemand staan tijdens het rapen
const RAAP_DUUR = 1.9; // seconden per stuk afval
const ROL = 3; // ligt een voorwerp zoveel pixels hoger dan het buurplekje, dan rolt het die kant op

type Voorwerp = {
  img: HTMLImageElement;
  natuur: boolean;
  x: number;
  y: number;
  vy: number;
  t: number; // spelseconde waarop het viel
  fase: number;
  weg: boolean; // gevangen: verdwijnt in de zak
};
type Gelegen = { img: HTMLImageElement; natuur: boolean; x: number; onder: number; claim?: Mens };
type Mens = {
  x: number; // voeten, midden
  y: number;
  dir: 1 | -1; // kijkrichting
  stap: number; // fase van de loop-animatie
  toestand: 'loopt' | 'raapt' | 'gaat';
  doel: Gelegen | null;
  t: number; // seconden in de huidige raapbeurt
  over: number; // zoveel stuks nog, dan gaat hij weer naar huis
  zak: number; // zoveel zit er al in zijn zak
  tip: { x: number; y: number }; // punt van de grijper, ten opzichte van de voeten en in kijkrichting
  bek: number; // 0 = dicht, 1 = open
  vast: HTMLImageElement | null; // wat de grijper vasthoudt
  ic: { x: number; y: number }; // midden van het afval waar hij naartoe reikt, zelfde coordinaten als tip
  huid: string;
  haar: string;
  lang: boolean;
  pet: boolean;
  shirt: string;
  broek: string;
  klaar: boolean;
}; // onder = afstand van de onderkant van het voorwerp tot de grond

const canvas = document.getElementById('spel') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const jijEl = document.getElementById('score-jij');
const anderenEl = document.getElementById('score-anderen');
const rustig = matchMedia('(prefers-reduced-motion: reduce)').matches;

const laad = (naam: string) =>
  new Promise<HTMLImageElement>((ok, fout) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fout(new Error(`sprite ${naam} niet gevonden`));
    img.src = `${import.meta.env.BASE_URL}sprites/${naam}.png`;
  });

let zak!: HTMLImageElement;
let afval: HTMLImageElement[] = [];
let natuur: HTMLImageElement[] = [];

let scale = 1;
let W = 0;
let H = 0;
const bag = { x: 0, y: 0, doel: 0, stoot: 0 };

const score = { jij: 0, anderen: 0 };
try {
  score.jij = Number(sessionStorage.getItem(TELLER_JIJ)) || 0;
  score.anderen = Number(sessionStorage.getItem(TELLER_ANDEREN)) || 0;
} catch {
  /* opslag geblokkeerd: dan beginnen de tellers bij 0 */
}
function toonScore() {
  if (jijEl) jijEl.textContent = String(score.jij);
  if (anderenEl) anderenEl.textContent = String(score.anderen);
}
function telOp(wie: 'jij' | 'anderen') {
  score[wie]++;
  toonScore();
  try {
    sessionStorage.setItem(wie === 'jij' ? TELLER_JIJ : TELLER_ANDEREN, String(score[wie]));
  } catch {
    /* zie boven */
  }
}
toonScore();

// Per kolom van een sprite: de bovenste en onderste pixel die niet doorzichtig is (-1 = lege kolom).
const profielen = new Map<HTMLImageElement, { boven: number[]; onder: number[] }>();
function profiel(img: HTMLImageElement) {
  let p = profielen.get(img);
  if (p) return p;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, img.width, img.height).data;
  p = { boven: Array(img.width).fill(-1), onder: Array(img.width).fill(-1) };
  for (let x = 0; x < img.width; x++) {
    for (let y = 0; y < img.height; y++) {
      if (data[(y * img.width + x) * 4 + 3] < 128) continue;
      if (p.boven[x] < 0) p.boven[x] = y;
      p.onder[x] = y;
    }
  }
  profielen.set(img, p);
  return p;
}

// De berg: hoogte per kolom, een canvas met alles wat er ligt en de lijst om bij een resize opnieuw op te bouwen.
let hoogte = new Int16Array(0);
let stapel: HTMLCanvasElement;
let stapelCtx: CanvasRenderingContext2D;
let gelegen: Gelegen[] = [];

// Hoogste y (bovenkant van de sprite) waarop het voorwerp op x nog op de berg of grond rust.
function landing(img: HTMLImageElement, x: number) {
  const { onder } = profiel(img);
  let y = Infinity;
  for (let c = 0; c < img.width; c++) if (onder[c] >= 0) y = Math.min(y, H - hoogte[x + c] - onder[c] - 1);
  return y;
}

function leg(img: HTMLImageElement, x: number, y: number) {
  const { boven } = profiel(img);
  for (let c = 0; c < img.width; c++) if (boven[c] >= 0) hoogte[x + c] = Math.max(hoogte[x + c], H - (y + boven[c]));
  stapelCtx.drawImage(img, x, y);
}

function bouwStapel() {
  hoogte = new Int16Array(W);
  stapel = document.createElement('canvas');
  stapel.width = W;
  stapel.height = H;
  stapelCtx = stapel.getContext('2d')!;
  stapelCtx.imageSmoothingEnabled = false;
  gelegen = gelegen.filter((g) => g.x + g.img.width <= W);
  for (const g of gelegen) leg(g.img, g.x, H - g.onder - g.img.height);
}

// Haalt één voorwerp van de berg. Wat erop lag, zakt door; de rest blijft precies liggen.
function haalWeg(g: Gelegen) {
  const rest = gelegen.filter((o) => o !== g).sort((a, b) => a.onder - b.onder);
  hoogte = new Int16Array(W);
  stapelCtx.clearRect(0, 0, W, H);
  for (const o of rest) {
    const y = Math.floor(landing(o.img, o.x));
    leg(o.img, o.x, y);
    o.onder = H - y - o.img.height;
  }
  gelegen = rest;
}

function laatLiggen(v: Voorwerp) {
  let x = Math.min(Math.max(Math.round(v.x), 0), W - v.img.width);
  let y = landing(v.img, x);
  // Op een helling rolt het voorwerp naar beneden; zo ontstaat een berg in plaats van een stapel.
  for (let stap = 0; stap < 60; stap++) {
    const l = x > 0 ? landing(v.img, x - 1) : -Infinity;
    const r = x < W - v.img.width ? landing(v.img, x + 1) : -Infinity;
    const beste = Math.max(l, r);
    if (beste - y < ROL) break;
    x += l > r ? -1 : 1;
    y = beste;
  }
  y = Math.floor(y);
  leg(v.img, x, y);
  gelegen.push({ img: v.img, natuur: v.natuur, x, onder: H - y - v.img.height });
}

// De zak staat op de grond, of op de berg als die daar hoger is.
function zakStandaardY() {
  const links = Math.max(0, Math.round(bag.x));
  let top = 0;
  for (let c = 0; c < zak.width && links + c < W; c++) top = Math.max(top, hoogte[links + c]);
  return H - zak.height - Math.max(0, top - INZAKKEN);
}

// De Nieuwe Kerk staat naast de tekstwolk (rechts ervan) als daar ruimte is, anders tegen de rechterrand, zodat hij niet achter de tekst verdwijnt.
function kerkPlek() {
  const tekst = document.querySelector('main');
  if (!tekst) return undefined;
  const rechts = tekst.getBoundingClientRect().right / scale;
  const vrij = W - rechts;
  return Math.round(vrij >= 70 ? rechts + vrij / 2 : W - 12);
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
  bouwAchtergrond(W, H, kerkPlek());
  plaatsVogel(W, H);
  bouwStapel();
  bag.y = zakStandaardY();
  bag.doel = Math.min(Math.max(bag.doel, 0), W - zak.width);
  bag.x = Math.min(bag.x, W - zak.width);
  voorwerpen = voorwerpen.filter((v) => v.x + v.img.width <= W);
}

let voorwerpen: Voorwerp[] = [];
let tijd = 0;
let volgende = 0.5;
let toets = 0;

const tussen = (a: number, b: number) => a + Math.random() * (b - a);
const willekeurig = <T,>(lijst: T[]) => lijst[Math.floor(Math.random() * lijst.length)];

function laatVallen() {
  if (Math.max(...hoogte) >= H * STAPEL_MAX) return; // de berg is vol
  const isNatuur = Math.random() < NATUUR_KANS;
  const img = willekeurig(isNatuur ? natuur : afval);
  // Meer in het midden dan aan de rand: dat geeft een berg in plaats van een egale laag.
  const x = Math.round((0.5 + (Math.random() + Math.random() - 1) * 0.5) * (W - img.width));
  voorwerpen.push({ img, natuur: isNatuur, x, y: -img.height, vy: tussen(VAL_MIN, VAL_MAX), t: tijd, fase: Math.random() * 6, weg: false });
}

const zwaai = (v: Voorwerp) => (v.natuur && !rustig ? Math.sin(tijd * 3 + v.fase) * ZWAAI : 0);

function update(dt: number) {
  updateVogel(dt, rustig);
  if (toets) bag.doel = Math.min(Math.max(bag.doel + toets * BAG_SNELHEID * dt, 0), W - zak.width);
  const stap = BAG_SNELHEID * dt;
  bag.x += Math.min(stap, Math.max(-stap, bag.doel - bag.x));
  bag.stoot = Math.max(0, bag.stoot - dt);
  const stapY = KLIM * dt;
  bag.y += Math.min(stapY, Math.max(-stapY, zakStandaardY() - bag.y));

  tijd += dt;
  volgende -= dt;
  if (volgende <= 0) {
    laatVallen();
    volgende += tussen(TUSSENPOOS_MIN, TUSSENPOOS_MAX);
  }

  const mond = Math.round(bag.y) + MONDING;
  for (const v of voorwerpen) {
    const onderkantVoor = v.y + v.img.height;
    v.y += v.vy * dt;
    // Afval dat precies boven de zak door de opening valt, verdwijnt erin. Natuur en gemist afval vallen erlangs.
    if (!v.natuur && onderkantVoor < mond && v.y + v.img.height >= mond) {
      const midden = v.x + v.img.width / 2;
      if (Math.abs(midden - (bag.x + zak.width / 2)) <= VANG) {
        v.weg = true;
        bag.stoot = rustig ? 0 : 0.12;
        telOp('jij');
        continue;
      }
    }
    // Zwaaiende bladeren landen op de plek waar ze op dat moment hangen.
    const x = Math.min(Math.max(Math.round(v.x + zwaai(v)), 0), W - v.img.width);
    if (v.y >= landing(v.img, x)) {
      v.x = x;
      v.weg = true;
      laatLiggen(v);
    }
  }
  voorwerpen = voorwerpen.filter((v) => !v.weg);

  beheerMensen(dt);
  for (const m of mensen) updateMens(m, dt);
  mensen = mensen.filter((m) => !m.klaar);
}

function teken() {
  const nu = performance.now() / 1000;
  tekenAchtergrond(ctx, W, nu, rustig);
  tekenVogel(ctx, nu);
  ctx.drawImage(stapel, 0, 0);
  for (const v of voorwerpen) ctx.drawImage(v.img, Math.round(v.x + zwaai(v)), Math.round(v.y));
  for (const m of mensen) tekenMens(m);
  ctx.drawImage(zak, Math.round(bag.x), Math.round(bag.y) + (bag.stoot > 0 ? 1 : 0));
}


// ---------- Mensen die het afval opruimen ----------

const HUID = ['#f6d2b8', '#e8b48f', '#c98f66', '#a0674a', '#6d4432', '#4a2c1e'];
const HAAR = ['#1e1a17', '#3b2a1e', '#6b4a2b', '#c9a24a', '#a8432a', '#8d8d8d'];
const SHIRT = ['#f08a24', '#e6c229', '#3a8ad6', '#c0392b', '#2e8b57', '#8a4fb0']; // oranje en geel: hesje
const BROEK = ['#2a3a5c', '#3a3a3a', '#5a4630', '#1f4d3a'];

let mensen: Mens[] = [];
let mensTimer = 0;

const grondY = (x: number) => {
  let h = 0;
  for (let i = Math.max(0, Math.round(x) - 2); i <= Math.min(W - 1, Math.round(x) + 2); i++) h = Math.max(h, hoogte[i]);
  return H - h; // mensen lopen over de berg
};
const glad = (u: number) => u * u * (3 - 2 * u);
const mix = (a: number, b: number, u: number) => a + (b - a) * u;

function nieuweMens(): Mens {
  const links = Math.random() < 0.5;
  const x = links ? -8 : W + 8;
  return {
    x,
    y: grondY(x),
    dir: links ? 1 : -1,
    stap: 0,
    toestand: 'loopt',
    doel: null,
    t: 0,
    over: 4 + Math.floor(Math.random() * 3),
    zak: 0,
    tip: { x: 11, y: -2 },
    bek: 0,
    vast: null,
    ic: { x: 0, y: 0 },
    huid: willekeurig(HUID),
    haar: willekeurig(HAAR),
    lang: Math.random() < 0.5,
    pet: Math.random() < 0.3,
    shirt: willekeurig(SHIRT),
    broek: willekeurig(BROEK),
    klaar: false,
  };
}

// Er komt iemand bij zodra er genoeg liggend afval is zonder opruimer, tot maximaal drie mensen.
function beheerMensen(dt: number) {
  mensTimer -= dt;
  if (mensTimer > 0 || mensen.length >= MENS_MAX) return;
  const vrij = gelegen.filter((g) => !g.natuur && !g.claim).length;
  if (vrij >= MENS_DREMPEL[mensen.length]) {
    mensen.push(nieuweMens());
    mensTimer = 4;
  }
}

const midden = (g: Gelegen) => ({ x: g.x + g.img.width / 2, y: H - g.onder - g.img.height / 2 });

function kiesDoel(m: Mens) {
  let beste: Gelegen | null = null;
  for (const g of gelegen) {
    if (g.natuur || g.claim) continue;
    if (!beste || Math.abs(midden(g).x - m.x) < Math.abs(midden(beste).x - m.x)) beste = g;
  }
  if (beste) beste.claim = m;
  return beste;
}

function updateMens(m: Mens, dt: number) {
  const stapY = 40 * dt;
  m.y += Math.min(stapY, Math.max(-stapY, grondY(m.x) - m.y));

  if (m.toestand === 'raapt') return raap(m, dt);

  if (m.toestand === 'loopt' && (!m.doel || !gelegen.includes(m.doel))) {
    m.doel = m.over > 0 ? kiesDoel(m) : null;
    if (!m.doel) m.toestand = 'gaat';
  }
  let bestemming: number;
  if (m.toestand === 'gaat') {
    bestemming = m.x < W / 2 ? -20 : W + 20;
  } else {
    const c = midden(m.doel!);
    const kant = Math.sign(c.x - m.x) || 1;
    bestemming = c.x - kant * MENS_AFSTAND;
    if (Math.abs(bestemming - m.x) < 1) {
      m.x = bestemming;
      m.dir = kant as 1 | -1;
      m.toestand = 'raapt';
      m.t = 0;
      return;
    }
  }
  const verschil = bestemming - m.x;
  m.dir = verschil < 0 ? -1 : 1;
  m.x += Math.sign(verschil) * Math.min(MENS_TEMPO * dt, Math.abs(verschil));
  m.stap += dt * 7;
  m.tip = { x: 11, y: -2 + Math.round(Math.sin(m.stap * 2)) };
  m.bek = 0;
  if (m.toestand === 'gaat' && (m.x < -12 || m.x > W + 12)) m.klaar = true;
}

// Eén raapbeurt: reiken, dichtknijpen, naar de eigen zak brengen, loslaten en de grijper weer laten zakken.
function raap(m: Mens, dt: number) {
  const g = m.doel;
  m.t += dt;
  const t = m.t;
  const rust = { x: 11, y: -2 };
  const mond = { x: -7, y: -12 }; // opening van zijn eigen zak
  if (t < 0.75 && g) {
    const c = midden(g);
    m.ic = { x: (c.x - m.x) * m.dir, y: c.y - m.y };
  }
  if (t < 0.55) {
    const u = glad(t / 0.55);
    m.tip = { x: mix(rust.x, m.ic.x, u), y: mix(rust.y, m.ic.y, u) };
    m.bek = 1;
  } else if (t < 0.75) {
    m.tip = m.ic;
    m.bek = 1 - (t - 0.55) / 0.2;
  } else if (t < 1.4) {
    if (!m.vast && g) {
      m.vast = g.img;
      haalWeg(g);
    }
    const u = (t - 0.75) / 0.65;
    m.tip = { x: mix(m.ic.x, mond.x, glad(u)), y: mix(m.ic.y, mond.y, glad(u)) - Math.sin(Math.PI * u) * 6 };
    m.bek = 0;
  } else if (t < 1.65) {
    m.tip = mond;
    m.bek = Math.min(1, (t - 1.4) / 0.12);
    if (m.vast && t >= 1.52) {
      m.vast = null;
      m.doel = null;
      m.zak++;
      m.over--;
      telOp('anderen');
    }
  } else if (t < RAAP_DUUR) {
    const u = glad((t - 1.65) / (RAAP_DUUR - 1.65));
    m.tip = { x: mix(mond.x, rust.x, u), y: mix(mond.y, rust.y, u) };
    m.bek = 1 - u;
  } else {
    m.toestand = 'loopt';
    m.doel = null;
    m.t = 0;
  }
}

function tekenMens(m: Mens) {
  const d = m.dir;
  const fx = Math.round(m.x);
  const fy = Math.round(m.y);
  // (x, y) is voorwaarts (in kijkrichting), omhoog is negatief, gemeten vanaf de voeten
  const r = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(fx + (d > 0 ? x : -x - w), fy + y, w, h);
  };
  const lopend = m.toestand !== 'raapt';
  const zwaai = lopend ? Math.round(Math.sin(m.stap) * 2) : 0;
  const tilVoor = lopend && Math.cos(m.stap) > 0 ? 1 : 0;
  const tilAchter = lopend && !tilVoor ? 1 : 0;

  // zak aan de achterhand: wordt voller met elk stuk afval
  const zh = 6 + Math.min(3, m.zak);
  r(-10, -11, 6, zh + 1, '#222e26');
  r(-10, -11, 6, 1, '#5a6f61');
  r(-9, -10, 1, 2, '#3a4e41');
  r(-10, -11 + zh, 6, 1, '#141b16');

  r(-3 - zwaai, -9, 3, 9 - tilAchter, m.broek);
  r(-3 - zwaai, -2 - tilAchter, 3, 2, '#1f1f1f');
  r(1 + zwaai, -9, 3, 9 - tilVoor, m.broek);
  r(1 + zwaai, -2 - tilVoor, 3, 2, '#1f1f1f');

  r(-4, -18, 8, 9, m.shirt);
  if (m.shirt === SHIRT[0] || m.shirt === SHIRT[1]) r(-4, -13, 8, 1, '#f4f4f4'); // reflecterend hesje
  r(-6, -17, 2, 6, m.shirt); // achterarm met zak
  r(-6, -11, 2, 2, m.huid);

  // hoofd
  r(-3, -24, 6, 6, m.huid);
  r(-3, -24, 6, 2, m.haar);
  r(-3, -22, 1, 3, m.haar);
  if (m.lang) r(-4, -23, 2, 9, m.haar);
  if (m.pet) {
    r(-3, -25, 6, 2, m.shirt);
    r(2, -23, 3, 1, m.shirt);
  }
  r(1, -21, 1, 1, '#1a1a1a');

  // voorarm en grijper: de arm wijst naar de punt van de grijper
  const schouder = { x: 3, y: -16 };
  const vx = m.tip.x - schouder.x;
  const vy = m.tip.y - schouder.y;
  const lengte = Math.hypot(vx, vy) || 1;
  const arm = Math.min(lengte, 5);
  for (let k = 0; k <= arm; k++) r(Math.round(schouder.x + (vx / lengte) * k), Math.round(schouder.y + (vy / lengte) * k), 2, 2, m.shirt);
  const hand = { x: Math.round(schouder.x + (vx / lengte) * arm), y: Math.round(schouder.y + (vy / lengte) * arm) };
  r(hand.x, hand.y, 2, 2, m.huid);
  const tip = { x: Math.round(m.tip.x), y: Math.round(m.tip.y) };
  const stappen = Math.max(1, Math.round(Math.hypot(tip.x - hand.x, tip.y - hand.y)));
  for (let k = 0; k <= stappen; k++) {
    const x = Math.round(mix(hand.x, tip.x, k / stappen));
    const y = Math.round(mix(hand.y, tip.y, k / stappen));
    r(x, y, 1, 1, k < 3 ? '#c0392b' : '#8a97a3'); // rode greep, grijze stang
  }
  if (m.vast) ctx.drawImage(m.vast, Math.round(fx + d * tip.x - m.vast.width / 2), Math.round(fy + tip.y - m.vast.height / 2));
  const open = 1 + Math.round(m.bek * 2);
  r(tip.x - open, tip.y - 1, 1, 3, '#4a5560');
  r(tip.x + open, tip.y - 1, 1, 3, '#4a5560');
}

let vorige = 0;
function lus(nu: number) {
  const dt = Math.min(0.05, (nu - vorige) / 1000); // geen sprong na een verborgen tabblad
  vorige = nu;
  update(dt);
  teken();
  requestAnimationFrame(lus);
}

async function init() {
  [zak, afval, natuur] = await Promise.all([laad('vuilniszak'), Promise.all(AFVAL.map(laad)), Promise.all(NATUUR.map(laad))]);
  await laadAchtergrond(laad);
  laadVogel(await laad('vogel'));
  resize();
  addEventListener('resize', resize);
  bag.x = bag.doel = (W - zak.width) / 2;
  requestAnimationFrame((nu) => {
    vorige = nu;
    requestAnimationFrame(lus);
  });
}
init();

// Invoer: de zak volgt je vinger of muis, of de pijltjestoetsen.
addEventListener('pointermove', (e) => {
  if (zak) bag.doel = Math.min(Math.max(e.clientX / scale - zak.width / 2, 0), W - zak.width);
});
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') toets = -1;
  else if (e.key === 'ArrowRight') toets = 1;
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') toets = 0;
});
