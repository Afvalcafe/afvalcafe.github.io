// Achtergrond van "Vang het afval": lucht, wolken, de Delftse skyline (Nieuwe Kerk, Oude Kerk, Stadhuis, Oostpoort, molen)
// en daarvoor een park met heg, bomen, pad, bankje en narcissen. De sprites komen uit tools/maak_achtergrond.py.
// Lucht en skyline+park worden bij elke resize één keer voorgetekend.

type Laad = (naam: string) => Promise<HTMLImageElement>;

const LUCHT = ['#2f6fd0', '#3b82dc', '#5299e6', '#74b4ee', '#9ccdf3']; // van boven naar beneden
const NEVEL = 'rgba(156, 205, 243, 0.25)'; // de skyline wat uitgewassen, zodat vallend afval erboven afsteekt
const SCHADUW = ['rgba(16, 48, 26, 0)', 'rgba(16, 48, 26, 0.1)', 'rgba(16, 48, 26, 0.2)']; // gras wordt naar voren toe donkerder
// Afstand van het midden tot het midden van elk gebouw. Past een gebouw niet ruim op het scherm, dan laten we het weg.
const MIJLPALEN = [
  { naam: 'delft-molen', dx: 98 },
  { naam: 'delft-oostpoort', dx: -80 },
  { naam: 'delft-stadhuis', dx: 52 },
  { naam: 'delft-oudekerk', dx: -54 },
];
const WOLKEN = [
  { naam: 'wolk', x: 0.15, y: 0.1, snelheid: 1.5 },
  { naam: 'wolk2', x: 0.7, y: 0.22, snelheid: 1 },
  { naam: 'wolk', x: 0.45, y: 0.4, snelheid: 0.6 },
];
const BLOEMEN = ['narcis', 'roos', 'viooltje', 'madelief', 'tulp'];
const BLOEM_KANS = [0.45, 0.6, 0.72, 0.86, 1]; // cumulatief: de narcis komt het vaakst voor
const HEG_OVERLAP = 6; // de heg begint zoveel boven de horizon

// Waar dingen staan; de vogel gebruikt dit om te weten waar hij kan zitten.
export const indeling = { grond: 0, parkHoogte: 0, padY: 0, benkX: 0, benkY: 0, benkBreedte: 0 };

const sprites = {} as Record<string, HTMLImageElement>;
let wolken: { img: HTMLImageElement; x: number; y: number; snelheid: number }[] = [];
let lucht: HTMLCanvasElement;
let voor: HTMLCanvasElement; // skyline en park, rest doorzichtig

const NAMEN = [
  'delft-huizen', 'delft-kerk', 'delft-oudekerk', 'delft-stadhuis', 'delft-oostpoort', 'delft-molen',
  'gras', 'heg', 'boom', 'boom2', 'bankje', 'pad', ...BLOEMEN, 'wolk', 'wolk2',
];

export async function laadAchtergrond(laad: Laad) {
  const imgs = await Promise.all(NAMEN.map(laad));
  NAMEN.forEach((n, i) => (sprites[n] = imgs[i]));
  wolken = WOLKEN.map((w) => ({ img: sprites[w.naam], x: w.x, y: w.y, snelheid: w.snelheid }));
}

const nieuwDoek = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g] as const;
};

// Tegelt horizontaal over de hele breedte, zo dat er een tegel precies op `midden` staat.
function tegel(g: CanvasRenderingContext2D, img: HTMLImageElement, w: number, y: number, midden: number) {
  const start = Math.round(midden - img.width / 2) % img.width;
  for (let x = start - img.width; x < w; x += img.width) g.drawImage(img, x, y);
}

