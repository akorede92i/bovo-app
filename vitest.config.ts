import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@lib': path.resolve(__dirname, './src/lib'),
      '@components': path.resolve(__dirname, './src/components'),
      '@layouts': path.resolve(__dirname, './src/layouts'),
      '@styles': path.resolve(__dirname, './src/styles'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
    // sessionStorage est dispo via jsdom, mais on le reset entre tests
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/supabase.ts', 'src/lib/auth.ts'], // dépendent d'env vars Supabase, non testables sans mock complet
    },
  },
});
