import { expect, test } from '@playwright/test';
import { pages } from './pages';

// De galerij is niet te vergelijken: alles beweegt willekeurig, dus daar is geen vaste pagina omheen.
for (const file of pages.filter((f) => f !== 'galerij.html')) {
  test(`uiterlijk ${file}`, async ({ page }) => {
    await page.goto(file);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${file.replace('.html', '')}.png`, {
      fullPage: true,
      // The pond and the game (Doe mee) are random and animated; only compare the page around them.
      // De bingofoto's schaalt WebKit niet elke keer pixel-voor-pixel gelijk; het raster en de labels blijven wel vergeleken.
      mask: [page.locator('#pond'), page.locator('#game-canvas'), page.locator('.cell img')],
    });
  });
}
