import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests Bovo : on lance le serveur Astro preview puis on visite les
 * parcours critiques. CI lance ça AVANT le déploiement, donc un test rouge
 * bloque le push prod.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['line']] : [['list']],

  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Pas de Supabase/Kkiapay en preview — on évite les flows authentifiés
  },

  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-pixel',
      use: { ...devices['Pixel 7'] }, // Android Chrome 412x915 + UA Android
    },
  ],

  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