// Vast zaad: elke keer hetzelfde park bij dezelfde schermgrootte, zodat het niet flikkert bij een resize.
function willekeurig(zaad: number) {
  return () => {
    zaad = (zaad + 0x6d2b79f5) | 0;
    let t = Math.imul(zaad ^ (zaad >>> 15), 1 | zaad);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bouwAchtergrond(W: number, H: number) {
  const parkHoogte = Math.min(130, Math.max(64, Math.round(H * 0.36)));
  const grond = H - parkHoogte;
  const midden = Math.round(W / 2);
  const rand = willekeurig(W * 7919 + H);
  const s = sprites;
  indeling.grond = grond;
  indeling.parkHoogte = parkHoogte;

  let g: CanvasRenderingContext2D;
  [lucht, g] = nieuwDoek(W, H);
  // Banden van vaste hoogte vanaf de horizon omhoog; op een hoog scherm vult de donkerste band de rest.
  const band = Math.min(45, Math.ceil(grond / LUCHT.length));
  LUCHT.forEach((kleur, k) => {
    g.fillStyle = kleur;
    g.fillRect(0, k === 0 ? 0 : grond - (LUCHT.length - k) * band, W, H); // elke lichtere band overschildert de rest
  });

  // Skyline: lage huizen, daarvoor de bekende gebouwen, alles wat vervaagd. De Nieuwe Kerk staat altijd in het midden.
  const [skyline, sg] = nieuwDoek(W, H);
  const basis = grond + 2;
  tegel(sg, s['delft-huizen'], W, basis - s['delft-huizen'].height, midden);
  for (const { naam, dx } of MIJLPALEN) {
    const img = s[naam];
    const x = midden + dx - Math.floor(img.width / 2);
    if (x >= 1 && x + img.width <= W - 1) sg.drawImage(img, x, basis - img.height);
  }
  const kerk = s['delft-kerk'];
  sg.drawImage(kerk, midden - Math.floor(kerk.width / 2), basis - kerk.height);
  sg.globalCompositeOperation = 'source-atop';
  sg.fillStyle = NEVEL;
  sg.fillRect(0, 0, W, H);

  [voor, g] = nieuwDoek(W, H);
  g.drawImage(skyline, 0, 0);

  // Park: heg, gras, bomen langs de rand, pad, bankje en narcissen.
  const boom = W > 260 ? s.boom : s.boom2;
  const boomBasis = grond + 12;
  tegel(g, s.heg, W, grond - HEG_OVERLAP, midden);

  const gras = s.gras;
  const lawn = grond - HEG_OVERLAP + s.heg.height - 3;
  for (let y = lawn; y < H; y += gras.height) tegel(g, gras, W, y, midden);
  SCHADUW.forEach((kleur, i) => {
    g.fillStyle = kleur;
    g.fillRect(0, lawn + Math.round(((H - lawn) * i) / SCHADUW.length), W, H);
  });
  g.drawImage(boom, 4, boomBasis - boom.height); // de bomen staan voor de heg
  g.drawImage(boom, W - 4 - boom.width, boomBasis - boom.height);

  const padY = grond + Math.round(parkHoogte * 0.4);
  tegel(g, s.pad, W, padY, midden);
  indeling.padY = padY;

  const bank = s.bankje;
  const benkX = Math.round(W * 0.24);
  const benkY = padY + 2 - bank.height;
  g.drawImage(bank, benkX - Math.floor(bank.width / 2), benkY);
  Object.assign(indeling, { benkX, benkY, benkBreedte: bank.width });

  // Narcissen in groepjes, van achter naar voren getekend.
  const bloemen: { img: HTMLImageElement; x: number; y: number }[] = [];
  const groepen = Math.max(6, Math.round(W / 16));
  for (let i = 0; i < groepen; i++) {
    const cx = rand() * W;
    const cy = lawn + 6 + rand() * (H - lawn - 12);
    const n = 4 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const x = Math.round(cx + (rand() - 0.5) * 24);
      const y = Math.round(cy + (rand() - 0.5) * 10);
      const r = rand();
      const opPad = y + 9 > padY - 1 && y < padY + s.pad.height;
      const opBank = Math.abs(x - benkX) < bank.width / 2 + 4 && y + 9 > benkY && y < benkY + bank.height;
      if (!opPad && !opBank) bloemen.push({ img: s[BLOEMEN[BLOEM_KANS.findIndex((k) => r <= k)]], x, y });
    }
  }
  bloemen.sort((a, b) => a.y - b.y);
  for (const b of bloemen) g.drawImage(b.img, b.x, b.y);
}

export function tekenAchtergrond(ctx: CanvasRenderingContext2D, W: number, tijd: number, rustig: boolean) {
  ctx.drawImage(lucht, 0, 0);
  for (const w of wolken) {
    const b = W + w.img.width;
    const x = ((w.x * b + (rustig ? 0 : tijd * w.snelheid)) % b) - w.img.width;
    ctx.drawImage(w.img, Math.round(x), Math.round(w.y * indeling.grond));
  }
  ctx.drawImage(voor, 0, 0);
}
