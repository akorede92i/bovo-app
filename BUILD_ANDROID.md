# Bovo Pro (app worker) — build & publication Android

App **worker** uniquement, **Android** uniquement. Les utilisateurs iOS passent par
l'app web `app.bovo.bj`. L'app client (`bj.bovo.app`) viendra séparément.

Architecture v1 : shell Capacitor qui charge la page worker **live**
(`server.url → https://app.bovo.bj/worker/`, cf. `capacitor.config.ts`). Donc :
corriger `/worker` côté web = mise à jour instantanée de l'app, **sans re-soumettre**.
La compilation se fait **sur ta machine** (pas d'Android SDK côté assistant).

---

## 0. Prérequis (ta machine)

- **Node 20+** (déjà là pour le web).
- **Android Studio** (gratuit, Windows/Mac/Linux) + **JDK 17** (inclus avec Android Studio).
- **Compte Google Play Console** (déjà ✓ — 25 $ une fois).
- Pour le **push** : un projet **Firebase** (gratuit) — voir §5.

> Important : le dossier `android/` local actuel vient de l'ancienne PR #6 et est
> réputé cassé. On le **régénère à neuf** (§2), ne pas réutiliser l'ancien.

---

## 1. Construire le web

```bash
cd app
npm ci
npm run build      # crée dist/ (requis par Capacitor même en mode server.url)
```

## 2. Générer le projet Android (à neuf)

```bash
# Supprimer l'ancien projet natif cassé s'il existe
rm -rf android

# Générer le projet Android propre à partir de capacitor.config.ts
npx cap add android

# Synchroniser web + plugins → projet natif
npx cap sync android
```

`cap add` lit `capacitor.config.ts` → appId **`bj.bovo.worker`**, nom **« Bovo Pro »**.

## 3. Icône & splash

Fournis une icône carrée (≥ 1024×1024) et un visuel de splash :

```
app/resources/icon.png      # 1024×1024 (logo Bovo sur fond plein)
app/resources/splash.png    # 2732×2732 (logo centré)
```

```bash
npx @capacitor/assets generate --android
npx cap sync android
```

## 4. Lancer / tester en debug

```bash
npx cap open android        # ouvre Android Studio
```

Dans Android Studio : brancher un téléphone (USB, mode développeur) ou lancer un
émulateur → ▶ Run. L'app ouvre `app.bovo.bj/worker/` → écran de connexion worker.

## 5. Notifications push (Firebase / FCM)

Le code push est **déjà prêt** (`src/lib/native.ts`, table `device_tokens`, Edge
Function `send-push`). Il reste à brancher Firebase :

1. **Créer le projet Firebase** : https://console.firebase.google.com → nouveau projet « Bovo ».
2. **Ajouter une app Android** : package name **`bj.bovo.worker`** → télécharger
   **`google-services.json`** → le poser dans **`android/app/google-services.json`**.
   (Le plugin `@capacitor-firebase/messaging` ajoute déjà la conf Gradle au `cap sync`.)
3. **Clé serveur (envoi)** : Firebase → Paramètres du projet → Comptes de service →
   « Générer une nouvelle clé privée » (JSON). Puis côté Supabase :
   ```bash
   cd app/supabase
   supabase secrets set FCM_SERVICE_ACCOUNT="$(cat chemin/vers/service-account.json)"
   supabase functions deploy send-push        # (si pas déjà déployée)
   ```
4. **Webhook DB** (déclenche le push à l'affectation/màj d'une résa) — Supabase Studio →
   Database → Webhooks → nouvelle hook sur `reservations` (UPDATE) → POST vers
   `https://<project-ref>.supabase.co/functions/v1/send-push` avec header
   `Authorization: Bearer <service_role_key>`.
5. Android 13+ : la permission `POST_NOTIFICATIONS` est demandée par `ensurePushRegistered()`
   après login (déjà câblé). Rien à faire de plus.

> Sans Firebase, l'app fonctionne **sans** notifications (les missions restent
> consultables ; pas d'alerte « nouvelle mission »).

## 6. Build de release signé (AAB pour le Play Store)

1. **Créer un keystore** (une fois, à conserver précieusement — sa perte empêche toute
   mise à jour future) :
   ```bash
   keytool -genkey -v -keystore bovo-pro.keystore -alias bovo-pro \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Android Studio → **Build → Generate Signed App Bundle / APK → Android App Bundle**
   → sélectionner le keystore → variante **release** → produit un `.aab`.

## 7. Publier sur Google Play

1. https://play.google.com/console → **Créer une application** « Bovo Pro ».
2. Commencer par la piste **Test interne** (validation rapide, testeurs par email).
3. Téléverser l'`.aab`, remplir : description, **icône 512×512**, captures d'écran,
   **politique de confidentialité** (URL requise), catégorie, coordonnées.
4. Renseigner la **Déclaration de sécurité des données** (l'app collecte nom/téléphone/
   localisation via les missions → à déclarer).
5. Soumettre → review Google (quelques heures à quelques jours).

---

## Mémo « qui fait quoi »

| Étape | Qui |
|---|---|
| Config Capacitor + ce guide | ✅ fait (assistant) |
| Code push (native.ts, send-push, device_tokens) | ✅ déjà en place |
| `cap add android` + build + signing | **toi** (Android Studio) |
| Projet Firebase + `google-services.json` + `FCM_SERVICE_ACCOUNT` | **toi** |
| Icône/splash sources + fiche Play (captures, politique conf.) | **toi** |
| Soumission Play Console | **toi** |

## Notes

- **Mises à jour** : comme l'app charge `/worker` live, la plupart des évolutions
  ne nécessitent **pas** de re-soumettre l'app (juste un déploiement web). On ne
  re-soumet que pour un changement natif (icône, plugins, permissions, push).
- **App client** (`bj.bovo.app`) : même démarche, config Capacitor séparée
  (`server.url → app.bovo.bj/`), projet natif distinct — à faire après le worker.
- **iOS** : non couvert (pas de Mac/compte Apple). Les workers iOS utilisent
  `app.bovo.bj/worker/` dans Safari (« Ajouter à l'écran d'accueil » possible).
