import { test, expect } from '@playwright/test';

/**
 * Vérifie le pilote View Transitions sur le tunnel ménage.
 *
 * Deux garanties, sans dépendre du CDN Leaflet (bloqué en sandbox CI offline) :
 *  1) la navigation avant est un SWAP client (pas de full reload) — on pose un
 *     marqueur sur window et on vérifie qu'il survit à la navigation ;
 *  2) le script de la page d'arrivée s'est RÉ-INITIALISÉ après le swap — on
 *     vérifie que l'interactivité (sélection d'option → CTA activé) fonctionne.
 *
 * Si l'un des deux cassait (window.location au lieu de navigate(), ou scripts
 * non re-bindés sur astro:page-load), ce test deviendrait rouge.
 */
test('View Transitions ménage : swaps client + ré-init des scripts', async ({ page }) => {
  await page.goto('/menage/');
  await expect(page.getByRole('heading', { name: /Quelle est la taille/i })).toBeVisible();

  // Marqueur effacé en cas de full reload, conservé en cas de swap client.
  await page.evaluate(() => ((window as any).__vtFlag = 'kept'));

  // Étape 1 → 2
  await page.locator('.opt[data-value="studio"]').click();
  await page.evaluate(() => (document.getElementById('cta-next') as HTMLButtonElement)?.click());
  await expect(page).toHaveURL(/\/menage\/duree\/?$/);
  expect(await page.evaluate(() => (window as any).__vtFlag)).toBe('kept'); // swap, pas reload

  // L'étape 2 est interactive => son script s'est ré-initialisé après le swap.
  await page.locator('.opt[data-value="ponctuel"]').click();
  await expect(page.locator('#cta-next')).toBeEnabled();

  // Étape 2 → 3
  await page.evaluate(() => (document.getElementById('cta-next') as HTMLButtonElement)?.click());
  await expect(page).toHaveURL(/\/menage\/options\/?$/);
  expect(await page.evaluate(() => (window as any).__vtFlag)).toBe('kept'); // toujours un swap

  // L'étape 3 est interactive (toggle d'option recalcule l'estimation).
  await page.locator('.opt').first().click();
  await expect(page.locator('.opt').first()).toHaveClass(/is-active/);
});

// Même garantie de swap client sur les autres tunnels migrés (1re étape).
for (const { tunnel, next } of [
  { tunnel: 'airbnb', next: 'logement' },
  { tunnel: 'chef', next: 'duree' },
]) {
  test(`View Transitions ${tunnel} : index → ${next} est un swap client`, async ({ page }) => {
    await page.goto(`/${tunnel}/`);
    await page.evaluate(() => ((window as any).__vtFlag = 'kept'));
    await page.locator('.opt').first().click();
    await page.evaluate(() => (document.getElementById('cta-next') as HTMLButtonElement)?.click());
    await expect(page).toHaveURL(new RegExp(`/${tunnel}/${next}/?$`));
    expect(await page.evaluate(() => (window as any).__vtFlag)).toBe('kept');
  });
}
