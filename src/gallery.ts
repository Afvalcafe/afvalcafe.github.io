// Gallery: photos float on logs (CSS), a click gives a splash and opens the large view.
import './gallery.css';
import { pondScale } from './pixel';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPLASH_MS = 320; // zo lang wachten we met openen, zodat de plons te zien is
const DROP_COUNT = 14;
const DROP_COLORS = ['#fff', '#fff', '#bfe6f5', '#8fd0ea'];

interface Photo { src: string; alt: string; caption: string; button: HTMLButtonElement; raft: HTMLElement }

const photos: Photo[] = [...document.querySelectorAll<HTMLButtonElement>('.gallery button')].map((button) => {
  const img = button.querySelector('img')!;
  return { src: img.currentSrc || img.src, alt: img.alt, caption: button.dataset.caption ?? '', button, raft: button.closest<HTMLElement>('.raft')! };
});

// Splash at the log: droplets spatter up and fall back, while the raft dips down briefly.
function splash(raft: HTMLElement) {
  if (reduceMotion) return;
  const px = pondScale().scale;
  const box = raft.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.bottom - 2 * px; // waterlijn ter hoogte van de onderkant van de stam

  raft.dispatchEvent(new Event('plons')); // rafts.ts laat foto en boomstam samen zakken

  for (let i = 0; i < DROP_COUNT; i++) {
    const drop = document.createElement('i');
    drop.className = 'splash-drop';
    drop.style.left = `${x + (Math.random() - 0.5) * box.width * 0.6}px`;
    drop.style.top = `${y}px`;
    drop.style.background = DROP_COLORS[i % DROP_COLORS.length];
    document.body.appendChild(drop);
    const dx = (Math.random() - 0.5) * 160;
    const up = 50 + Math.random() * 70;
    // parabola in three steps: up, peak, fall back
    drop.animate(
      [
        { transform: 'translate(0, 0)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${-up}px)`, opacity: 1, offset: 0.45, easing: 'ease-in' },
        { transform: `translate(${dx}px, 12px)`, opacity: 0 },
      ],
      { duration: 550 + Math.random() * 250, easing: 'ease-out' },
    ).onfinish = () => drop.remove();
  }
}

let open: { root: HTMLElement; index: number; opener: HTMLElement; close: () => void } | null = null;

function show(index: number) {
  if (!open) return;
  const n = photos.length;
  open.index = (index + n) % n;
  const p = photos[open.index];
  const img = open.root.querySelector<HTMLImageElement>('.lightbox-img')!;
  img.src = p.src;
  img.alt = p.alt;
  open.root.querySelector('.lightbox-text')!.textContent = p.caption;
  open.root.querySelector('.lightbox-count')!.textContent = `${open.index + 1} / ${n}`;
}

function openLightbox(index: number, opener: HTMLElement) {
  const root = document.createElement('div');
  root.className = 'lightbox';
  root.innerHTML = `
    <div class="lightbox-box" role="dialog" aria-modal="true" aria-label="Foto">
      <button type="button" class="lightbox-close" aria-label="Sluiten">X</button>
      <div class="lightbox-frame">
        <img class="lightbox-img" alt="">
        <button type="button" class="lightbox-nav lightbox-prev" aria-label="Vorige foto">&lt;</button>
        <button type="button" class="lightbox-nav lightbox-next" aria-label="Volgende foto">&gt;</button>
      </div>
      <p class="lightbox-caption" aria-live="polite"><span class="lightbox-text"></span><span class="lightbox-count"></span></p>
    </div>`;
  document.body.appendChild(root);
  document.documentElement.style.overflow = 'hidden';

  const close = () => {
    document.removeEventListener('keydown', onKey);
    document.documentElement.style.overflow = '';
    root.classList.add('lightbox-out');
    window.setTimeout(() => root.remove(), reduceMotion ? 0 : 200);
    open = null;
    opener.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(open!.index - 1);
    else if (e.key === 'ArrowRight') show(open!.index + 1);
    else if (e.key === 'Tab') {
      // focus stays within the view
      const items = [...root.querySelectorAll<HTMLElement>('button')];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => e.target === root && close()); // klik naast het kader sluit
  root.querySelector('.lightbox-close')!.addEventListener('click', close);
  root.querySelector('.lightbox-prev')!.addEventListener('click', () => show(open!.index - 1));
  root.querySelector('.lightbox-next')!.addEventListener('click', () => show(open!.index + 1));

  open = { root, index, opener, close };
  show(index);
  root.querySelector<HTMLElement>('.lightbox-close')!.focus();
}

photos.forEach((p, i) => {
  p.button.addEventListener('click', () => {
    if (open) return;
    splash(p.raft);
    window.setTimeout(() => !open && openLightbox(i, p.button), reduceMotion ? 0 : SPLASH_MS);
  });
});
