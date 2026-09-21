// Size of one pond pixel. Every pond pixel is a whole number of screen pixels wide, otherwise edges
// shift and sprites flicker. Shared with the gallery, so photos and logs line up on the same grid.
export function pondScale(cssW = window.innerWidth, dpr = window.devicePixelRatio || 1) {
  const min = Math.round(2 * dpr);
  const max = Math.round(6 * dpr);
  const deviceScale = Math.min(max, Math.max(min, Math.round(Math.max(2, cssW / 360) * dpr)));
  return { deviceScale, scale: deviceScale / dpr }; // scale = CSS-pixels per pond-pixel
}

// --px: one pond pixel in CSS, for laying things out in multiples of it (see gallery.css).
const apply = () => document.documentElement.style.setProperty('--px', `${pondScale().scale}px`);
apply();
window.addEventListener('resize', apply);
