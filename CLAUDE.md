# Afval & Café website

Static site for Afval & Café (monthly litter-picking in Delft, followed by drinks; ages 20-30), published at afvalcafe.github.io via GitHub Pages.

## Git
- No Claude attribution in commits or PRs: no `Co-Authored-By` lines, no "Generated with Claude Code".
- Only commit when asked. Stage specific files; the working tree often has unrelated uncommitted edits.

## Stack
- Plain HTML pages in the repo root (`index`, `over-ons`, `agenda`, `doe-mee`, `contact`) plus Vite 8 and TypeScript.
- `vite.config.ts` builds every `.html` in the root automatically, so a new page needs no config.
- `src/pond.ts` + `src/pond.css`: the pixel-art pond on `<canvas id="pond">` (ducks, coots, swans, lily pads, clickable litter). Drawn at low resolution into a pixel buffer and scaled up with CSS (`pixelated`). Uses `Math.random` throughout, so it is different on every load.
- `galerij.html` + `src/rafts.ts` + `src/gallery.ts` + `src/gallery.css`: the gallery is the pond itself. Each photo (`.raft` button) floats on a log drawn on the canvas (`public/sprites/boomstam.png`); `rafts.ts` random-walks the rafts and makes them solid for birds and litter, `gallery.ts` handles the splash and lightbox. `src/pixel.ts` sets `--px` (one pond pixel in CSS px) so DOM sizes are whole pond pixels. Only as many rafts show as fit in 40% of the water; the lightbox still browses all photos. The gallery page is left out of the screenshot tests (everything on it moves randomly).
- `src/menu.ts`: the nav's inverted hover/current state, built from a per-link canvas mask (blend modes are unreliable in Safari).
- Font: Press Start 2P via `@fontsource`.
- Site content and code comments are in Dutch. Keep new copy and comments in Dutch.

## Commands
- `npm run dev`: dev server
- `npm run build`: `tsc --noEmit` then `vite build`
- `npm test`: Playwright (builds and serves the production build on port 4173)
- `npm run test:ui`: interactive Playwright runner
- `npm run test:update`: regenerate screenshot baselines after an intended visual change

## Testing
- Tests are in `tests/` and run on three projects: `desktop` (Chrome), `iphone` (iPhone 15, WebKit), `pixel` (Pixel 7). Mobile appearance is the main concern.
- `pages.spec.ts` covers load errors, horizontal overflow and menu fit. `visual.spec.ts` compares screenshots. `a11y.spec.ts` runs axe.
- The pond canvas is masked in screenshots because it is random and animated.
- Baselines in `tests/visual.spec.ts-snapshots/` are macOS renders (`*-darwin.png`). Linux would render differently, so screenshot tests are local only.
- Deliberately no tests in CI or in the deploy workflow.
- Visual changes will fail the screenshot tests. Check the diff, and if it is intended, run `npm run test:update` and commit the new baselines.

## Deploy
`.github/workflows/deploy.yml` runs on push to `main`: `npm ci`, `npm run build`, copies loose files (e.g. `images/`) next to the Vite output, and publishes to Pages.
Static assets go in `images/` (copied as-is) or `public/`.
