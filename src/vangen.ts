import '@fontsource/press-start-2p';
import './vangen.css';
import { pondScale } from './pixel';
import { bouwAchtergrond, laadAchtergrond, tekenAchtergrond } from './achtergrond';

const AFVAL = ['batterij', 'schoen', 'fles', 'beker', 'chips', 'sigaret'];
const NATUUR = ['blad', 'blad2', 'tak', 'dennenappel'];

const BAG_SNELHEID = 900; // max. verplaatsing van de zak in pixels per seconde
const VANG = 11; // een voorwerp valt in de zak als zijn midden zo dichtbij het midden van de zak is
const SCHEIDING = 30; // natuur en afval die tegelijk vallen moeten minstens zoveel uit elkaar liggen
const RAND = 12; // ruimte onder de zak
const MONDING = 6; // hoe diep een voorwerp de zak in gaat voordat het telt (de zak wordt eroverheen getekend)
const ZWAAI = 3; // bladeren zwaaien een beetje heen en weer

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

const canvas = document.getElementById('spel') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const scoreEl = document.getElementById('score')!;
const kaart = document.getElementById('kaart')!;
const titelEl = document.getElementById('titel')!;
const uitlegEl = document.getElementById('uitleg')!;
const besteEl = document.getElementById('beste')!;
const tikEl = kaart.querySelector('.tik')!;
const rustig = matchMedia('(prefers-reduced-motion: reduce)').matches;

const laad = (naam: string) =>
  new Promise<HTMLImageElement>((ok, fout) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fout(new Error(`sprite ${naam} niet gevonden`));
    img.src = `${import.meta.env.BASE_URL}sprites/${naam}.png`;
  });

let beste = 0;
try {
  beste = Number(localStorage.getItem('vangen-beste')) || 0;
} catch {
  /* opslag geblokkeerd: dan onthouden we niets */
}

let zak!: HTMLImageElement;
let afval: HTMLImageElement[] = [];
let natuur: HTMLImageElement[] = [];

let scale = 1;
let W = 0;
let H = 0;
const bag = { x: 0, y: 0, doel: 0, stoot: 0 };

function resize() {
  scale = pondScale().scale;
  W = Math.ceil(innerWidth / scale);
  H = Math.ceil(innerHeight / scale);
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
  ctx.imageSmoothingEnabled = false;
  bag.y = H - zak.height - RAND;
  bouwAchtergrond(W, H);
  bag.doel = Math.min(Math.max(bag.doel, 0), W - zak.width);
  bag.x = Math.min(bag.x, W - zak.width);
}

let voorwerpen: Voorwerp[] = [];
let toestand: 'wacht' | 'spelen' | 'af' = 'wacht';
let tijd = 0;
let score = 0;
let volgende = 0;
let laatsteAfval: { x: number; t: number } | null = null;
let slotTot = 0;
let toets = 0;

const willekeurig = <T,>(lijst: T[]) => lijst[Math.floor(Math.random() * lijst.length)];

// Moeilijkheid groeit met de speeltijd. Alles heeft een plafond zodat het te doen blijft.
const valSnelheid = () => Math.min(300, 30 + 3 * tijd);
const tussenpoos = () => Math.max(0.25, 1.4 - 0.014 * tijd);
const natuurKans = () => Math.min(0.5, 0.15 + 0.004 * tijd);

function laatVallen() {
  const isNatuur = Math.random() < natuurKans();
  const img = willekeurig(isNatuur ? natuur : afval);
  for (let poging = 0; poging < 8; poging++) {
    const x = Math.random() * (W - img.width);
    // Nooit natuur en afval bijna tegelijk vlak naast elkaar: dan kun je niet meer kiezen.
    const botst = voorwerpen.some(
      (v) => v.natuur !== isNatuur && Math.abs(v.t - tijd) < 0.35 && Math.abs(v.x - x) < SCHEIDING,
    );
    // En het volgende afval moet altijd op tijd te bereiken zijn.
    const onbereikbaar =
      !isNatuur && laatsteAfval && Math.abs(x - laatsteAfval.x) > BAG_SNELHEID * 0.7 * (tijd - laatsteAfval.t) + 2 * VANG;
    if (botst || onbereikbaar) continue;
    voorwerpen.push({ img, natuur: isNatuur, x, y: -img.height, vy: valSnelheid(), t: tijd, fase: Math.random() * 6, weg: false });
    if (!isNatuur) laatsteAfval = { x, t: tijd };
    return;
  }
}

