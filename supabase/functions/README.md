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
