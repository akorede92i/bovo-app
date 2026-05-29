/**
 * Setup global pour Vitest.
 * On reset sessionStorage entre chaque test pour éviter les fuites d'état.
 */
import { afterEach } from 'vitest';

afterEach(() => {
  try { sessionStorage.clear(); } catch {}
});
