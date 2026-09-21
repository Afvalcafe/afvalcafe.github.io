// Achtergrond van "Vang het afval": lucht, wolken, de Delftse Markt (Nieuwe Kerk, Oude Kerk, grachtenhuizen) en een grasveld.
// De sprites komen uit tools/maak_achtergrond.py. Lucht en skyline+gras worden bij elke resize één keer voorgetekend.

type Laad = (naam: string) => Promise<HTMLImageElement>;

export const GRAS_HOOGTE = 28; // hoogte van het grasveld onderin, in pixels

const LUCHT = ['#2f6fd0', '#3b82dc', '#5299e6', '#74b4ee', '#9ccdf3']; // van boven naar beneden
const NEVEL = 'rgba(156, 205, 243, 0.3)'; // de skyline wat uitgewassen, zodat vallend afval erboven afsteekt
const OUDE_KERK_AFSTAND = 30; // Oude Kerk staat zoveel pixels rechts van het midden
const WOLKEN = [
  { naam: 'wolk', x: 0.15, y: 0.1, snelheid: 1.5 },
  { naam: 'wolk2', x: 0.7, y: 0.22, snelheid: 1 },
  { naam: 'wolk', x: 0.45, y: 0.4, snelheid: 0.6 },
];

let huizen: HTMLImageElement;
let kerk: HTMLImageElement;
let oudeKerk: HTMLImageElement;
let gras: HTMLImageElement;
let wolken: { img: HTMLImageElement; x: number; y: number; snelheid: number }[] = [];
let lucht: HTMLCanvasElement;
let voor: HTMLCanvasElement; // skyline en gras, rest doorzichtig

export async function laadAchtergrond(laad: Laad) {
  let wolk: HTMLImageElement, wolk2: HTMLImageElement;
  [huizen, kerk, oudeKerk, gras, wolk, wolk2] = await Promise.all(
    ['delft-huizen', 'delft-kerk', 'delft-oudekerk', 'gras', 'wolk', 'wolk2'].map(laad),
  );
  wolken = WOLKEN.map((w) => ({ img: w.naam === 'wolk' ? wolk : wolk2, x: w.x, y: w.y, snelheid: w.snelheid }));
}

const nieuwDoek = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g] as const;
};

// Tegel een sprite horizontaal over de hele breedte, zo dat er een tegel precies op `midden` staat.
function tegel(g: CanvasRenderingContext2D, img: HTMLImageElement, w: number, y: number, midden: number) {
  const start = Math.round(midden - img.width / 2) % img.width;
  for (let x = start - img.width; x < w; x += img.width) g.drawImage(img, x, y);
}

export function bouwAchtergrond(W: number, H: number) {
  const grond = H - GRAS_HOOGTE;

  let g: CanvasRenderingContext2D;
  [lucht, g] = nieuwDoek(W, H);
  // Banden van vaste hoogte vanaf de horizon omhoog; op een hoog scherm vult de donkerste band de rest.
  const band = Math.min(45, Math.ceil(grond / LUCHT.length));
  LUCHT.forEach((kleur, k) => {
    g.fillStyle = kleur;
    g.fillRect(0, k === 0 ? 0 : grond - (LUCHT.length - k) * band, W, H); // elke lichtere band overschildert de rest
  });

  [voor, g] = nieuwDoek(W, H);
  const midden = Math.round(W / 2);
  tegel(g, huizen, W, grond - huizen.height + 2, midden);
  g.drawImage(oudeKerk, midden + OUDE_KERK_AFSTAND, grond - oudeKerk.height + 2);
  g.drawImage(kerk, midden - Math.floor(kerk.width / 2), grond - kerk.height + 2);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = NEVEL;
  g.fillRect(0, 0, W, grond + 2);
  g.globalCompositeOperation = 'source-over';
  tegel(g, gras, W, grond, midden);
}

export function tekenAchtergrond(ctx: CanvasRenderingContext2D, W: number, H: number, tijd: number, rustig: boolean) {
  ctx.drawImage(lucht, 0, 0);
  const grond = H - GRAS_HOOGTE;
  for (const w of wolken) {
    const b = W + w.img.width;
    const x = ((w.x * b + (rustig ? 0 : tijd * w.snelheid)) % b) - w.img.width;
    ctx.drawImage(w.img, Math.round(x), Math.round(w.y * grond));
  }
  ctx.drawImage(voor, 0, 0);
}