function start() {
  voorwerpen = [];
  tijd = 0;
  score = 0;
  volgende = 0.5;
  laatsteAfval = null;
  scoreEl.textContent = '0';
  kaart.hidden = true;
  toestand = 'spelen';
}

function afgelopen(reden: string) {
  toestand = 'af';
  slotTot = performance.now() + 600;
  if (score > beste) {
    beste = score;
    try {
      localStorage.setItem('vangen-beste', String(beste));
    } catch {
      /* zie boven */
    }
  }
  titelEl.textContent = reden;
  uitlegEl.textContent = `Score: ${score}`;
  besteEl.textContent = `Beste: ${beste}`;
  tikEl.textContent = 'Tik om opnieuw te spelen';
  kaart.hidden = false;
}

const zwaai = (v: Voorwerp) => (v.natuur && !rustig ? Math.sin(tijd * 3 + v.fase) * ZWAAI : 0);

function update(dt: number) {
  if (toets) bag.doel = Math.min(Math.max(bag.doel + toets * BAG_SNELHEID * dt, 0), W - zak.width);
  const stap = BAG_SNELHEID * dt;
  bag.x += Math.min(stap, Math.max(-stap, bag.doel - bag.x));
  bag.stoot = Math.max(0, bag.stoot - dt);
  if (toestand !== 'spelen') return;

  tijd += dt;
  volgende -= dt;
  if (volgende <= 0) {
    laatVallen();
    volgende += tussenpoos();
  }

  const mond = bag.y + MONDING;
  for (const v of voorwerpen) {
    const onderkantVoor = v.y + v.img.height;
    v.y += v.vy * dt;
    if (onderkantVoor >= mond || v.y + v.img.height < mond) continue; // alleen het moment dat het de opening passeert

    const midden = v.x + zwaai(v) + v.img.width / 2;
    if (Math.abs(midden - (bag.x + zak.width / 2)) <= VANG) {
      if (v.natuur) return afgelopen('Natuur in de zak!'); // blijft zichtbaar staan
      v.weg = true;
      score++;
      scoreEl.textContent = String(score);
      bag.stoot = rustig ? 0 : 0.12;
    } else if (!v.natuur) {
      return afgelopen('Afval gemist!');
    }
  }
  voorwerpen = voorwerpen.filter((v) => !v.weg && v.y < H);
}

function teken() {
  tekenAchtergrond(ctx, W, H, performance.now() / 1000, rustig);
  for (const v of voorwerpen) ctx.drawImage(v.img, Math.round(v.x + zwaai(v)), Math.round(v.y));
  ctx.drawImage(zak, Math.round(bag.x), bag.y + (bag.stoot > 0 ? 1 : 0));
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
function volg(e: PointerEvent) {
  if (!zak) return;
  bag.doel = Math.min(Math.max(e.clientX / scale - zak.width / 2, 0), W - zak.width);
}
function beginOpnieuw() {
  if (!zak || toestand === 'spelen' || performance.now() < slotTot) return;
  start();
}
addEventListener('pointermove', volg);
addEventListener('pointerdown', (e) => {
  volg(e);
  beginOpnieuw();
});
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') toets = -1;
  else if (e.key === 'ArrowRight' || e.key === 'd') toets = 1;
  else if (e.key === ' ' || e.key === 'Enter') beginOpnieuw();
});
addEventListener('keyup', (e) => {
  if (['ArrowLeft', 'a', 'ArrowRight', 'd'].includes(e.key)) toets = 0;
});

besteEl.textContent = beste ? `Beste: ${beste}` : '';
