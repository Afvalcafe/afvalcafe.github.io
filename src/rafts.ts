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
const DRAG_START_THRESHOLD = 6; // CSS pixels of movement before a press turns into a drag instead of a click
const WOBBLE_DECAY = 2.6; // hoe snel het schommelen na een botsing uitdempt
const WOBBLE_SPEED = 15; // hoe snel het heen en weer schommelt

export interface Rect { x0: number; y0: number; x1: number; y1: number }
interface Raft {
  el: HTMLElement; x: number; y: number; hx: number; hy: number; vx: number; vy: number; dip: number; active: boolean;
  dragging: boolean; dragOffX: number; dragOffY: number; startX: number; startY: number;
  wobble: number; wobbleV: number; // hoek en hoeksnelheid: schommelt na een botsing, als drijvend op het water
}

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
    dragging: false, dragOffX: 0, dragOffY: 0, startX: 0, startY: 0, wobble: 0, wobbleV: 0,
  }));
  // gallery.ts reports a click; the raft dips down briefly
  for (const r of rafts) r.el.addEventListener('plons', () => (r.dip = 0));

  const active = () => rafts.filter((r) => r.active);
  const rectOf = (r: Raft): Rect => ({ x0: r.x, y0: r.y, x1: r.x + RAFT_W, y1: r.y + RAFT_H });

  // Dragging: press and hold a raft (the log or the photo) and drag it into another one to shove it aside.
  // scale/cam are kept in sync from update() below, so pointer events (viewport pixels) can be converted to
  // pond coordinates at any time, including outside the render loop.
  let dragScale = 1;
  let dragCam = 0;
  const toPond = (e: PointerEvent) => ({ x: e.clientX / dragScale, y: e.clientY / dragScale + dragCam });
  let lastMoveT = 0;

  for (const r of rafts) {
    let pressed = false; // ingedrukt, maar nog niet over de drempel heen: kan nog een gewone klik worden
    let pointerId = -1;

    r.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // alleen de primaire knop of een vinger
      pressed = true;
      pointerId = e.pointerId;
      const p = toPond(e);
      r.startX = p.x;
      r.startY = p.y;
      // niet meteen capturen/preventDefault: een gewone klik op de foto (de lightbox) mag niet verstoord worden,
      // pas als er echt gesleept wordt (zie pointermove) grijpen we in
    });
    r.el.addEventListener('pointermove', (e) => {
      if (!pressed || e.pointerId !== pointerId) return;
      const p = toPond(e);
      if (!r.dragging) {
        if (Math.hypot(p.x - r.startX, p.y - r.startY) * dragScale < DRAG_START_THRESHOLD) return;
        // drempel overschreden: nu pas echt beginnen met slepen
        r.dragging = true;
        r.dragOffX = p.x - r.x;
        r.dragOffY = p.y - r.y;
        r.vx = r.vy = 0;
        lastMoveT = performance.now();
        try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
        r.el.querySelector('button')?.blur();
      }
      const nx = p.x - r.dragOffX;
      const ny = p.y - r.dragOffY;
      const now = performance.now();
      const dt = Math.max(0.001, (now - lastMoveT) / 1000);
      lastMoveT = now;
      // snelheid in pond-pixels per seconde, zodat loslaten een natuurlijke gooi geeft (zie update())
      r.vx = clamp((nx - r.x) / dt, -MAX_SPEED * 6, MAX_SPEED * 6);
      r.vy = clamp((ny - r.y) / dt, -MAX_SPEED * 6, MAX_SPEED * 6);
      r.x = nx;
      r.y = ny;
    });
    let justDragged = false;
    const endDrag = (e: PointerEvent) => {
      pressed = false;
      if (!r.dragging) return;
      r.dragging = false;
      justDragged = true; // de klik die vlak na pointerup komt, hoort nog bij deze sleep
      kick(r, Math.hypot(r.vx, r.vy) / (MAX_SPEED * 6)); // losgelaten met vaart: het vlot dobbert na
      try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    };
    r.el.addEventListener('pointerup', endDrag);
    r.el.addEventListener('pointercancel', endDrag);
    // Een sleep mag niet ook de foto openen: de klik die vlak na pointerup komt, wordt genegeerd.
    r.el.querySelector('button')?.addEventListener(
      'click',
      (e) => {
        if (justDragged) {
          justDragged = false;
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      },
      true,
    );
  }

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

  // A knock: the raft starts (or adds to) a damped back-and-forth tilt, as if it just bobbed on the water.
  function kick(r: Raft, strength: number) {
    r.wobbleV += (Math.random() < 0.5 ? -1 : 1) * WOBBLE_SPEED * clamp(strength, 0, 1.4);
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
    kick(r, 0.3);
  }

  // Two rafts colliding: pushed apart along the actual line between their centers (not just the one axis with
  // the smallest overlap), so a glancing hit shoves them diagonally apart instead of always straightening out
  // into a perfect horizontal/vertical bounce — closer to how logs nudge each other adrift on water. A bit of
  // velocity carries over from the other raft (an elastic-ish swap) and both get a wobble kick, more so the
  // harder the impact.
  function collide(a: Raft, b: Raft) {
    const o = overlap(a.x, a.y, rectOf(b), 0);
    if (!o) return;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    if (Math.abs(dx) + Math.abs(dy) < 0.01) { dx = rand(-1, 1); dy = rand(-1, 1); }
    const dist = Math.hypot(dx, dy);
    dx /= dist;
    dy /= dist;
    const push = Math.min(o.ox, o.oy) / 2;
    a.x -= dx * push;
    a.y -= dy * push;
    b.x += dx * push;
    b.y += dy * push;
    // approach speed along the collision line: only bounce if they're actually moving into each other
    const approach = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
    if (approach < 0) {
      a.vx += dx * approach * 0.9;
      a.vy += dy * approach * 0.9;
      b.vx -= dx * approach * 0.9;
      b.vy -= dy * approach * 0.9;
    }
    const impact = clamp(Math.abs(approach) / MAX_SPEED + push / RAFT_W, 0.15, 1.4);
    kick(a, impact);
    kick(b, impact);
  }

  // Each raft does a calm, undirected walk: no preferred direction, just small nudges.
  function update(dt: number, W: number, H: number, fixed: Rect[], scale: number, still: boolean, cam: number, viewH: number) {
    dt = Math.max(0, dt); // het eerste beeld kan een iets negatieve tijdstap geven
    dragScale = scale;
    dragCam = cam;
    const list = active();
    for (const r of list) {
      if (r.dragging) {
        // positie komt al van de pointer (zie pointermove hierboven); alleen de rand en botsingen hieronder gelden nog
      } else if (!still) {
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
      // Bobbing tilt: a damped spring on the angle, so a collision (or a jerky drag) makes it rock back and
      // forth a few times instead of snapping straight, like something actually floating would.
      r.wobbleV -= (18 * r.wobble + WOBBLE_DECAY * r.wobbleV) * dt; // 18 = veerstijfheid
      r.wobble += r.wobbleV * dt;
      // on the pond's pixel grid: whole pond pixels, for the photo too
      const dip = r.dip < 0 ? 0 : DIP[Math.floor(r.dip / DIP_STEP)];
      const top = Math.round(r.y) + dip - cam; // screen position: the pond scrolls underneath the screen
      const tilt = clamp(r.wobble, -18, 18);
      r.el.style.transform = `translate(${Math.round(r.x) * scale}px, ${top * scale}px) rotate(${tilt.toFixed(1)}deg)`;
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
