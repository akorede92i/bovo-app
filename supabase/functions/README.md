# Edge Functions Supabase — Bovo

## notify-whatsapp

Envoie une notification WhatsApp à l'admin Bovo à chaque nouvelle réservation insérée dans la table `reservations`.

### Providers supportés

1. **CallMeBot** (gratuit, recommandé pour démarrer)
   - Inscription : envoyer "I allow callmebot to send me messages" au +34 644 51 95 23 sur WhatsApp
   - On reçoit une API key par retour
   - Limite ~6 messages / 30 min, gratuit

2. **Twilio WhatsApp** (payant, production)
   - ~0.05 USD par message
   - Demande approbation du template chez Meta pour les messages business

### Setup

```bash
# Depuis la racine du projet app/
cd supabase

# Login Supabase CLI
supabase login
supabase link --project-ref <votre-project-ref>

# Secrets (CallMeBot)
supabase secrets set WHATSAPP_PROVIDER=callmebot
supabase secrets set ADMIN_WHATSAPP=2290196677743
supabase secrets set CALLMEBOT_APIKEY=xxxxxx

# Déploiement
supabase functions deploy notify-whatsapp --no-verify-jwt
```

### Configurer le webhook DB

Dans Supabase Studio :

1. Database → Webhooks → "Create a new hook"
2. Name : `notify-whatsapp-on-new-reservation`
3. Table : `reservations`
4. Events : `INSERT`
5. Type : `HTTP Request`
6. Method : `POST`
7. URL : `https://<project-ref>.supabase.co/functions/v1/notify-whatsapp`
8. Headers :
   ```
   Authorization: Bearer <service_role_key>
   Content-Type: application/json
   ```

À chaque INSERT, la fonction reçoit `{ type: 'INSERT', table: 'reservations', record: {...} }` et envoie le message WhatsApp.

## confirm-deposit

Ferme la boucle d'acompte Kkiapay **côté serveur** : le client ne peut écrire que
`deposit_status` `none`/`pending` (RLS + trigger). Cette fonction, appelée par les
pages recap après un paiement réussi, **vérifie la transaction auprès de Kkiapay**
puis passe la réservation à `deposit_status='paid'` + enregistre le `transactionId`.

Sans cette vérification serveur, marquer `paid` recréerait la faille « forger un
paiement ». La fonction ne marque **jamais** `paid` sans une transaction Kkiapay
réellement `SUCCESS`, d'un montant ≥ ~20 % de l'estimation, et non déjà utilisée.

### Setup

```bash
cd supabase
# 3 clés Kkiapay (compte app.kkiapay.me → Paramètres → API keys)
supabase secrets set KKIAPAY_PUBLIC_KEY=xxxxxx
supabase secrets set KKIAPAY_PRIVATE_KEY=xxxxxx
supabase secrets set KKIAPAY_SECRET_KEY=xxxxxx
# Mode : 'false' = API prod (def), 'true' = sandbox (doit correspondre au widget)
supabase secrets set KKIAPAY_SANDBOX=false

# Déploiement — invocable par les réservations invité (sans JWT) :
supabase functions deploy confirm-deposit --no-verify-jwt
```

> Tant que les 3 clés ne sont pas posées, la fonction répond `503` et ne marque
> rien `paid` (fail-safe : pas pire que l'état actuel, jamais de faux `paid`).
