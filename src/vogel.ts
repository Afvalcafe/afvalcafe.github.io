// De vogel in het park: zit meestal stil op het gras of het bankje, hupt soms een stukje, vliegt af en toe naar een andere
// plek en heel af en toe het beeld uit en na een tijdje weer erin. Puur decor: hij doet niet mee met het spel.
import { indeling } from './achtergrond';

const HUP_LENGTE = 9; // pixels per hupje
const HUP_DUUR = 0.32;
const HUP_HOOGTE = 4;
const VLUCHT_SNELHEID = 70; // pixels per seconde

type Punt = { x: number; y: number };

const v = {
  img: null as HTMLImageElement | null,
  x: 0, // midden
  y: 0, // voeten, zonder de hoogte van een hupje of vlucht
  hoogte: 0,
  links: false, // de sprite kijkt naar rechts, dus naar links spiegelen we
  toestand: 'zit' as 'zit' | 'hupt' | 'vliegt',
  verborgen: false, // buiten beeld, wacht tot hij terugkomt
  timer: 1.5, // tot de volgende actie
  hupjes: 0,
  van: { x: 0, y: 0 } as Punt,
  naar: { x: 0, y: 0 } as Punt,
  boog: 0,
  duur: 1,
  verstreken: 0,
  weg: false, // vliegt het beeld uit
  B: 0,
  H: 0,
};

export function laadVogel(img: HTMLImageElement) {
  v.img = img;
}

const tussen = (a: number, b: number) => a + Math.random() * (b - a);

// Een plek om te zitten: op het bankje of ergens op het gras onder het pad.
function kiesPlek(): Punt {
  if (Math.random() < 0.3) return { x: indeling.benkX + tussen(-6, 6), y: indeling.benkY + 8 };
  return { x: tussen(12, v.B - 12), y: tussen(indeling.padY + 12, v.H - 14) };
}

export function plaatsVogel(W: number, H: number) {
  const eerste = v.B === 0;
  v.B = W;
  v.H = H;
  if (eerste) {
    v.x = indeling.benkX;
    v.y = indeling.benkY + 8;
  }
  v.x = Math.min(Math.max(v.x, 8), W - 8);
  v.y = Math.min(Math.max(v.y, indeling.benkY + 8), H - 4);
}

function vlieg(naar: Punt, boog: number, weg = false) {
  v.toestand = 'vliegt';
  v.van = { x: v.x, y: v.y };
  v.naar = naar;
  v.boog = boog;
  v.weg = weg;
  v.duur = Math.min(3, Math.max(0.9, Math.hypot(naar.x - v.x, naar.y - v.y) / VLUCHT_SNELHEID));
  v.verstreken = 0;
  v.links = naar.x < v.x;
}

function kiesActie() {
  const kans = Math.random();
  if (kans < 0.5) {
    v.toestand = 'hupt';
    v.hupjes = 2 + Math.floor(Math.random() * 3);
    v.links = Math.random() < 0.5;
    v.verstreken = 0;
  } else if (kans < 0.85) {
    vlieg(kiesPlek(), tussen(15, 35));
  } else if (kans < 0.92) {
    // het beeld uit, ergens hoog in de lucht
    vlieg({ x: v.x < v.B / 2 ? -20 : v.B + 20, y: tussen(20, indeling.grond * 0.6) }, 10, true);
  } else {
    v.links = !v.links; // even omkijken
  }
}

export function updateVogel(dt: number, rustig: boolean) {
  if (!v.img || !v.B || rustig) return;

  if (v.toestand === 'zit') {
    v.timer -= dt;
    if (v.timer > 0) return;
    if (v.verborgen) {
      // terug: van links of rechts het beeld in, naar een plek
      v.verborgen = false;
      v.x = Math.random() < 0.5 ? -20 : v.B + 20;
      v.y = tussen(20, indeling.grond * 0.6);
      vlieg(kiesPlek(), 10);
      return;
    }
    v.timer = tussen(2, 6);
    kiesActie();
    return;
  }

  v.verstreken += dt;
  if (v.toestand === 'hupt') {
    const nieuw = v.x + (v.links ? -1 : 1) * HUP_LENGTE * (dt / HUP_DUUR);
    if (nieuw < 8 || nieuw > v.B - 8) v.links = !v.links;
    else v.x = nieuw;
    v.hoogte = Math.sin(((v.verstreken % HUP_DUUR) / HUP_DUUR) * Math.PI) * HUP_HOOGTE;
    if (v.verstreken >= HUP_DUUR * v.hupjes) {
      v.toestand = 'zit';
      v.hoogte = 0;
    }
    return;
  }

  const t = Math.min(1, v.verstreken / v.duur);
  v.x = v.van.x + (v.naar.x - v.van.x) * t;
  v.y = v.van.y + (v.naar.y - v.van.y) * t;
  v.hoogte = Math.sin(t * Math.PI) * v.boog;
  if (t >= 1) {
    v.toestand = 'zit';
    v.hoogte = 0;
    v.verborgen = v.weg;
    v.timer = v.weg ? tussen(8, 20) : tussen(2, 7);
  }
}

export function tekenVogel(ctx: CanvasRenderingContext2D, tijd: number) {
  if (!v.img || v.verborgen) return;
  const wiek = v.toestand === 'vliegt' ? Math.round(Math.sin(tijd * 30)) : 0; // vleugelslag: een tikje op en neer
  const x = Math.round(v.x - v.img.width / 2);
  const y = Math.round(v.y - v.img.height - v.hoogte + wiek);
  if (!v.links) {
    ctx.drawImage(v.img, x, y);
    return;
  }
  ctx.save();
  ctx.translate(x + v.img.width, y);
  ctx.scale(-1, 1);
  ctx.drawImage(v.img, 0, 0);
  ctx.restore();
}
