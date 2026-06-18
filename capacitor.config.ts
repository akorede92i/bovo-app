import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App WORKER Bovo — Android.
 * (Les utilisateurs iOS passent par l'app web app.bovo.bj — pas de build iOS.)
 *
 * v1 : shell natif qui charge la page worker LIVE (server.url → app.bovo.bj/worker/).
 *   - Affiche exactement la page /worker déjà déployée/testée (zéro asset cassé).
 *   - Notifications push natives (FCM) + icône + présence Play Store.
 *   - Mises à jour instantanées du contenu (corriger /worker = pas de re-soumission).
 *   - Nécessite le réseau (acceptable : les missions sont des données live).
 * v2 possible : bundler le site pour l'offline (webDir local + SW de routage des
 *   sous-routes, cf. native-router-sw.js) — à valider sur appareil.
 *
 * L'app CLIENT (bj.bovo.app) viendra en parallèle avec sa propre config/projet natif.
 */
const config: CapacitorConfig = {
  appId: 'bj.bovo.worker',
  appName: 'Bovo Pro',
  // webDir doit exister (fallback Capacitor) même avec server.url → `npm run build`.
  webDir: 'dist',
  server: {
    url: 'https://app.bovo.bj/worker/',
    // Navigation interne limitée au domaine Bovo ; tel:/geo:/wa.me s'ouvrent en natif.
    allowNavigation: ['app.bovo.bj'],
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
