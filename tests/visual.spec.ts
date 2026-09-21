import { expect, test } from '@playwright/test';
import { pages } from './pages';

// De galerij en het spel zijn niet te vergelijken: alles beweegt willekeurig, dus daar is geen vaste pagina omheen.
for (const file of pages.filter((f) => f !== 'galerij.html' && f !== 'vangen.html')) {
  test(`uiterlijk ${file}`, async ({ page }) => {
    await page.goto(file);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${file.replace('.html', '')}.png`, {
      fullPage: true,
      // De vijver is willekeurig en bewegend; alleen de pagina eromheen vergelijken.
      // De bingofoto's schaalt WebKit niet elke keer pixel-voor-pixel gelijk; het raster en de labels blijven wel vergeleken.
      mask: [page.locator('#pond'), page.locator('.vakje img')],
    });
  });
}
