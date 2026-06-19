import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Config Capacitor MULTI-APP (Android uniquement — les utilisateurs iOS passent
 * par l'app web app.bovo.bj).
 *
 * Deux apps natives distinctes générées depuis le MÊME codebase, choisies via la
 * variable d'environnement BOVO_APP :
 *
 *   BOVO_APP=worker  → « Bovo Pro »  (bj.bovo.worker) — ouvre /worker/  — projet android-worker/
 *   BOVO_APP=client  → « Bovo »      (bj.bovo.app)    — ouvre /         — projet android-client/
 *
 * (worker par défaut). Chaque app a son PROPRE dossier natif (android.path), donc
 * les deux coexistent sans se marcher dessus.
 *
 * Archi v1 : shell natif qui charge la page LIVE (server.url) → affiche exactement
 * le site déjà déployé/testé, push natif (FCM) + icône + Play Store, mises à jour
 * web instantanées (pas de re-soumission pour un changement de contenu). Nécessite
 * le réseau (acceptable : données live). v2 possible : bundle offline.
 */
const APP = process.env.BOVO_APP === 'client' ? 'client' : 'worker';

// nav = domaines autorisés en navigation TOP-LEVEL dans le webview (le reste s'ouvre
// en externe/natif). Le client inclut Kkiapay : si le tunnel d'acompte fait une
// navigation top-level vers le widget/paiement, elle doit rester DANS l'app — sinon
// le callback onSuccess ne revient pas et l'acompte n'est jamais confirmé. Le worker
// n'a pas de paiement → domaine Bovo seul.
const APPS = {
  worker: { appId: 'bj.bovo.worker', appName: 'Bovo Pro', start: 'https://app.bovo.bj/worker/', dir: 'android-worker', nav: ['app.bovo.bj'] },
  client: { appId: 'bj.bovo.app',    appName: 'Bovo',     start: 'https://app.bovo.bj/',       dir: 'android-client', nav: ['app.bovo.bj', 'kkiapay.me', '*.kkiapay.me'] },
} as const;

const A = APPS[APP];

const config: CapacitorConfig = {
  appId: A.appId,
  appName: A.appName,
  // webDir doit exister (fallback Capacitor) même avec server.url → `npm run build`.
  webDir: 'dist',
  // Dossier natif propre à chaque app → android-worker/ et android-client/ coexistent.
  android: { path: A.dir },
  server: {
    url: A.start,
    // Navigation top-level autorisée (cf. APPS[app].nav) ; tel:/geo:/wa.me + le reste
    // s'ouvrent en natif/externe.
    allowNavigation: [...A.nav],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#4470B3',
      showSpinner: false,
    },
  },
};

export default config;
