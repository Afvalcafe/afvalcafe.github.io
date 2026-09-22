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
    // The Home link swaps between an icon (phones) and plain text (everywhere else, see src/pond.css); whichever
    // is actually visible gets cut out of the mask, the same way a normal link's text does below.
    const icon = a.querySelector<SVGSVGElement>('svg.home-icon');
    const path = icon?.querySelector('path');
    if (icon && path && getComputedStyle(icon).display !== 'none') {
      const iconBox = icon.getBoundingClientRect();
      const viewBox = icon.viewBox.baseVal;
      const scale = iconBox.width / viewBox.width;
      ctx.save();
      ctx.translate(iconBox.left - box.left, iconBox.top - box.top);
      ctx.scale(scale, scale);
      ctx.fill(new Path2D(path.getAttribute('d') ?? ''), 'evenodd');
      ctx.restore();
    } else {
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.textBaseline = 'middle';
      // On phones the link centers its text (see the max-width: 699px rules in src/pond.css); on a flex link
      // fillText needs to match that centering itself, or the cutout lands where left-aligned text would be.
      if (cs.display === 'flex') {
        ctx.textAlign = 'center';
        ctx.fillText(a.textContent ?? '', w / 2, h / 2 + 1);
      } else {
        ctx.fillText(a.textContent ?? '', parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), h / 2 + 1);
      }
    }
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
