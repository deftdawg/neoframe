import { test, expect } from '@playwright/test';

test('basic test', async ({ page }) => {
  await page.goto('http://localhost:3000/neoframe.html');
  await page.getByLabel('Enable QR Code').check();
  await expect(page.locator('canvas#qr-code-canvas')).toBeVisible();
  await page.screenshot({ path: 'jules-scratch/verification/verification.png' });
});