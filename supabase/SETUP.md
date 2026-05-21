# Setup Supabase pour Bovo

Guide pas-à-pas pour mettre en place la BDD + auth de l'app Bovo.

## 1. Créer le projet

1. Aller sur https://supabase.com → **New project**
2. Nom du projet : `bovo-prod` (ou `bovo-staging` pour tester)
3. Database password : **générer un mot de passe fort** et le sauver dans 1Password / Bitwarden
4. Region : `Frankfurt (eu-central-1)` (le plus proche du Bénin pour la latence)
5. Plan : Free (jusqu'à 50k utilisateurs actifs / mois, largement assez pour démarrer)

Attendre 1-2 minutes que le projet se provisionne.

## 2. Exécuter le schéma SQL

1. Dans Supabase Studio → **SQL Editor** → **New query**
2. Coller le contenu de `supabase/schema.sql`
3. Cliquer **Run**

Vérifier dans **Table Editor** que les tables suivantes ont été créées :
- `profiles`
- `addresses`
- `reservations`
- `airbnb_properties`
- `airbnb_turnovers`
- `worker_skills`
- `worker_zones`
- `worker_availability`
- `worker_blackouts`

## 3. Configurer l'authentification

**Authentication → Providers → Email** :
- ✅ Enable Email provider
- ✅ Confirm email (active la confirmation par email à l'inscription)
- Optionnel : désactiver Confirm email pour tester sans validation email

**Authentication → URL Configuration** :
- Site URL : `https://app.bovo.bj`
- Redirect URLs : ajouter
  - `https://app.bovo.bj/**`
  - `http://localhost:4321/**` (pour le dev)

**Authentication → Email Templates** (optionnel mais recommandé) :
- Personnaliser le template "Confirm signup" aux couleurs Bovo
- Mettre l'expéditeur sur `noreply@bovo.bj` (configurer SMTP custom si besoin de production)

## 4. Récupérer les clés API

**Settings → API** :
- **Project URL** : `https://xxx.supabase.co`
- **anon / public key** : `eyJhbGc...` (clé sûre côté front)
- **service_role key** : ⚠️ à garder secrète (utilisée par les Edge Functions et le webhook)

Copier la clé anon dans le `.env` :
```
PUBLIC_SUPABASE_URL=https://xxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

## 5. Créer le premier admin

Une fois l'app déployée, créer un compte normal via l'inscription, puis dans Supabase Studio :

**Table Editor → profiles → trouver votre ligne → modifier `role`** : passer de `customer` à `admin`.

À partir de là, vous accédez aux résa de tous les clients via les policies RLS.

## 6. Tester en local

```bash
cd app
cp .env.example .env
# coller PUBLIC_SUPABASE_URL et PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Tester :
1. http://localhost:4321 → home
2. /compte/inscription → créer un compte test
3. Vérifier l'email de confirmation
4. /compte/connexion → se connecter
5. Faire une résa Ménage de bout en bout
6. Vérifier dans Supabase → reservations qu'elle apparaît

## 7. Déployer l'Edge Function notify-whatsapp

Voir `supabase/functions/README.md` pour le détail. Résumé :

```bash
cd app/supabase
supabase login
supabase link --project-ref xxx
supabase secrets set WHATSAPP_PROVIDER=callmebot
supabase secrets set ADMIN_WHATSAPP=2290196677743
supabase secrets set CALLMEBOT_APIKEY=xxx
supabase functions deploy notify-whatsapp --no-verify-jwt
```

Puis créer le DB webhook dans Supabase Studio :
- **Database → Webhooks → Create**
- Table `reservations`, events `INSERT`
- URL : `https://xxx.supabase.co/functions/v1/notify-whatsapp`
- Header : `Authorization: Bearer <service_role_key>`

## 8. Backups et monitoring

- Supabase fait des backups quotidiens automatiques (Free plan : 7 jours, Pro : 30 jours)
- Pour exporter manuellement : **Settings → Database → Backups → Download**
- Monitoring : **Reports** affiche les requêtes, latence, erreurs

## Schéma actuel — Vue d'ensemble

```
auth.users (Supabase Auth)
   ↓ 1:1
profiles (id, full_name, phone, role, avatar_url)
   ↓ 1:N
addresses (label, zone, street, building, lat, lng)
reservations (service_type, payload, status, deposit_status, assigned_worker_id)
airbnb_properties (label, ical_url, owner_user_id)
   ↓ 1:N
airbnb_turnovers (check_out_at, check_in_at, assigned_worker_id)

worker_skills, worker_zones, worker_availability, worker_blackouts
   ↑ (relié à profiles.role='worker')
```

Le schéma est conçu pour la phase 2 admin sans refactor : les tables workers sont déjà là, il suffira d'ajouter l'UI admin.
