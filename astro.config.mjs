import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://app.bovo.bj',
  // L'app (tunnels, /admin, /compte) est en noindex ; seule la home a vocation à
  // être indexée. On évite ainsi de publier la surface admin dans le sitemap.
  integrations: [sitemap({ filter: (page) => page === 'https://app.bovo.bj/' })],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    ssr: {
      noExternal: ['@supabase/supabase-js'],
    },
  },
});
