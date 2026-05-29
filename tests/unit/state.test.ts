/**
 * Tests unitaires du store sessionStorage des tunnels.
 * Couvre loadState / saveState / clearState pour tous les services.
 */
import { describe, it, expect } from 'vitest';
import {
  loadState,
  saveState,
  clearState,
  type MenageState,
  type AirbnbState,
  type DemenagementState,
  type ChefState,
  type PlombierState,
} from '@lib/state';

describe('state.ts — loadState', () => {
  it('returns empty object when sessionStorage is empty', () => {
    const s = loadState<MenageState>('menage');
    expect(s).toEqual({});
  });

  it('returns parsed state when data exists', () => {
    sessionStorage.setItem('bovo:tunnel:menage', JSON.stringify({ logement: 'studio', hours: 3 }));
    const s = loadState<MenageState>('menage');
    expect(s).toEqual({ logement: 'studio', hours: 3 });
  });

  it('returns empty object when sessionStorage contains invalid JSON', () => {
    sessionStorage.setItem('bovo:tunnel:menage', '{not valid json');
    const s = loadState<MenageState>('menage');
    expect(s).toEqual({});
  });

  it('isolates state by service key', () => {
    sessionStorage.setItem('bovo:tunnel:menage', JSON.stringify({ logement: 'studio' }));
    sessionStorage.setItem('bovo:tunnel:airbnb', JSON.stringify({ propertyCount: 2 }));

    expect(loadState<MenageState>('menage')).toEqual({ logement: 'studio' });
    expect(loadState<AirbnbState>('airbnb')).toEqual({ propertyCount: 2 });
    expect(loadState<ChefState>('chef')).toEqual({});
  });
});

describe('state.ts — saveState', () => {
  it('writes the patch when nothing exists yet', () => {
    const result = saveState<MenageState>('menage', { logement: 'f2', hours: 2 });

    expect(result).toEqual({ logement: 'f2', hours: 2 });
    expect(JSON.parse(sessionStorage.getItem('bovo:tunnel:menage')!)).toEqual({
      logement: 'f2',
      hours: 2,
    });
  });

  it('merges patch with existing state (shallow merge)', () => {
    saveState<MenageState>('menage', { logement: 'studio', hours: 2 });
    const result = saveState<MenageState>('menage', { hours: 3, frequence: 'hebdo' });

    // hours est overridé, logement préservé, frequence ajouté
    expect(result).toEqual({ logement: 'studio', hours: 3, frequence: 'hebdo' });
  });

  it('overwrites array values entirely (not deep merged)', () => {
    saveState<MenageState>('menage', { options: ['repassage', 'vitres'] });
    const result = saveState<MenageState>('menage', { options: ['four'] });

    expect(result.options).toEqual(['four']);
  });

  it('preserves nested objects when not in patch', () => {
    saveState<MenageState>('menage', {
      address: { zone: 'Cotonou', street: 'Haie Vive', lat: 6.37, lng: 2.39 },
    });
    saveState<MenageState>('menage', { hours: 2 });

    const s = loadState<MenageState>('menage');
    expect(s.address?.lat).toBe(6.37);
    expect(s.address?.street).toBe('Haie Vive');
    expect(s.hours).toBe(2);
  });

  it('persists lat/lng coordinates from MapPicker', () => {
    saveState<MenageState>('menage', {
      address: { zone: 'Cotonou', street: 'Rue 123', lat: 6.3703, lng: 2.3912 },
    });
    const s = loadState<MenageState>('menage');
    expect(s.address?.lat).toBe(6.3703);
    expect(s.address?.lng).toBe(2.3912);
  });
});

describe('state.ts — clearState', () => {
  it('removes only the given service key', () => {
    saveState<MenageState>('menage', { logement: 'studio' });
    saveState<AirbnbState>('airbnb', { propertyCount: 1 });

    clearState('menage');

    expect(loadState<MenageState>('menage')).toEqual({});
    expect(loadState<AirbnbState>('airbnb')).toEqual({ propertyCount: 1 });
  });

  it('is idempotent when nothing exists', () => {
    expect(() => clearState('demenagement')).not.toThrow();
  });
});

describe('state.ts — all 5 services', () => {
  it('handles menage state', () => {
    const s: MenageState = { logement: 'studio', hours: 2, frequence: 'ponctuel' };
    saveState<MenageState>('menage', s);
    expect(loadState<MenageState>('menage')).toEqual(s);
  });

  it('handles airbnb state', () => {
    const s: AirbnbState = { propertyCount: 1, size: 'f2', mode: 'recurrent' };
    saveState<AirbnbState>('airbnb', s);
    expect(loadState<AirbnbState>('airbnb')).toEqual(s);
  });

  it('handles demenagement state with from/to addresses', () => {
    const s: DemenagementState = {
      volume: 'f2',
      from: { zone: 'Cotonou', floor: 0, lat: 6.37 },
      to: { zone: 'Calavi', floor: 2, lat: 6.42 },
    };
    saveState<DemenagementState>('demenagement', s);
    const loaded = loadState<DemenagementState>('demenagement');
    expect(loaded.from?.zone).toBe('Cotonou');
    expect(loaded.to?.floor).toBe(2);
  });

  it('handles chef state', () => {
    const s: ChefState = { frequence: '5', duree: '3m', cuisines: ['beninoise'] };
    saveState<ChefState>('chef', s);
    expect(loadState<ChefState>('chef')).toEqual(s);
  });

  it('handles plombier state', () => {
    const s: PlombierState = { type: 'urgence', description: 'Fuite WC' };
    saveState<PlombierState>('plombier', s);
    expect(loadState<PlombierState>('plombier')).toEqual(s);
  });
});
