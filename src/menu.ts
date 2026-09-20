// Menu-omkering: bij hover/huidige pagina is de knop een wit blok waar de tekst doorzichtig is.
// Per knop tekenen we een masker (wit vlak met de tekst eruit gesneden) op een canvas, met het
// lettertype van de pagina en op schermresolutie. Blend-modes werken niet overal (Safari).

function buildMasks(nav: HTMLElement) {
  const dpr = window.devicePixelRatio || 1;
  for (const a of nav.querySelectorAll<HTMLAnchorElement>('a')) {
    const box = a.getBoundingClientRect();
    const cs = getComputedStyle(a);
    const w = Math.ceil(box.width);
    const h = Math.ceil(box.height);
    const c = document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) continue;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(a.textContent ?? '', parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), h / 2 + 1);
    a.style.setProperty('--knockout', `url(${c.toDataURL('image/png')})`);
  }
  nav.dataset.knockout = '';
}

const nav = document.querySelector<HTMLElement>('.pond-menu');
if (nav) {
  const build = () => buildMasks(nav);
  // Wacht tot het pixellettertype geladen is, anders wordt het masker met een reservefont getekend.
  void document.fonts.load('16px "Press Start 2P"').then(build, build);
  window.addEventListener('resize', build);
}
