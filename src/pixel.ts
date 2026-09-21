// Grootte van een pond-pixel. Elke pond-pixel is een geheel aantal schermpixels breed, anders schuiven
// randen en flikkeren sprites. Gedeeld met de galerij, zodat foto's en boomstammen op hetzelfde raster staan.
export function pondScale(cssW = window.innerWidth, dpr = window.devicePixelRatio || 1) {
  const min = Math.round(2 * dpr);
  const max = Math.round(6 * dpr);
  const deviceScale = Math.min(max, Math.max(min, Math.round(Math.max(2, cssW / 360) * dpr)));
  return { deviceScale, scale: deviceScale / dpr }; // scale = CSS-pixels per pond-pixel
}

// --px: één pond-pixel in CSS, voor lay-out in veelvouden ervan (zie gallery.css).
const apply = () => document.documentElement.style.setProperty('--px', `${pondScale().scale}px`);
apply();
window.addEventListener('resize', apply);
