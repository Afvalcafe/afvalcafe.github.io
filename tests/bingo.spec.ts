import { expect, test } from '@playwright/test';

test.describe('bingo', () => {
  test('doorstrepen blijft bewaard en een rij geeft confetti', async ({ page }) => {
    await page.goto('bingo.html');
    const vakjes = page.locator('.vakje');
    await expect(vakjes).toHaveCount(25);

    for (let i = 0; i < 4; i++) await vakjes.nth(i).click();
    await expect(page.locator('.confetti')).toHaveCount(0);
    await vakjes.nth(4).click();
    await expect(page.locator('#melding')).toHaveText('Bingo!');
    await expect(page.locator('.confetti').first()).toBeAttached();

    await page.reload();
    await expect(page.locator('.vakje[aria-pressed="true"]')).toHaveCount(5);
    await expect(page.locator('#melding')).toHaveText('');

    page.once('dialog', (d) => d.accept());
    await page.locator('#reset').click();
    await expect(page.locator('.vakje[aria-pressed="true"]')).toHaveCount(0);
  });

  test('diagonaal telt ook', async ({ page }) => {
    await page.goto('bingo.html');
    for (const n of [0, 6, 12, 18, 24]) await page.locator('.vakje').nth(n).click();
    await expect(page.locator('#melding')).toHaveText('Bingo!');
  });
});
