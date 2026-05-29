import { test, expect } from '@playwright/test';

/**
 * Smoke tests des pages auth (connexion, inscription, mot de passe oublié).
 * Pas de Supabase configuré en preview → on vérifie juste le rendu et le
 * câblage des inputs/links, sans soumettre.
 */

test('Connexion : form correct + lien mot de passe oublié + lien créer compte', async ({ page }) => {
  await page.goto('/compte/connexion/');

  await expect(page.getByRole('heading', { name: /Bon retour/i })).toBeVisible();
  await expect(page.locator('#email')).toHaveAttribute('type', 'email');
  await expect(page.locator('#email')).toHaveAttribute('autocomplete', 'email');
  await expect(page.locator('#password')).toHaveAttribute('type', 'password');
  await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'current-password');

  // Liens auxiliaires
  await expect(page.getByRole('link', { name: /Mot de passe oublié/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Créer mon compte/i })).toBeVisible();
});

test('Inscription : 4 champs avec bons types', async ({ page }) => {
  await page.goto('/compte/inscription/');

  await expect(page.getByRole('heading', { name: /Créer mon compte/i })).toBeVisible();

  await expect(page.locator('#name')).toHaveAttribute('autocomplete', 'name');
  await expect(page.locator('#phone')).toHaveAttribute('type', 'tel');
  await expect(page.locator('#phone')).toHaveAttribute('autocomplete', 'tel');
  await expect(page.locator('#email')).toHaveAttribute('type', 'email');
  await expect(page.locator('#password')).toHaveAttribute('type', 'password');
  await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'new-password');
  await expect(page.locator('#password')).toHaveAttribute('minlength', '6');

  // Lien retour vers connexion
  await expect(page.getByRole('link', { name: 'Se connecter' })).toBeVisible();
});

test('Mot de passe oublié : email input + bouton Envoyer', async ({ page }) => {
  await page.goto('/compte/mot-de-passe-oublie/');

  await expect(page.getByRole('heading', { name: /Mot de passe oublié/i })).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Envoyer le lien/i })).toBeVisible();

  // Lien retour vers connexion
  await expect(page.getByRole('link', { name: 'Se connecter' })).toBeVisible();
});

test('Connexion → lien "Créer mon compte" navigue vers inscription', async ({ page }) => {
  await page.goto('/compte/connexion/');
  await page.getByRole('link', { name: /Créer mon compte/i }).click();
  await expect(page).toHaveURL(/\/compte\/inscription\/?$/);
});

test('Auth pages utilisent shell mobile-card (pas le dashboard sidebar)', async ({ page }) => {
  await page.goto('/compte/connexion/');
  // Le shell app rend une <body data-shell="app"> + .app card
  await expect(page.locator('body[data-shell="app"]')).toBeVisible();
  await expect(page.locator('.app')).toBeVisible();
  await expect(page.locator('.dash-sidebar')).toHaveCount(0);
});
