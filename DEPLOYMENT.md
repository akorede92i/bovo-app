# Déploiement app.bovo.bj

Guide complet pour mettre en ligne la mobile web app Bovo sur le sous-domaine `app.bovo.bj`.

## Architecture

- **bovo.bj** → site vitrine HTML statique (repo existant `akorede92i/bovo-site`)
- **app.bovo.bj** → mobile web app Astro (nouveau repo dédié, ex. `akorede92i/bovo-app`)

Les deux vivent en parallèle. Le site vitrine reste tel quel et lie vers l'app pour les réservations.

## Étape 1 — Créer le repo GitHub dédié

```bash
cd /Users/affisssong/Documents/Claude/Projects/Bovo/app
git init
git add .
git commit -m "init: scaffold mobile web app"

# Créer un repo sur github.com, ex. akorede92i/bovo-app
git remote add origin git@github.com:akorede92i/bovo-app.git
git branch -M main
git push -u origin main
```

## Étape 2 — Configurer les secrets GitHub

Dans le repo GitHub : **Settings → Secrets and variables → Actions → New repository secret**

| Nom | Valeur |
|---|---|
| `PUBLIC_SUPABASE_URL` | https://xxx.supabase.co |
| `PUBLIC_SUPABASE_ANON_KEY` | clé anon Supabase |
| `PUBLIC_KKIAPAY_PUBLIC_KEY` | clé publique Kkiapay |

*Si vous voulez démarrer sans Supabase ni Kkiapay, laissez ces secrets vides — l'app fonctionne en mode "résa via WhatsApp uniquement".*

## Étape 3 — Activer GitHub Pages

**Settings → Pages**
- Source : **GitHub Actions** (pas "Deploy from branch")
- Custom domain : `app.bovo.bj`
- Cocher "Enforce HTTPS" (après propagation DNS)

À chaque push sur `main`, le workflow `.github/workflows/deploy.yml` build l'app et publie sur GitHub Pages.

## Étape 4 — Configurer le DNS Netim

Dans le panneau Netim de `bovo.bj`, ajouter un enregistrement DNS :

| Type | Sous-domaine | Valeur | TTL |
|---|---|---|---|
| `CNAME` | `app` | `akorede92i.github.io.` | 3600 |

⚠️ Important : la valeur doit pointer vers `<votre-username-github>.github.io.` (avec le point final), pas vers `bovo-app.github.io`. C'est l'organisation / username qui compte, pas le nom du repo.

Si GitHub Pages refuse le CNAME, vérifier dans le repo bovo-app : `Settings → Pages → Custom domain → app.bovo.bj → Save`. GitHub crée alors un fichier `CNAME` dans la branche `gh-pages` (déjà fait par notre workflow).

## Étape 5 — Vérifier HTTPS Let's Encrypt

Une fois le DNS propagé (10-60 minutes), GitHub provisionne automatiquement un certificat Let's Encrypt. Vérifier sur https://app.bovo.bj :
- 🔒 cadenas vert dans le navigateur
- Test : https://www.ssllabs.com/ssltest/analyze.html?d=app.bovo.bj

Si le certificat n'est pas généré sous 24h, revenir dans **Settings → Pages → Remove custom domain → re-saisir → Save**.

## Étape 6 — Tester l'app

**Sur mobile** (priorité) :
1. Ouvrir https://app.bovo.bj sur Chrome Android
2. Vérifier que le menu Chrome propose "Ajouter à l'écran d'accueil" (PWA)
3. Faire un test bout-en-bout : Ménage → tunnel complet → soumission WhatsApp
4. Vérifier que le message WhatsApp pré-rempli arrive bien

**Lighthouse** (DevTools mobile) :
- Performance ≥ 90
- Accessibility ≥ 95
- Best Practices ≥ 95
- SEO ≥ 95
- PWA : tous les checks verts

## Étape 7 — Lier l'app depuis bovo.bj

Dans le site vitrine `bovo.bj`, remplacer les CTA "WhatsApp" par des CTA "Réserver en ligne" qui pointent vers `https://app.bovo.bj/<service>/`.

Exemple pour le bouton hero :
```html
<a href="https://app.bovo.bj/" class="btn-primary">Réserver en ligne</a>
<a href="https://wa.me/2290196677743" class="btn-secondary">WhatsApp</a>
```

## Maintenance

- Push sur `main` → déploiement auto en ~2 min
- Pour ajouter un nouveau service : créer un dossier dans `src/pages/<service>/` et lier depuis la home
- Pour modifier les tarifs : éditer `src/lib/catalog.ts`
- Pour suivre les résa : Supabase Studio → Table Editor → reservations
- Logs Edge Function : Supabase Studio → Edge Functions → notify-whatsapp → Logs

## Rollback

Si un déploiement casse l'app :

```bash
git revert HEAD
git push
```

Ou re-déployer une version antérieure depuis l'onglet Actions → workflow run → "Re-run all jobs".
