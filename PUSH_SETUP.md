# Notifications push Bovo — guide d'activation

Architecture : **FCM unifié** (Android + iOS), jetons stockés dans Supabase
(`device_tokens`), envoi via l'Edge Function `send-push` (FCM HTTP v1).

Le **code est déjà en place** (socle C1). Il reste à fournir les fichiers de
config Firebase/Apple et à déployer (C2 ci-dessous).

---

## ✅ Déjà fait (dans le repo, branche `feat/capacitor-mobile`)

- `supabase/migrations/20260607_device_tokens.sql` — table `device_tokens` + RLS.
- `supabase/functions/send-push/index.ts` — Edge Function FCM v1 (2 modes :
  webhook suivi-réservation + appel direct rappels/promos).
- `src/lib/push.ts` — `saveDeviceToken()` / `flushPendingDeviceToken()`.
- `src/lib/native.ts` — capture du token FCM + listeners (tap → routage) via
  `@capacitor-firebase/messaging`. Permission via `requestPushPermission()`.
- Plugins installés : `@capacitor-firebase/app`, `@capacitor-firebase/messaging`, `firebase`.

---

## 🔧 C2 — Activation (avec tes comptes)

### 1. Supabase
1. SQL editor → exécuter `supabase/migrations/20260607_device_tokens.sql`.
2. Firebase Console → Paramètres du projet → **Comptes de service** → *Générer une
   nouvelle clé privée* → télécharger le JSON.
3. `supabase secrets set FCM_SERVICE_ACCOUNT="$(cat chemin/vers/serviceAccount.json)"`
4. `supabase functions deploy send-push`
5. Database → **Webhooks** → nouveau webhook :
   - table `reservations`, événement **UPDATE**
   - URL `https://<projet>.supabase.co/functions/v1/send-push`
   - Header `Authorization: Bearer <SERVICE_ROLE_KEY>`

### 2. Firebase (apps mobiles)
- Ajouter une **app Android** (package `bj.bovo.app`) → télécharger `google-services.json`.
- Ajouter une **app iOS** (bundle `bj.bovo.app`) → télécharger `GoogleService-Info.plist`.
- Cloud Messaging → **Apple app configuration** → uploader la **clé APNs .p8**
  (créée sur developer.apple.com → Keys → Apple Push Notifications service).

### 3. Android natif
1. Copier `google-services.json` dans `android/app/`.
2. `npx cap sync android`
3. `cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew clean assembleDebug --no-daemon`

### 4. iOS natif (Xcode)
1. Glisser `GoogleService-Info.plist` dans le projet (`ios/App/App/`, "Copy if needed", target App).
2. `npx cap sync ios`
3. Xcode → target App → **Signing & Capabilities** → ajouter **Push Notifications**
   + **Background Modes → Remote notifications**. Sélectionner l'équipe (compte Apple Developer).
4. Vérifier l'init Firebase dans `AppDelegate` (le plugin `@capacitor-firebase/app`
   appelle normalement `FirebaseApp.configure()` ; sinon l'ajouter dans `didFinishLaunchingWithOptions`).

### 5. Brancher la demande de permission dans l'app
- Appeler `requestPushPermission()` (depuis `@lib/native`) au bon moment
  (ex. après inscription/connexion, ou après la 1ère réservation — pas au tout 1er lancement).
- Appeler `flushPendingDeviceToken()` (depuis `@lib/push`) juste après un login réussi
  (rattache un jeton capté avant connexion).

---

## 🧪 Tests
- Lancer l'app sur device, accepter la permission → vérifier une ligne dans `device_tokens`.
- Côté admin, passer une réservation à `confirmed`/`assigned`/... → push reçu (suivi).
- Promo ciblée : `POST /functions/v1/send-push` (Bearer SERVICE_ROLE) avec
  `{ "userIds": ["..."], "title": "Offre Bovo", "body": "-20% cette semaine", "channel": "marketing" }`.

## Notes
- Les jetons morts (404/400) sont purgés automatiquement par l'Edge Function.
- `device_tokens` distingue `allow_transactional` / `allow_marketing` (opt-in par canal).
- Sur le web (app.bovo.bj), pas de push : le code push est court-circuité (natif uniquement).
