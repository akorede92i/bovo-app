# Bovo — Mobile Web App (app.bovo.bj)

App de réservation Wecasa-like pour Bovo. Le site vitrine `bovo.bj` reste en l'état, cette app vit sur le sous-domaine `app.bovo.bj`.

## Stack

- **Astro 4** — frontend statique, build vers `dist/`
- **Supabase** — auth (email + password) + Postgres (comptes clients, adresses, réservations, workers, planning Airbnb)
- **Kkiapay** — passerelle Mobile Money / carte pour les acomptes optionnels
- **PWA** — installable sur l'écran d'accueil Android, fonctionne hors-ligne (cache statique)
- **GitHub Pages** — hébergement gratuit, HTTPS Let's Encrypt auto

## Démarrage local

```bash
cd app
npm install
cp .env.example .env
# Remplir PUBLIC_SUPABASE_URL et PUBLIC_SUPABASE_ANON_KEY (sinon mode WhatsApp uniquement)
npm run dev
```

Ouvrir http://localhost:4321 sur ton mobile (ou DevTools mode mobile).

## Mise en production

Voir **[DEPLOYMENT.md](./DEPLOYMENT.md)** pour la marche à suivre complète :
1. Créer le repo GitHub dédié
2. Configurer les secrets (Supabase, Kkiapay)
3. Activer GitHub Pages avec custom domain app.bovo.bj
4. Configurer le DNS Netim (CNAME)
5. Tester sur mobile + Lighthouse

## Structure du projet

```
app/
├── src/
│   ├── layouts/
│   │   └── Layout.astro                  ← layout mobile-first + PWA
│   ├── components/
│   │   ├── Icon.astro                    ← 23 icônes SVG inline
│   │   ├── ServiceCard.astro             ← card service home
│   │   ├── Stepper.astro                 ← barre progression tunnel
│   │   └── CtaFooter.astro               ← bouton sticky bas tunnel
│   ├── pages/
│   │   ├── index.astro                   ← home : 4 services
│   │   ├── menage/                       ← TUNNEL COMPLET ✅
│   │   │   ├── index.astro               ← Étape 1 : taille logement
│   │   │   ├── duree.astro               ← Étape 2 : durée + fréquence
│   │   │   ├── options.astro             ← Étape 3 : options
│   │   │   ├── adresse.astro             ← Étape 4 : adresse
│   │   │   ├── creneau.astro             ← Étape 5 : date + créneau
│   │   │   ├── contact.astro             ← Étape 6 : coordonnées
│   │   │   └── recap.astro               ← Étape 7 : récap + soumission
│   │   ├── airbnb/                       ← TUNNEL COMPLET ✅
│   │   │   ├── index.astro               ← onboarding host (1 / 2-3 / 4+)
│   │   │   ├── logement.astro            ← taille + forfait
│   │   │   ├── mode.astro                ← ponctuel vs récurrent iCal
│   │   │   ├── options.astro             ← linge, restock, photos, clés
│   │   │   ├── adresse.astro             ← adresse + mode d'accès
│   │   │   ├── planning.astro            ← date OU iCal + engagement
│   │   │   ├── contact.astro             ← coordonnées host
│   │   │   └── recap.astro               ← récap + soumission
│   │   ├── demenagement/                 ← TUNNEL COMPLET ✅
│   │   │   ├── index.astro               ← volume (studio → villa)
│   │   │   ├── depart.astro              ← adresse départ + étage + ascenseur
│   │   │   ├── arrivee.astro             ← adresse arrivée + étage + ascenseur
│   │   │   ├── options.astro             ← cartons, emballage, démontage…
│   │   │   ├── date.astro                ← date + créneau démarrage
│   │   │   ├── contact.astro             ← coordonnées + opt acompte Kkiapay
│   │   │   └── recap.astro               ← récap + Kkiapay + soumission
│   │   ├── chef/                         ← TUNNEL COMPLET ✅
│   │   │   ├── index.astro               ← 5 / 7 / 14 repas par semaine
│   │   │   ├── duree.astro               ← engagement 1/3/6/12 mois
│   │   │   ├── cuisine.astro             ← style (béninoise / inter / mixte / healthy)
│   │   │   ├── preferences.astro         ← nb personnes + allergies
│   │   │   ├── planning.astro            ← démarrage + adresse
│   │   │   ├── contact.astro             ← coordonnées + opt acompte Kkiapay
│   │   │   └── recap.astro               ← récap + Kkiapay + soumission
│   │   └── compte/
│   │       ├── connexion.astro           ← login Supabase ✅
│   │       └── inscription.astro         ← signup Supabase ✅
│   ├── lib/
│   │   ├── catalog.ts                    ← services, zones, tarifs (PLACEHOLDERS)
│   │   ├── state.ts                      ← state tunnel sessionStorage
│   │   ├── supabase.ts                   ← client + types DB
│   │   └── kkiapay.ts                    ← helper Kkiapay
│   └── styles/
│       └── global.css                    ← design system Bovo complet
├── public/
│   ├── manifest.webmanifest              ← PWA manifest
│   ├── sw.js                             ← service worker
│   ├── robots.txt
│   ├── favicon.svg, favicon-16/32.png    ← favicons
│   └── icons/
│       ├── icon-192.png, icon-512.png    ← icônes PWA standard
│       ├── icon-maskable-192/512.png     ← icônes maskable Android
│       └── apple-touch-icon.png          ← iOS
├── supabase/
│   ├── schema.sql                        ← schéma complet (avec workers pour phase 2)
│   └── functions/
│       ├── README.md                     ← guide setup Edge Functions
│       └── notify-whatsapp/
│           └── index.ts                  ← notif admin WhatsApp à chaque résa
├── .github/workflows/deploy.yml          ← GitHub Actions auto-deploy
├── DEPLOYMENT.md                         ← guide déploiement complet
├── astro.config.mjs
├── package.json
├── tsconfig.json
└── .env.example
```

