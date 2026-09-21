// Menu inversion: on hover/current page the link becomes a white block with the text cut out of it as transparent.
// For each link we draw a mask (white panel with the text cut out) on a canvas, using the
// page's font and at screen resolution. Blend modes don't work everywhere (Safari).

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
  // Wait for the pixel font to load, otherwise the mask is drawn with a fallback font.
  void document.fonts.load('16px "Press Start 2P"').then(build, build);
  window.addEventListener('resize', build);
}
