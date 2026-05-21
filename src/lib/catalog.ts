/**
 * Catalogue Bovo — services, options, zones, tarifs placeholders.
 * Les prix sont à caler avec Affiss après v1 (cf. memory project_bovo_webapp).
 */

export const ZONES = [
  'Cotonou',
  'Calavi',
  'Cocotomey',
  'Akpakpa',
  'Cadjèhoun',
  'Porto-Novo',
] as const;
export type Zone = (typeof ZONES)[number];

export const QUARTIERS_COTONOU = [
  'Haie Vive',
  'Cadjèhoun',
  'Fidjrosse',
  'Patte d\'Oie',
  'Akpakpa',
  'Ganhi',
  'Agla',
  'Vedoko',
  'Zogbo',
  'Sainte-Rita',
  'Aïbatin',
  'Gbégamey',
  'Godomey',
] as const;

// ============================================
// MÉNAGE PARTICULIER
// ============================================
export const MENAGE_HOURLY_XOF = 3500; // placeholder — à confirmer
export const MENAGE_MIN_HOURS = 2;
export const MENAGE_MAX_HOURS = 8;

export const MENAGE_FREQUENCES = [
  { id: 'ponctuel',   label: 'Ponctuel',        meta: 'Une seule intervention',           discount: 0 },
  { id: 'bimensuel',  label: 'Bimensuel',       meta: '2 passages par mois',              discount: 0.05 },
  { id: 'hebdo',      label: 'Hebdomadaire',    meta: '1 passage par semaine',            discount: 0.10 },
  { id: 'bihebdo',    label: '2× par semaine',  meta: '2 passages par semaine',           discount: 0.15 },
] as const;
export type MenageFrequence = (typeof MENAGE_FREQUENCES)[number]['id'];

export const MENAGE_LOGEMENTS = [
  { id: 'studio',  label: 'Studio',          meta: '≤ 35 m²',     baseHours: 2 },
  { id: 'f2',      label: 'F2 / 2 pièces',   meta: '35-55 m²',    baseHours: 2 },
  { id: 'f3',      label: 'F3 / 3 pièces',   meta: '55-80 m²',    baseHours: 3 },
  { id: 'f4',      label: 'F4 / 4 pièces',   meta: '80-110 m²',   baseHours: 4 },
  { id: 'villa',   label: 'Villa / Duplex',  meta: '> 110 m²',    baseHours: 5 },
] as const;

export const MENAGE_OPTIONS = [
  { id: 'repassage',   label: 'Repassage',         meta: 'Chemises, vêtements, draps',      priceXof: 2000 },
  { id: 'vitres',      label: 'Nettoyage vitres',  meta: 'Intérieur + extérieur accessible', priceXof: 3000 },
  { id: 'four',        label: 'Four & électroménager', meta: 'Dégraissage complet',          priceXof: 2500 },
  { id: 'fin-bail',    label: 'Ménage fin de bail',meta: 'Remise en état complète',         priceXof: 8000 },
  { id: 'produits',    label: 'Bovo fournit les produits', meta: 'Sinon vous nous les fournissez', priceXof: 1500 },
] as const;
export type MenageOptionId = (typeof MENAGE_OPTIONS)[number]['id'];

// ============================================
// AIRBNB (turnover hosts)
// ============================================
export const AIRBNB_TURNOVERS = [
  { id: 'studio',     label: 'Studio',             meta: '1-2 voyageurs',   priceXof: 8000,  durationMin: 90 },
  { id: 'f2',         label: 'F2 / 1 chambre',     meta: '2-3 voyageurs',   priceXof: 12000, durationMin: 120 },
  { id: 'f3',         label: 'F3 / 2 chambres',    meta: '3-5 voyageurs',   priceXof: 16000, durationMin: 150 },
  { id: 'f4',         label: 'F4 / 3 chambres',    meta: '5-7 voyageurs',   priceXof: 22000, durationMin: 180 },
  { id: 'villa',      label: 'Villa / 4+ chambres',meta: '7+ voyageurs',    priceXof: 32000, durationMin: 240 },
] as const;

