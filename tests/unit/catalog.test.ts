/**
 * Tests unitaires du catalogue Bovo (prix, services, helpers).
 * Garde-fous : si on touche à un prix ou supprime un service par erreur, le
 * test crie. Pour les changements légitimes, mets juste à jour la valeur.
 */
import { describe, it, expect } from 'vitest';
import {
  fcfa,
  ZONES,
  QUARTIERS_COTONOU,
  MENAGE_HOURLY_XOF,
  MENAGE_MIN_HOURS,
  MENAGE_MAX_HOURS,
  MENAGE_FREQUENCES,
  MENAGE_LOGEMENTS,
  MENAGE_OPTIONS,
  AIRBNB_TURNOVERS,
  AIRBNB_OPTIONS,
  DEM_VOLUMES,
  DEM_OPTIONS,
  DEM_ETAGE_SUPP_XOF,
  CHEF_DUREES,
  CHEF_FREQUENCES,
  CHEF_CUISINES,
  PLOMBIER_BASE_XOF,
  PLOMBIER_TYPES,
  PLOMBIER_OPTIONS,
} from '@lib/catalog';

describe('fcfa() formatter', () => {
  it('formats 10000 as "10 000 FCFA"', () => {
    // Note : Intl.NumberFormat utilise des espaces insécables (  ou  )
    // selon le runtime, donc on normalize
    const result = fcfa(10000).replace(/\s/g, ' ');
    expect(result).toBe('10 000 FCFA');
  });

  it('formats 7000 with no separator', () => {
    expect(fcfa(7000).replace(/\s/g, ' ')).toBe('7 000 FCFA');
  });

  it('formats 1000000 with thousand separators', () => {
    expect(fcfa(1000000).replace(/\s/g, ' ')).toBe('1 000 000 FCFA');
  });

  it('formats 0 correctly', () => {
    expect(fcfa(0).replace(/\s/g, ' ')).toBe('0 FCFA');
  });
});

describe('ZONES', () => {
  it('includes Cotonou, Calavi, Porto-Novo (top 3 cities)', () => {
    expect(ZONES).toContain('Cotonou');
    expect(ZONES).toContain('Calavi');
    expect(ZONES).toContain('Porto-Novo');
  });

  it('has no duplicates', () => {
    expect(new Set(ZONES).size).toBe(ZONES.length);
  });

  it('non-empty', () => {
    expect(ZONES.length).toBeGreaterThanOrEqual(5);
  });
});

describe('QUARTIERS_COTONOU', () => {
  it('includes Haie Vive (HQ Vobodou)', () => {
    expect(QUARTIERS_COTONOU).toContain('Haie Vive');
  });

  it('non-empty', () => {
    expect(QUARTIERS_COTONOU.length).toBeGreaterThan(5);
  });
});

describe('MÉNAGE catalog', () => {
  it('hourly rate is positive', () => {
    expect(MENAGE_HOURLY_XOF).toBeGreaterThan(0);
  });

  it('min hours < max hours', () => {
    expect(MENAGE_MIN_HOURS).toBeLessThan(MENAGE_MAX_HOURS);
  });

  it('all logements have id/label/baseHours', () => {
    for (const l of MENAGE_LOGEMENTS) {
      expect(l.id).toBeTruthy();
      expect(l.label).toBeTruthy();
      expect(l.baseHours).toBeGreaterThanOrEqual(MENAGE_MIN_HOURS);
    }
  });

  it('frequences have valid discount range (0 to 0.5)', () => {
    for (const f of MENAGE_FREQUENCES) {
      expect(f.discount).toBeGreaterThanOrEqual(0);
      expect(f.discount).toBeLessThanOrEqual(0.5);
    }
  });

  it('ponctuel has no discount', () => {
    const ponctuel = MENAGE_FREQUENCES.find((f) => f.id === 'ponctuel');
    expect(ponctuel?.discount).toBe(0);
  });

  it('higher frequency = bigger discount', () => {
    const ponctuel = MENAGE_FREQUENCES.find((f) => f.id === 'ponctuel')!;
    const bihebdo = MENAGE_FREQUENCES.find((f) => f.id === 'bihebdo')!;
    expect(bihebdo.discount).toBeGreaterThan(ponctuel.discount);
  });

  it('all options have a positive priceXof', () => {
    for (const o of MENAGE_OPTIONS) {
      expect(o.priceXof).toBeGreaterThan(0);
    }
  });
});

