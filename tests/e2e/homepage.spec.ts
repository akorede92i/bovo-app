import { test, expect } from '@playwright/test';

/**
 * Smoke tests homepage Bovo.
 * Vérifie que la landing rend correctement sur desktop ET mobile, sans
 * console errors, avec les sections clés présentes.
 */

test.describe('Homepage', () => {
  test('loads with hero, services, footer (no console errors)', async ({ page }) => {
    const errors: string[] = [];
    const failedUrls: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('response', (res) => {
      if (res.status() >= 400) failedUrls.push(res.url());
    });

    await page.goto('/');

    // Hero présent
    await expect(page.getByRole('heading', { name: /Votre prestation/i })).toBeVisible();
    await expect(page.getByText(/Cotonou.*Calavi.*Porto-Novo/i)).toBeVisible();

    // Section services : 5 cards visibles dans la grille
    const cards = page.locator('.home-services .svc-card');
    await expect(cards).toHaveCount(5);
    await expect(cards.filter({ hasText: 'Ménage à domicile' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'Service Airbnb (hosts)' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'Déménagement' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'Chef à domicile' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'Plombier à domicile' })).toHaveCount(1);

    // Comment ça marche : 3 étapes
    await expect(page.getByRole('heading', { name: 'Comment ça marche' })).toBeVisible();

    // Footer présent avec mentions légales (scope au <footer>)
    await expect(page.locator('footer').getByText(/Vobodou Groupe SARL/i).first()).toBeVisible();

    // Aucune JS error (pageerror ou console.error custom). On tolère :
    //   - favicon/icon 404 (assets optionnels)
    //   - appels Supabase qui échouent quand l'env preview n'a pas les RLS rights
    //     ou un anon key invalide
    const knownTolerated = /favicon-\d+\.png|apple-touch-icon|icon-maskable-\d+\.png|supabase\.co/;
    const realFailed = failedUrls.filter((u) => !knownTolerated.test(u));
    expect(realFailed, `Unexpected 404s: ${realFailed.join(', ')}`).toEqual([]);

    // Filtrer les "Failed to load resource" génériques liés aux 404 connus
    const realErrors = errors.filter(
      (e) => !/Failed to load resource/i.test(e) && !/manifest|favicon|sw\.js|supabase/i.test(e),
    );
    expect(realErrors).toEqual([]);
  });

  test('CTA principal "Voir nos services" scrolle vers la grille', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Voir nos services/i }).click();
    await expect(page.locator('#services')).toBeInViewport();
  });

  test('Service cards naviguent vers leur tunnel', async ({ page }) => {
    await page.goto('/');

    await page.locator('.home-services .svc-card[href="/menage/"]').click();
    await expect(page).toHaveURL(/\/menage\/?$/);
    await expect(page.getByRole('heading', { name: /Quelle est la taille/i })).toBeVisible();
  });

  test('Lien WhatsApp Support pointe vers wa.me', async ({ page }) => {
    await page.goto('/');
    const waLink = page.locator('a[href^="https://wa.me/"]').first();
    await expect(waLink).toHaveAttribute('href', /wa\.me\/229019667/);
  });
});

test.describe('Homepage — mobile drawer', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 768, 'mobile only');

  test('Burger button opens drawer with nav links', async ({ page }) => {
    await page.goto('/');

    // Le burger est visible, la nav est cachée
    const burger = page.locator('#landing-burger');
    await expect(burger).toBeVisible();
    await expect(page.locator('.landing-nav')).not.toBeVisible();

    // Ouvre le drawer
    await burger.click();
    await expect(page.locator('.landing-nav a').first()).toBeVisible();

    // Les CTAs login + créer compte sont visibles dans le drawer (scoped au header)
    await expect(page.locator('.landing-cta .landing-login')).toBeVisible();
    await expect(page.locator('.landing-cta a.btn-primary')).toBeVisible();
  });
});

test.describe('Homepage — desktop nav', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'desktop only');

  test('Nav header visible sans burger', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.landing-nav')).toBeVisible();
    await expect(page.locator('#landing-burger')).not.toBeVisible();
    // 3 liens : Services, Comment ça marche, Support
    await expect(page.locator('.landing-nav a')).toHaveCount(3);
  });
});
