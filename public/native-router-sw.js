/**
 * Service worker de routage NATIF (Capacitor uniquement).
 *
 * Problème résolu : le serveur local de Capacitor sert les fichiers à leur
 * chemin exact mais ne résout PAS un chemin de dossier (`/menage/`) vers
 * `/menage/index.html` — il renvoie alors son fallback (l'index.html racine,
 * c.-à-d. la home). Or Astro génère un site multi-pages en `dossier/index.html`
 * et tous les liens/navigations pointent vers `/menage/`, `/airbnb/adresse/`…
 *
 * Ce SW intercepte toute requête de navigation (ou tout chemin « dossier »
 * sans extension) et va chercher l'`index.html` correspondant. Il couvre
 * aussi bien les clics sur les liens que les `window.location.href = '/x/'`
 * programmatiques des tunnels et les fetch du clientRouter (View Transitions).
 *
 * En contexte web (app.bovo.bj sur GitHub Pages) ce SW n'est PAS enregistré :
 * le serveur résout déjà les dossiers. C'est `sw.js` (cache PWA) qui sert là-bas.
 */

self.addEventListener('install', () => {
  // Prendre la main sans attendre la fermeture des anciens onglets.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Contrôler la page déjà ouverte (la home) dès l'activation.
  event.waitUntil(self.clients.claim());
});

function hasFileExtension(pathname) {
  const last = pathname.split('/').pop() || '';
  return /\.[a-zA-Z0-9]+$/.test(last);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // On ne touche qu'aux GET de notre propre origine (capacitor://localhost / https://localhost).
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return; // laisser passer Supabase, Google Fonts, Kkiapay…

  const path = url.pathname;
  const isNavigation = req.mode === 'navigate';
  const isDirectoryPath = path.endsWith('/');
  const looksLikeRoute = !hasFileExtension(path); // ex. "/menage", "/airbnb/adresse"

  // Si ce n'est ni une navigation ni un chemin de route, laisser le réseau gérer
  // (assets JS/CSS/images : ils ont une extension et un chemin exact qui résout).
  if (!isNavigation && !isDirectoryPath && !looksLikeRoute) return;

  // Construire le chemin vers l'index.html du dossier.
  let target = path;
  if (target.endsWith('/')) target += 'index.html';
  else if (looksLikeRoute) target += '/index.html';

  if (target === path) return; // rien à réécrire (déjà un fichier précis)

  const rewritten = url.origin + target + url.search;
  event.respondWith(
    fetch(rewritten, { headers: req.headers, credentials: req.credentials })
      .then((res) => (res && res.ok ? res : fetch(req)))
      .catch(() => fetch(req)),
  );
});
