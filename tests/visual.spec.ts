import { expect, test } from '@playwright/test';
import { pages } from './pages';

// De galerij is niet te vergelijken: alle foto's drijven willekeurig rond, dus daar is geen vaste pagina omheen.
for (const file of pages.filter((f) => f !== 'galerij.html')) {
  test(`uiterlijk ${file}`, async ({ page }) => {
    await page.goto(file);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${file.replace('.html', '')}.png`, {
      fullPage: true,
      // De vijver is willekeurig en bewegend; alleen de pagina eromheen vergelijken.
      mask: [page.locator('#pond')],
    });
  });
}
