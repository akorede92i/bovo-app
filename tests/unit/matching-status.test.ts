import { describe, it, expect } from 'vitest';
import { rankCandidates, type MatchInput } from '../../src/lib/matching';

// Carte W3 : exclusion des workers suspended/archived du matching.
// Lundi 1er juin 2026, 10:00 local (dow=1), durée 120 min.
const START = new Date(2026, 5, 1, 10, 0, 0).getTime();

function baseInput(partial: Partial<MatchInput> = {}): MatchInput {
  return {
    reservation: { id: 'R1', service_type: 'menage', zone: 'Cotonou', startMs: START, durationMin: 120 },
    workers: [
      { id: 'w1', full_name: 'Awa' },
      { id: 'w2', full_name: 'Koffi' },
    ],
    skills: [
      { worker_id: 'w1', level: 5 },
      { worker_id: 'w2', level: 3 },
    ],
    zones: [],
    availability: [],
    blackouts: [],
    dayReservations: [],
    reviews: [],
    ...partial,
  };
}

describe('rankCandidates — exclusion par statut (W3)', () => {
  it('exclut un worker suspended', () => {
    const ids = rankCandidates(baseInput({ statuses: [{ worker_id: 'w1', status: 'suspended' }] })).map((c) => c.worker_id);
    expect(ids).not.toContain('w1');
    expect(ids).toContain('w2');
  });

  it('exclut un worker archived', () => {
    const ids = rankCandidates(baseInput({ statuses: [{ worker_id: 'w2', status: 'archived' }] })).map((c) => c.worker_id);
    expect(ids).toContain('w1');
    expect(ids).not.toContain('w2');
  });

  it('garde un worker active', () => {
    const ids = rankCandidates(baseInput({ statuses: [{ worker_id: 'w1', status: 'active' }] })).map((c) => c.worker_id);
    expect(ids).toContain('w1');
  });

  it('traite status null comme actif', () => {
    const ids = rankCandidates(baseInput({ statuses: [{ worker_id: 'w1', status: null }] })).map((c) => c.worker_id);
    expect(ids).toContain('w1');
  });

  it('traite un worker sans entrée de statut comme actif', () => {
    // w2 n'a aucune entrée dans statuses → éligible.
    const ids = rankCandidates(baseInput({ statuses: [{ worker_id: 'w1', status: 'active' }] })).map((c) => c.worker_id);
    expect(ids).toContain('w2');
  });

  it('sans champ statuses (rétro-compat), tous les workers compétents restent éligibles', () => {
    const ids = rankCandidates(baseInput()).map((c) => c.worker_id);
    expect(ids).toContain('w1');
    expect(ids).toContain('w2');
  });

  it('exclut suspended ET archived simultanément', () => {
    const ids = rankCandidates(baseInput({
      statuses: [
        { worker_id: 'w1', status: 'suspended' },
        { worker_id: 'w2', status: 'archived' },
      ],
    })).map((c) => c.worker_id);
    expect(ids).toHaveLength(0);
  });
});
