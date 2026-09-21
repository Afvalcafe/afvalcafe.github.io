import { expect, test } from '@playwright/test';
import { pages } from './pages';

for (const file of pages) {
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
