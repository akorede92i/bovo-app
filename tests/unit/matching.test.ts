import { describe, it, expect } from 'vitest';
import { rankCandidates, type MatchInput } from '../../src/lib/matching';

// Lundi 1er juin 2026, 10:00 local (durée 120 min => 10:00-12:00, dow=1)
const START = new Date(2026, 5, 1, 10, 0, 0).getTime();

function baseInput(partial: Partial<MatchInput> = {}): MatchInput {
  return {
    reservation: { id: 'R1', service_type: 'menage', zone: 'Cotonou', startMs: START, durationMin: 120 },
    workers: [
      { id: 'w1', full_name: 'Awa' },
      { id: 'w2', full_name: 'Koffi' },
      { id: 'w3', full_name: 'Sans compétence' },
    ],
    skills: [
      { worker_id: 'w1', level: 5 },
      { worker_id: 'w2', level: 2 },
    ],
    zones: [],
    availability: [],
    blackouts: [],
    dayReservations: [],
    reviews: [],
    ...partial,
  };
}

describe('rankCandidates', () => {
  it('ne retient que les workers ayant la compétence', () => {
    const c = rankCandidates(baseInput());
    const ids = c.map((x) => x.worker_id);
    expect(ids).toContain('w1');
    expect(ids).toContain('w2');
    expect(ids).not.toContain('w3'); // pas dans skills => exclu
  });

  it('favorise le worker qui couvre la zone', () => {
    const c = rankCandidates(
      baseInput({
        skills: [
          { worker_id: 'w1', level: 2 },
          { worker_id: 'w2', level: 2 },
        ],
        zones: [{ worker_id: 'w1', zone: 'Cotonou' }, { worker_id: 'w2', zone: 'Porto-Novo' }],
      }),
    );
    expect(c[0].worker_id).toBe('w1'); // en zone => devant
    expect(c[0].reasons.join(' ')).toMatch(/Couvre Cotonou/);
    const w2 = c.find((x) => x.worker_id === 'w2')!;
    expect(w2.warnings.join(' ')).toMatch(/Hors zone/);
  });

  it('exclut un worker en congé (blackout chevauchant)', () => {
    const c = rankCandidates(
      baseInput({
        blackouts: [{ worker_id: 'w1', startMs: START - 3600_000, endMs: START + 3600_000 }],
      }),
    );
    expect(c.map((x) => x.worker_id)).not.toContain('w1');
    expect(c.map((x) => x.worker_id)).toContain('w2');
  });

  it('exclut un worker déjà pris sur un créneau qui chevauche', () => {
    const c = rankCandidates(
      baseInput({
        dayReservations: [{ worker_id: 'w1', startMs: START + 30 * 60_000, durationMin: 120 }],
      }),
    );
    expect(c.map((x) => x.worker_id)).not.toContain('w1');
  });

  it('compte la charge du jour sans exclure si pas de chevauchement', () => {
    const c = rankCandidates(
      baseInput({
        // résa le même jour mais l'après-midi (15:00) => pas de conflit, juste de la charge
        dayReservations: [{ worker_id: 'w1', startMs: new Date(2026, 5, 1, 15, 0, 0).getTime(), durationMin: 120 }],
      }),
    );
    const w1 = c.find((x) => x.worker_id === 'w1');
    expect(w1).toBeDefined();
    expect(w1!.warnings.join(' ')).toMatch(/1 résa déjà ce jour/);
  });

  it('valorise une bonne note moyenne et la disponibilité sur le créneau', () => {
    const c = rankCandidates(
      baseInput({
        skills: [
          { worker_id: 'w1', level: 2 },
          { worker_id: 'w2', level: 2 },
        ],
        availability: [
          { worker_id: 'w1', day_of_week: 1, startMin: 8 * 60, endMin: 18 * 60 }, // couvre 10-12
        ],
        reviews: [
          { worker_id: 'w1', rating: 5 },
          { worker_id: 'w1', rating: 5 },
        ],
      }),
    );
    expect(c[0].worker_id).toBe('w1');
    expect(c[0].reasons.join(' ')).toMatch(/Dispo sur le créneau/);
    expect(c[0].reasons.join(' ')).toMatch(/★ 5\.0/);
  });

  it('pénalise un créneau hors des horaires habituels', () => {
    const c = rankCandidates(
      baseInput({
        skills: [{ worker_id: 'w1', level: 3 }],
        availability: [
          { worker_id: 'w1', day_of_week: 1, startMin: 14 * 60, endMin: 18 * 60 }, // ne couvre pas 10-12
        ],
      }),
    );
    const w1 = c.find((x) => x.worker_id === 'w1')!;
    expect(w1.warnings.join(' ')).toMatch(/Hors de ses horaires/);
  });
});
