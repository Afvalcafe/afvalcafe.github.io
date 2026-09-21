// Rafts: photos on logs that drift through the pond as fixed objects (gallery).
// The log is drawn on the canvas by pond.ts; the photo is a button in the HTML (.raft) that
// gets moved along with it here. Birds and litter can't pass through; the rafts also collide with each other,
// with the edges of the pond and with the menu.
// Each raft has a home spot in a grid and is gently pulled back towards it, so the wander
// stays calm. The pond is as tall as the grid: the page scrolls through it (see camera in pond.ts).

export const RAFT_W = 54; // in pond-pixels: boomstam 54x15 (boomstam.png)...
export const RAFT_H = 48; // ...met de foto van 48x36 erboven, 3 rijen over de stam heen
export const LOG_Y = 33; // bovenkant van de stam binnen het vlot
const MARGIN = 2; // minimale ruimte tussen vlotten en het menu
const EDGE = 8; // space between the grid and the edge of the pond or the menu
const ROW_GAP = 20; // ruimte tussen de rijen van het raster
const HOME_JITTER = 3; // thuisplekken liggen niet precies op het raster
const PULL = 0.12; // hoe sterk een vlot naar huis wordt getrokken (veer)
const DAMPING = 0.6; // hoe snel de snelheid uitdooft
const KICK = 3; // sterkte van de willekeurige duwtjes
const MAX_SPEED = 5; // pond-pixels per seconde
const DIP = [1, 2, 2, 1, 0, -1, 0]; // zakt bij een klik in hele pond-pixels
const DIP_STEP = 0.06; // seconden per stap

export interface Rect { x0: number; y0: number; x1: number; y1: number }
interface Raft { el: HTMLElement; x: number; y: number; hx: number; hy: number; vx: number; vy: number; dip: number; active: boolean }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
// approximately normally distributed (sum of three), mean 0 and spread 1
const noise = () => rand(-1, 1) + rand(-1, 1) + rand(-1, 1);

// How much a rectangle (x, y, RAFT_W x RAFT_H) overlaps another one, or null.
function overlap(ax: number, ay: number, b: Rect, pad: number) {
  const ox = Math.min(ax + RAFT_W, b.x1 + pad) - Math.max(ax, b.x0 - pad);
  const oy = Math.min(ay + RAFT_H, b.y1 + pad) - Math.max(ay, b.y0 - pad);
  return ox > 0 && oy > 0 ? { ox, oy } : null;
}

