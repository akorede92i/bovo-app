import { test, expect } from '@playwright/test';

/**
 * Parcours complet du tunnel ménage jusqu'au récap.
 * On s'arrête AVANT le bouton "Envoyer ma demande" qui déclenche WhatsApp
 * et Supabase insert — pas de side-effect en CI.
 */

test('Menage tunnel : Studio → Recap, MapPicker présent', async ({ page }) => {
  // === Étape 1 : Logement ===
  await page.goto('/menage/');
  await expect(page.getByRole('heading', { name: /Quelle est la taille/i })).toBeVisible();
  await page.locator('.opt[data-value="studio"]').click();
  // Sur mobile le marker Leaflet peut intercepter le pointer, on click via JS
  await page.evaluate(() => (document.getElementById('cta-next') as HTMLButtonElement)?.click());

  // === Étape 2 : Durée + fréquence ===
  await expect(page).toHaveURL(/\/menage\/duree\/?$/);
  await page.locator('.opt[data-value="ponctuel"]').click();
  // Sur mobile le marker Leaflet peut intercepter le pointer, on click via JS
  await page.evaluate(() => (document.getElementById('cta-next') as HTMLButtonElement)?.click());

  // === Étape 3 : Options (optionnel, on skip) ===
  await expect(page).toHaveURL(/\/menage\/options\/?$/);
  // Sur mobile le marker Leaflet peut intercepter le pointer, on click via JS
  await page.evaluate(() => (document.getElementById('cta-next') as HTMLButtonElement)?.click());

  // === Étape 4 : Adresse + MapPicker ===
  await expect(page).toHaveURL(/\/menage\/adresse\/?$/);
  await page.locator('#zone').selectOption('Cotonou');
  await page.locator('#street').fill('Test street 123');

  // MapPicker présent : container + bouton GPS + Leaflet chargé
  const mapContainer = page.locator('#map-container');
  await expect(mapContainer).toBeVisible();
  await expect(page.locator('#map-gps-btn')).toBeVisible();
  // Leaflet's .leaflet-container class apparaît une fois la map initialisée
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

  // Sur mobile le marker Leaflet peut intercepter le pointer, on click via JS
  await page.evaluate(() => (document.getElementById('cta-next') as HTMLButtonElement)?.click());

  // === Étape 5 : Créneau ===
  await expect(page).toHaveURL(/\/menage\/creneau\/?$/);
  // Choisir date demain
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  await page.locator('#date').fill(tomorrow);
  await page.locator('.opt').first().click(); // premier créneau dispo
  // Sur mobile le marker Leaflet peut intercepter le pointer, on click via JS
  await page.evaluate(() => (document.getElementById('cta-next') as HTMLButtonElement)?.click());

  // === Étape 6 : Contact ===
  await expect(page).toHaveURL(/\/menage\/contact\/?$/);
  await page.locator('#name').fill('Test Client');
  await page.locator('#phone').fill('+22901966777');
  await page.getByRole('button', { name: /Voir le récapitulatif/i }).click();

  // === Étape 7 : Récap ===
  await expect(page).toHaveURL(/\/menage\/recap\/?$/);
  await expect(page.getByRole('heading', { name: 'Récapitulatif' })).toBeVisible();

  // Le récap doit contenir les choix faits
  await expect(page.getByText('Studio')).toBeVisible();
  await expect(page.getByText('Ponctuel')).toBeVisible();
  await expect(page.getByText('Cotonou')).toBeVisible();
  await expect(page.getByText('Test Client')).toBeVisible();

  // Le CTA "Envoyer ma demande" est présent — mais on ne clique PAS
  await expect(page.getByRole('button', { name: /Envoyer ma demande/i })).toBeVisible();
});

test('Menage adresse : input phone est type=tel (clavier numérique Android)', async ({ page }) => {
  await page.goto('/menage/contact/');
  const phone = page.locator('#phone');
  await expect(phone).toHaveAttribute('type', 'tel');
  await expect(phone).toHaveAttribute('autocomplete', 'tel');
});

test('Menage stepper : 7 étapes visibles', async ({ page }) => {
  await page.goto('/menage/');
  const segments = page.locator('.stepper .stepper-seg, .stepper > *');
  // On a 7 étapes (logement, durée, options, adresse, créneau, contact, recap)
  await expect(segments).toHaveCount(7);
});
