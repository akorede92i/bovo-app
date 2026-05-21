/**
 * State partagé pour les tunnels (stocké dans sessionStorage).
 * Survit aux changements de page (navigation Astro classique), perdu à la fermeture du tab.
 */

export type ServiceKey = 'menage' | 'airbnb' | 'demenagement' | 'chef';

export interface CustomerInfo {
  fullName?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface AddressInfo {
  zone?: string;
  quartier?: string;
  street?: string;
  building?: string;
  saveToProfile?: boolean;
}

export interface MenageState {
  logement?: string;
  hours?: number;
  frequence?: string;
  options?: string[];
  date?: string;
  slot?: string;
  address?: AddressInfo;
  customer?: CustomerInfo;
  estimatedTotal?: number;
}

export interface AirbnbAccessInfo {
  mode?: 'cles-boite' | 'code' | 'gardien' | 'rdv';
  details?: string;
}

export interface AirbnbState {
  propertyCount?: number;
  size?: string;
  mode?: 'ponctuel' | 'recurrent';
  options?: string[];
  address?: AddressInfo;
  access?: AirbnbAccessInfo;
  ponctuelDate?: string;
  ponctuelSlot?: string;
  icalUrl?: string;
  startDate?: string;
  durationMonths?: number;
  customer?: CustomerInfo;
  estimatedPerTurnover?: number;
}

export interface DemenagementAddress {
  zone?: string;
  quartier?: string;
  street?: string;
  floor?: number;
  elevator?: boolean;
  parking?: string; // accès camion
}

export interface DemenagementState {
  volume?: string;
  options?: string[];
  from?: DemenagementAddress;
  to?: DemenagementAddress;
  date?: string;
  slot?: string;
  customer?: CustomerInfo;
  estimatedTotal?: number;
  wantsDeposit?: boolean;
}

export interface ChefState {
  frequence?: string; // 5 | 7 | 14
  duree?: string;     // 1m | 3m | 6m | 12m
  cuisines?: string[];
  people?: number;
  diet?: string;
  startDate?: string;
  address?: AddressInfo;
  customer?: CustomerInfo;
  estimatedTotalMonthly?: number;
  wantsDeposit?: boolean;
}

export type AnyState = MenageState | AirbnbState | DemenagementState | ChefState;

const KEY_PREFIX = 'bovo:tunnel:';

export function loadState<T extends AnyState>(service: ServiceKey): T {
  if (typeof window === 'undefined') return {} as T;
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + service);
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

export function saveState<T extends AnyState>(service: ServiceKey, patch: Partial<T>): T {
  if (typeof window === 'undefined') return {} as T;
  const current = loadState<T>(service);
  const next = { ...current, ...patch } as T;
  try {
    sessionStorage.setItem(KEY_PREFIX + service, JSON.stringify(next));
  } catch {}
  return next;
}

export function clearState(service: ServiceKey): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY_PREFIX + service);
  } catch {}
}
