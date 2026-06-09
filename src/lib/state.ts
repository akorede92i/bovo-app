/**
 * State partagé pour les tunnels (stocké dans sessionStorage).
 * Survit aux changements de page (navigation Astro classique), perdu à la fermeture du tab.
 */

export type ServiceKey = 'menage' | 'airbnb' | 'demenagement' | 'chef' | 'plombier';

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
  lat?: number;
  lng?: number;
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
  lat?: number;
  lng?: number;
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

export interface PlombierState {
  type?: string;          // urgence | reparation | installation | debouchage
  description?: string;   // texte libre — précisions sur le problème
  options?: string[];
  date?: string;
  slot?: string;
  address?: AddressInfo;
  customer?: CustomerInfo;
  estimatedTotal?: number;
}

export type AnyState = MenageState | AirbnbState | DemenagementState | ChefState | PlombierState;

const KEY_PREFIX = 'bovo:tunnel:';

export function loadState<T extends AnyState>(service: ServiceKey): T {
  if (typeof window === 'undefined') return {} as T;
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + service);
    if (!raw) return {} as T;
    const parsed = JSON.parse(raw);
    // JSON valide mais pas un objet (ex: "null", "42", "[...]" via state corrompu /
    // payload réinjecté) → on repart d'un state vide plutôt que de crasher au 1er accès.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : ({} as T);
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

/**
 * Remplace intégralement le state d'un service (utilisé par la re-réservation
 * en 1 clic : on réinjecte le payload d'une résa passée dans le tunnel).
 */
export function replaceState<T extends AnyState>(service: ServiceKey, state: T): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(KEY_PREFIX + service, JSON.stringify(state));
  } catch {}
}
