// The bird in the park: mostly sits still on the grass or bench, occasionally hops a bit, sometimes flies to another
// spot, and every now and then leaves the frame and comes back after a while. Pure decor: it doesn't take part in the game.
import { layout } from './background';

const HOP_LENGTH = 9; // pixels per hop
const HOP_DURATION = 0.32;
const HOP_HEIGHT = 4;
const FLIGHT_SPEED = 70; // pixels per second

type Point = { x: number; y: number };

const bird = {
  img: null as HTMLImageElement | null,
  x: 0, // center
  y: 0, // feet, without the height of a hop or flight
  height: 0,
  facingLeft: false, // the sprite faces right, so we mirror it to face left
  state: 'perched' as 'perched' | 'hopping' | 'flying',
  hidden: false, // out of frame, waiting to come back
  timer: 1.5, // until the next action
  hops: 0,
  from: { x: 0, y: 0 } as Point,
  to: { x: 0, y: 0 } as Point,
  arc: 0,
  duration: 1,
  elapsed: 0,
  leaving: false, // flying out of frame
  W: 0,
  H: 0,
};

export function loadBird(img: HTMLImageElement) {
  bird.img = img;
}

const between = (a: number, b: number) => a + Math.random() * (b - a);

// A place to perch: on the bench or somewhere on the grass below the path.
function choosePerch(): Point {
  if (Math.random() < 0.3) return { x: layout.benchX + between(-6, 6), y: layout.benchY + 8 };
  return { x: between(12, bird.W - 12), y: between(layout.pathY + 12, bird.H - 14) };
}

export function placeBird(W: number, H: number) {
  const first = bird.W === 0;
  bird.W = W;
  bird.H = H;
  if (first) {
    bird.x = layout.benchX;
    bird.y = layout.benchY + 8;
  }
  bird.x = Math.min(Math.max(bird.x, 8), W - 8);
  bird.y = Math.min(Math.max(bird.y, layout.benchY + 8), H - 4);
}

function flyTo(to: Point, arc: number, leaving = false) {
  bird.state = 'flying';
  bird.from = { x: bird.x, y: bird.y };
  bird.to = to;
  bird.arc = arc;
  bird.leaving = leaving;
  bird.duration = Math.min(3, Math.max(0.9, Math.hypot(to.x - bird.x, to.y - bird.y) / FLIGHT_SPEED));
  bird.elapsed = 0;
  bird.facingLeft = to.x < bird.x;
}

function chooseAction() {
  const roll = Math.random();
  if (roll < 0.5) {
    bird.state = 'hopping';
    bird.hops = 2 + Math.floor(Math.random() * 3);
    bird.facingLeft = Math.random() < 0.5;
    bird.elapsed = 0;
  } else if (roll < 0.85) {
    flyTo(choosePerch(), between(15, 35));
  } else if (roll < 0.92) {
    // out of frame, somewhere high in the sky
    flyTo({ x: bird.x < bird.W / 2 ? -20 : bird.W + 20, y: between(20, layout.ground * 0.6) }, 10, true);
  } else {
    bird.facingLeft = !bird.facingLeft; // a quick look around
  }
}

export function updateBird(dt: number, still: boolean) {
  if (!bird.img || !bird.W || still) return;

  if (bird.state === 'perched') {
    bird.timer -= dt;
    if (bird.timer > 0) return;
    if (bird.hidden) {
      // back: from the left or right edge into frame, towards a perch
      bird.hidden = false;
      bird.x = Math.random() < 0.5 ? -20 : bird.W + 20;
      bird.y = between(20, layout.ground * 0.6);
      flyTo(choosePerch(), 10);
      return;
    }
    bird.timer = between(2, 6);
    chooseAction();
    return;
  }

  bird.elapsed += dt;
  if (bird.state === 'hopping') {
    const next = bird.x + (bird.facingLeft ? -1 : 1) * HOP_LENGTH * (dt / HOP_DURATION);
    if (next < 8 || next > bird.W - 8) bird.facingLeft = !bird.facingLeft;
    else bird.x = next;
    bird.height = Math.sin(((bird.elapsed % HOP_DURATION) / HOP_DURATION) * Math.PI) * HOP_HEIGHT;
    if (bird.elapsed >= HOP_DURATION * bird.hops) {
      bird.state = 'perched';
      bird.height = 0;
    }
    return;
  }

  const t = Math.min(1, bird.elapsed / bird.duration);
  bird.x = bird.from.x + (bird.to.x - bird.from.x) * t;
  bird.y = bird.from.y + (bird.to.y - bird.from.y) * t;
  bird.height = Math.sin(t * Math.PI) * bird.arc;
  if (t >= 1) {
    bird.state = 'perched';
    bird.height = 0;
    bird.hidden = bird.leaving;
    bird.timer = bird.leaving ? between(8, 20) : between(2, 7);
  }
}

export function drawBird(ctx: CanvasRenderingContext2D, time: number) {
  if (!bird.img || bird.hidden) return;
  const flap = bird.state === 'flying' ? Math.round(Math.sin(time * 30)) : 0; // wingbeat: a small up-and-down tick
  const x = Math.round(bird.x - bird.img.width / 2);
  const y = Math.round(bird.y - bird.img.height - bird.height + flap);
  if (!bird.facingLeft) {
    ctx.drawImage(bird.img, x, y);
    return;
  }
  ctx.save();
  ctx.translate(x + bird.img.width, y);
  ctx.scale(-1, 1);
  ctx.drawImage(bird.img, 0, 0);
  ctx.restore();
}