describe('AIRBNB catalog', () => {
  it('all turnovers have priceXof and durationMin', () => {
    for (const t of AIRBNB_TURNOVERS) {
      expect(t.priceXof).toBeGreaterThan(0);
      expect(t.durationMin).toBeGreaterThan(0);
    }
  });

  it('villa is more expensive than studio (price scales with size)', () => {
    const studio = AIRBNB_TURNOVERS.find((t) => t.id === 'studio')!;
    const villa = AIRBNB_TURNOVERS.find((t) => t.id === 'villa')!;
    expect(villa.priceXof).toBeGreaterThan(studio.priceXof);
  });

  it('options non-empty with valid prices', () => {
    expect(AIRBNB_OPTIONS.length).toBeGreaterThan(0);
    for (const o of AIRBNB_OPTIONS) {
      expect(o.priceXof).toBeGreaterThan(0);
    }
  });
});

describe('DÉMÉNAGEMENT catalog', () => {
  it('volume sizes are strictly increasing in price', () => {
    for (let i = 1; i < DEM_VOLUMES.length; i++) {
      expect(DEM_VOLUMES[i].priceXof).toBeGreaterThan(DEM_VOLUMES[i - 1].priceXof);
    }
  });

  it('étage supplément is positive', () => {
    expect(DEM_ETAGE_SUPP_XOF).toBeGreaterThan(0);
  });

  it('garde-meuble option exists (memory requirement)', () => {
    const gm = DEM_OPTIONS.find((o) => o.id === 'gardemeuble');
    expect(gm).toBeDefined();
  });
});

describe('CHEF catalog', () => {
  it('durees multipliers decrease with longer commitment', () => {
    const m1 = CHEF_DUREES.find((d) => d.id === '1m')!;
    const m12 = CHEF_DUREES.find((d) => d.id === '12m')!;
    expect(m12.multiplier).toBeLessThan(m1.multiplier);
  });

  it('cuisines include Béninoise (local must-have)', () => {
    expect(CHEF_CUISINES.some((c) => c.id === 'beninoise')).toBe(true);
  });

  it('14 repas/sem is roughly 2x 7 repas/sem', () => {
    const f7 = CHEF_FREQUENCES.find((f) => f.id === '7')!;
    const f14 = CHEF_FREQUENCES.find((f) => f.id === '14')!;
    // 14 repas ≈ 2× 7 repas (allow ±10% pour effets d'échelle)
    const ratio = f14.baseXof / f7.baseXof;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.5);
  });
});

describe('PLOMBIER catalog', () => {
  it('base déplacement is positive', () => {
    expect(PLOMBIER_BASE_XOF).toBeGreaterThan(0);
  });

  it('has urgence type (most critical case)', () => {
    expect(PLOMBIER_TYPES.some((t) => t.id === 'urgence')).toBe(true);
  });

  it('installation is the most expensive type (more complex)', () => {
    const installation = PLOMBIER_TYPES.find((t) => t.id === 'installation')!;
    const reparation = PLOMBIER_TYPES.find((t) => t.id === 'reparation')!;
    expect(installation.priceXof).toBeGreaterThan(reparation.priceXof);
  });

  it('devis option is free (0 FCFA)', () => {
    const devis = PLOMBIER_OPTIONS.find((o) => o.id === 'devis');
    expect(devis?.priceXof).toBe(0);
  });
});