export const AIRBNB_OPTIONS = [
  { id: 'linge',       label: 'Gestion du linge',    meta: 'Draps + serviettes lavés et repassés', priceXof: 5000 },
  { id: 'restock',     label: 'Restock fournitures', meta: 'Savon, papier, café, eau',             priceXof: 4000 },
  { id: 'photos',      label: 'Contrôle photo qualité', meta: 'Photos envoyées après chaque turnover', priceXof: 1000 },
  { id: 'cles',        label: 'Gestion remise des clés', meta: 'Check-in / check-out voyageurs',   priceXof: 5000 },
] as const;

// ============================================
// DÉMÉNAGEMENT
// ============================================
export const DEM_VOLUMES = [
  { id: 'studio',  label: 'Studio',       meta: '~5-8 m³',     priceXof: 65000 },
  { id: 'f2',      label: 'F2',           meta: '~10-15 m³',   priceXof: 95000 },
  { id: 'f3',      label: 'F3',           meta: '~18-25 m³',   priceXof: 145000 },
  { id: 'f4',      label: 'F4',           meta: '~25-35 m³',   priceXof: 195000 },
  { id: 'villa',   label: 'Villa',        meta: '> 35 m³',     priceXof: 285000 },
] as const;

export const DEM_OPTIONS = [
  { id: 'cartons',     label: 'Fourniture des cartons', meta: '20 cartons + scotch', priceXof: 12000 },
  { id: 'emballage',   label: 'Emballage par nos équipes', meta: 'On emballe tout',  priceXof: 25000 },
  { id: 'demontage',   label: 'Démontage + remontage meubles', meta: 'Lit, armoire, table', priceXof: 18000 },
  { id: 'fragile',     label: 'Transport objets fragiles', meta: 'Piano, coffre, oeuvres',  priceXof: 15000 },
  { id: 'gardemeuble', label: 'Garde-meuble (1 mois)',  meta: 'Stockage sécurisé',         priceXof: 35000 },
] as const;

export const DEM_ETAGE_SUPP_XOF = 5000; // par étage sans ascenseur

// ============================================
// CHEF À DOMICILE
// ============================================
export const CHEF_DUREES = [
  { id: '1m',  label: '1 mois',   meta: 'Engagement minimum',  multiplier: 1.00 },
  { id: '3m',  label: '3 mois',   meta: 'Tarif préférentiel',  multiplier: 0.95 },
  { id: '6m',  label: '6 mois',   meta: '-10%',                multiplier: 0.90 },
  { id: '12m', label: '12 mois',  meta: '-15%',                multiplier: 0.85 },
] as const;

export const CHEF_FREQUENCES = [
  { id: '5',   label: '5 repas / semaine',  meta: 'Lundi au vendredi',     baseXof: 120000 },
  { id: '7',   label: '7 repas / semaine',  meta: 'Tous les jours',        baseXof: 160000 },
  { id: '14',  label: '14 repas / semaine', meta: 'Déjeuner + dîner 7j/7', baseXof: 280000 },
] as const;

export const CHEF_CUISINES = [
  { id: 'beninoise',     label: 'Cuisine béninoise',        meta: 'Plats locaux, sauces traditionnelles' },
  { id: 'internationale',label: 'Cuisine internationale',   meta: 'Européenne, asiatique, libanaise…' },
  { id: 'mixte',         label: 'Cuisine mixte',            meta: 'Le meilleur des deux mondes' },
  { id: 'healthy',       label: 'Healthy / fitness',        meta: 'Repas équilibrés, calories maîtrisées' },
] as const;

// ============================================
// UTIL — FORMATAGE FCFA
// ============================================
export function fcfa(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { useGrouping: true }).format(amount) + ' FCFA';
}
