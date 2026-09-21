import { expect, test } from '@playwright/test';
import { pages } from './pages';

for (const file of pages) {
  test.describe(file, () => {
    test('laadt zonder fouten', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

      const res = await page.goto(file);
      expect(res?.ok()).toBe(true);
      await page.waitForLoadState('networkidle');
      expect(errors).toEqual([]);
    });

    test('geen horizontaal scrollen', async ({ page }) => {
      await page.goto(file);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('menu past binnen het scherm', async ({ page }) => {
      await page.goto(file);
      const vw = page.viewportSize()!.width;
      for (const link of await page.locator('.pond-menu a').all()) {
        await expect(link).toBeVisible();
        const box = (await link.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vw);
      }
    });
  });
}