## Tarifs (PLACEHOLDERS — à confirmer avec toi)

| Service | Tarif placeholder | Min |
|---|---|---|
| Ménage | 3 500 FCFA/h | 2h |
| Ménage hebdo | -10% | abonnement |
| Ménage bi-hebdo | -15% | abonnement |
| Airbnb turnover studio | 8 000 FCFA | par turnover |
| Airbnb turnover villa | 32 000 FCFA | par turnover |
| Déménagement studio | 65 000 FCFA | + 5 000 / étage sans ascenseur |
| Déménagement villa | 285 000 FCFA | + 5 000 / étage sans ascenseur |
| Chef 5 repas/sem | 120 000 FCFA / mois | min 1 mois |
| Chef 14 repas/sem | 280 000 FCFA / mois | min 1 mois |
| Chef 12 mois | -15% sur le mensuel | engagement annuel |

Modifier dans `src/lib/catalog.ts`.

## Ce qui reste pour la suite

- [ ] Pages `/compte/` : dashboard, mes adresses CRUD, historique réservations
- [ ] Page `/compte/host/` pour les hosts Airbnb (gestion de leurs logements + iCal)
- [ ] Wiring final Kkiapay : configurer la clé prod après tests sandbox
- [ ] Edge Function Supabase : déployer `notify-whatsapp` + créer le webhook DB
- [ ] Test bout-en-bout sur mobile Android réel
- [ ] **Phase 2** : back-office admin `/admin/` (CRUD workers, calendrier dispos, assignation auto, import iCal Airbnb, dashboard journalier)

## Architecture BDD

Le schéma SQL Supabase (`supabase/schema.sql`) est conçu pour supporter la phase 2 sans refactor :

- `profiles` avec `role` ('customer' | 'worker' | 'admin')
- `worker_skills`, `worker_zones`, `worker_availability`, `worker_blackouts`
- `airbnb_properties` avec `ical_url` + `airbnb_turnovers`
- `reservations.assigned_worker_id` pour relier la résa au worker
- RLS policies complètes (chaque user ne voit que ses données)

Quand on construira l'admin, il suffira d'ajouter les pages UI — la donnée est déjà bien modélisée.