export function createRafts() {
  const rafts: Raft[] = [...document.querySelectorAll<HTMLElement>('.raft')].map((el) => ({
    el, x: 0, y: 0, hx: 0, hy: 0, vx: 0, vy: 0, dip: -1, active: false,
  }));
  // gallery.ts reports a click; the raft dips down briefly
  for (const r of rafts) r.el.addEventListener('plons', () => (r.dip = 0));

  const active = () => rafts.filter((r) => r.active);
  const rectOf = (r: Raft): Rect => ({ x0: r.x, y0: r.y, x1: r.x + RAFT_W, y1: r.y + RAFT_H });

  // Places the rafts at their home spot in a grid next to or below the menu, and returns the height of the
  // pond: at least the screen, but taller if the grid needs more rows.
  function layout(W: number, viewH: number, nav: Rect | null, phone: boolean) {
    // on a phone the menu sits on top, otherwise on the left; the grid starts below or beside it
    const x0 = !phone && nav ? nav.x1 + EDGE : EDGE;
    const y0 = phone && nav ? nav.y1 + EDGE : EDGE;
    const x1 = W - EDGE;
    const cols = Math.max(1, Math.floor((x1 - x0) / (RAFT_W + 14)));
    const cellW = (x1 - x0) / cols;
    const cellH = RAFT_H + ROW_GAP;
    const rows = Math.ceil(rafts.length / cols);
    rafts.forEach((r, i) => {
      r.hx = x0 + (i % cols) * cellW + (cellW - RAFT_W) / 2 + rand(-HOME_JITTER, HOME_JITTER);
      r.hy = y0 + Math.floor(i / cols) * cellH + rand(-HOME_JITTER, HOME_JITTER);
      r.x = r.hx;
      r.y = r.hy;
      r.vx = r.vy = 0;
      r.active = true;
      r.el.classList.add('floating');
    });
    return Math.max(viewH, Math.ceil(y0 + rows * cellH + EDGE));
  }

  // Collision with a fixed object (menu): the raft slides out and bounces back.
  function bounceOff(r: Raft, b: Rect) {
    const o = overlap(r.x, r.y, b, MARGIN);
    if (!o) return;
    if (o.ox < o.oy) {
      const dir = r.x + RAFT_W / 2 < (b.x0 + b.x1) / 2 ? -1 : 1;
      r.x += dir * o.ox;
      r.vx = Math.abs(r.vx) * dir;
    } else {
      const dir = r.y + RAFT_H / 2 < (b.y0 + b.y1) / 2 ? -1 : 1;
      r.y += dir * o.oy;
      r.vy = Math.abs(r.vy) * dir;
    }
  }

  // Two rafts colliding: push them apart and swap velocity along the collision direction (equal mass).
  function collide(a: Raft, b: Raft) {
    const o = overlap(a.x, a.y, rectOf(b), 0);
    if (!o) return;
    if (o.ox < o.oy) {
      const dir = a.x < b.x ? -1 : 1;
      a.x += (dir * o.ox) / 2;
      b.x -= (dir * o.ox) / 2;
      [a.vx, b.vx] = [b.vx * 0.9, a.vx * 0.9];
    } else {
      const dir = a.y < b.y ? -1 : 1;
      a.y += (dir * o.oy) / 2;
      b.y -= (dir * o.oy) / 2;
      [a.vy, b.vy] = [b.vy * 0.9, a.vy * 0.9];
    }
  }

  // Each raft does a calm, undirected walk: no preferred direction, just small nudges.
  function update(dt: number, W: number, H: number, fixed: Rect[], scale: number, still: boolean, cam: number, viewH: number) {
    dt = Math.max(0, dt); // het eerste beeld kan een iets negatieve tijdstap geven
    const list = active();
    for (const r of list) {
      if (!still) {
        r.vx += noise() * KICK * Math.sqrt(dt) - (DAMPING * r.vx + PULL * (r.x - r.hx)) * dt;
        r.vy += noise() * KICK * Math.sqrt(dt) - (DAMPING * r.vy + PULL * (r.y - r.hy)) * dt;
        const s = Math.hypot(r.vx, r.vy);
        if (s > MAX_SPEED) { r.vx *= MAX_SPEED / s; r.vy *= MAX_SPEED / s; }
        r.x += r.vx * dt;
        r.y += r.vy * dt;
      }
      if (r.x < 0) { r.x = 0; r.vx = Math.abs(r.vx); }
      if (r.x > W - RAFT_W) { r.x = W - RAFT_W; r.vx = -Math.abs(r.vx); }
      if (r.y < 0) { r.y = 0; r.vy = Math.abs(r.vy); }
      if (r.y > H - RAFT_H) { r.y = H - RAFT_H; r.vy = -Math.abs(r.vy); }
      for (const b of fixed) bounceOff(r, b);
    }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) collide(list[i], list[j]);

    for (const r of list) {
      if (r.dip >= 0 && (r.dip += dt) >= DIP.length * DIP_STEP) r.dip = -1;
      // on the pond's pixel grid: whole pond pixels, for the photo too
      const dip = r.dip < 0 ? 0 : DIP[Math.floor(r.dip / DIP_STEP)];
      const top = Math.round(r.y) + dip - cam; // screen position: the pond scrolls underneath the screen
      r.el.style.transform = `translate(${Math.round(r.x) * scale}px, ${top * scale}px)`;
      r.el.style.visibility = top + RAFT_H < 0 || top > viewH ? 'hidden' : ''; // buiten beeld ook niet met Tab bereikbaar
    }
  }

  return {
    has: rafts.length > 0,
    layout,
    update,
    rects: () => active().map(rectOf),
    // Position of each log (top left) for drawing, dip included.
    logs: () => active().map((r) => ({
      x: Math.round(r.x),
      y: Math.round(r.y) + LOG_Y + (r.dip < 0 ? 0 : DIP[Math.floor(r.dip / DIP_STEP)]),
    })),
  };
}
