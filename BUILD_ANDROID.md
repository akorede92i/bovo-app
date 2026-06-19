# Bovo — apps Android (client + worker)

**Android uniquement.** Les utilisateurs iOS passent par l'app web `app.bovo.bj`.

Deux apps natives depuis le **même codebase**, distinguées par la variable `BOVO_APP`
(cf. `capacitor.config.ts`) :

| `BOVO_APP` | Nom | appId | Ouvre | Projet natif |
|---|---|---|---|---|
| `client` | **Bovo** | `bj.bovo.app` | `app.bovo.bj/` (réservation grand public) | `android-client/` |
| `worker` *(défaut)* | **Bovo Pro** | `bj.bovo.worker` | `app.bovo.bj/worker/` (espace intervenant) | `android-worker/` |

Archi v1 : shell Capacitor qui charge la page **live** (`server.url`) → affiche le site
déjà déployé/testé, push natif + icône + Play Store, **mises à jour web instantanées**
(corriger le site = pas besoin de re-soumettre l'app). La compilation se fait **sur ta
machine** (pas d'Android SDK côté assistant).

---

## 0. Prérequis (ta machine)
- **Node 20+**, **Android Studio** (+ JDK 17), **compte Google Play Console** (✓ — 25 $ une fois).
- Pour le **push** : un projet **Firebase** (gratuit) — voir §4.

> ⚠️ Variable `BOVO_APP` selon l'OS :
> - macOS / Linux : `BOVO_APP=client npx cap …`
> - Windows PowerShell : `$env:BOVO_APP="client"; npx cap …`
> - Windows cmd : `set BOVO_APP=client && npx cap …`
> Sans la variable → **worker** par défaut.

---

## 1. Construire le web (commun aux 2 apps)
```bash
cd app
npm ci
npm run build      # crée dist/ (requis par Capacitor même en server.url)
```

## 2. Générer le projet natif (à neuf, pour CHAQUE app)
> Ne pas réutiliser l'ancien dossier `android/` (PR #6, cassé). Chaque app a son propre
> dossier (`android-worker/` ou `android-client/`) grâce à `android.path`.

**App CLIENT :**
```bash
BOVO_APP=client npx cap add android      # crée android-client/
BOVO_APP=client npx cap sync android
```
**App WORKER :**
```bash
BOVO_APP=worker npx cap add android      # crée android-worker/
BOVO_APP=worker npx cap sync android
```

## 3. Icône & splash (par app)
Fournis une icône carrée (≥ 1024×1024) + un splash (2732×2732) dans `resources/`,
puis génère pour l'app voulue (l'icône doit refléter l'app — « Bovo » vs « Bovo Pro ») :
```bash
# Place le bon visuel dans resources/icon.png + resources/splash.png, puis :
BOVO_APP=client npx @capacitor/assets generate --android
BOVO_APP=client npx cap sync android
```
(idem `BOVO_APP=worker` avec le visuel worker).

## 4. Notifications push (Firebase / FCM)
Le code push est **déjà prêt** (`src/lib/native.ts`, table `device_tokens`, Edge
Function `send-push`). Les deux apps partagent **un seul projet Firebase** :

1. **Projet Firebase** (gratuit) : https://console.firebase.google.com → « Bovo ».
2. **Deux apps Android** dans ce projet :
   - package `bj.bovo.app`   → `google-services.json` dans **`android-client/app/`**
   - package `bj.bovo.worker`→ `google-services.json` dans **`android-worker/app/`**
3. **Clé serveur (commune)** : Firebase → Paramètres → Comptes de service → générer une clé
   privée (JSON), puis côté Supabase :
   ```bash
   cd app/supabase
   supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)"
   supabase functions deploy send-push          # 1re fois : déploie la fonction
   ```
4. **Webhook DB** : Supabase Studio → Database → Webhooks → table `reservations`,
   event **UPDATE**, POST vers `https://<ref>.supabase.co/functions/v1/send-push`,
   header `Authorization: Bearer <service_role_key>`. (Notifie le client au changement
   de statut, et le worker à l'affectation — deep-link `/worker/?mission=<id>`.)
5. Android 13+ : permission `POST_NOTIFICATIONS` déjà demandée par `ensurePushRegistered()`.

> Sans Firebase, les apps fonctionnent **sans** notifications.

## 5. Build de release signé (AAB) — par app
1. Keystore (une fois, à CONSERVER — sa perte bloque les mises à jour) :
   ```bash
   keytool -genkey -v -keystore bovo.keystore -alias bovo -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Ouvre le projet voulu dans Android Studio :
   ```bash
   BOVO_APP=client npx cap open android    # (ou worker)
   ```
   → **Build → Generate Signed App Bundle → Android App Bundle** → keystore → variante
   **release** → `.aab`.

## 6. Publier sur Google Play (une fiche par app)
1. Play Console → **Créer une application** (« Bovo » puis « Bovo Pro »).
2. Piste **Test interne** d'abord → téléverser l'`.aab`.
3. Remplir : description, **icône 512×512**, captures, **politique de confidentialité** (URL),
   **Déclaration de sécurité des données** (l'app collecte nom/téléphone/localisation → à déclarer).
4. Soumettre → review Google.

---

## Mémo « qui fait quoi »
| | Qui |
|---|---|
| Config Capacitor (2 apps) + ce guide | ✅ assistant |
| Code push (native.ts, send-push, device_tokens) | ✅ déjà en place |
| `cap add/sync` + build + signing (×2 apps) | **toi** (Android Studio) |
| Projet Firebase + 2× `google-services.json` + `FCM_SERVICE_ACCOUNT` + webhook | **toi** |
| Icônes/splash + fiches Play (×2) | **toi** |

## Notes
- **Mises à jour** : l'app charge le site live → la plupart des évolutions ne nécessitent
  **pas** de re-soumission (juste un déploiement web). On re-soumet pour un changement
  natif (icône, plugins, permissions, push).
- **iOS** : non couvert (pas de Mac/compte Apple). Les utilisateurs iOS utilisent
  `app.bovo.bj` dans Safari (« Ajouter à l'écran d'accueil » possible).
