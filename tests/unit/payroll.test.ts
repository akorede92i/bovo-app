import { describe, it, expect } from 'vitest';
import { computePayout } from '../../src/lib/payroll';

describe('computePayout (W6)', () => {
  it('forfait par mission (pay_type=mission)', () => {
    expect(computePayout(5000, 'mission', 120)).toBe(5000);
    expect(computePayout(5000, 'mission', null)).toBe(5000); // durée ignorée
  });

  it('forfait par mission si pay_type non précisé', () => {
    expect(computePayout(3000, null, 90)).toBe(3000);
    expect(computePayout(3000, undefined, 90)).toBe(3000);
  });

  it('tarif horaire × durée', () => {
    expect(computePayout(2000, 'horaire', 120)).toBe(4000); // 2h
    expect(computePayout(2000, 'horaire', 90)).toBe(3000);  // 1.5h
    expect(computePayout(1500, 'horaire', 60)).toBe(1500);  // 1h
  });

  it('arrondit à l’entier', () => {
    expect(computePayout(2000, 'horaire', 50)).toBe(1667); // 2000*50/60 = 1666.66…
  });

  it('tarif horaire sans durée → 0', () => {
    expect(computePayout(2000, 'horaire', null)).toBe(0);
    expect(computePayout(2000, 'horaire', 0)).toBe(0);
  });

  it('tarif non défini → null (tarif à définir)', () => {
    expect(computePayout(null, 'mission', 120)).toBeNull();
    expect(computePayout(undefined, 'horaire', 120)).toBeNull();
  });

  it('tarif négatif (incohérent) → null', () => {
    expect(computePayout(-100, 'mission', 120)).toBeNull();
  });

  it('tarif 0 → 0 (rien à payer, mais valide)', () => {
    expect(computePayout(0, 'mission', 120)).toBe(0);
    expect(computePayout(0, 'horaire', 120)).toBe(0);
  });

  it('tarif horaire avec durée négative (incohérente) → 0', () => {
    expect(computePayout(2000, 'horaire', -30)).toBe(0);
  });
});
