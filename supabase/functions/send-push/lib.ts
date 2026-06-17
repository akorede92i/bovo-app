/**
 * Helpers purs de l'edge function send-push.
 *
 * AUCUN import spécifique à Deno (pas d'URL `https://…`, pas de `Deno.*`) : ce
 * module doit être importable à la fois par le runtime Deno (`index.ts`, via
 * `./lib.ts`) ET par Vitest/Node pour être testé unitairement
 * (cf. `tests/unit/send-push.test.ts`).
 */

export const SERVICE_LABELS: Record<string, string> = {
  menage: 'ménage',
  airbnb: 'service Airbnb',
  demenagement: 'déménagement',
  chef: 'chef à domicile',
  plombier: 'plomberie',
};

/** Message de suivi par statut de réservation (null = pas de notification). */
export function messageForStatus(
  status: string,
  serviceType: string,
): { title: string; body: string } | null {
  const svc = SERVICE_LABELS[serviceType] ?? 'prestation';
  switch (status) {
    case 'confirmed':
      return { title: 'Réservation confirmée ✅', body: `Votre ${svc} est confirmé. On s'occupe de tout !` };
    case 'assigned':
      return { title: 'Prestataire assigné 👤', body: `Un professionnel Bovo a été assigné à votre ${svc}.` };
    case 'in_progress':
      return { title: 'Prestation en cours 🧹', body: `Votre ${svc} vient de démarrer.` };
    case 'done':
      return { title: 'Prestation terminée 🎉', body: `Votre ${svc} est terminé. Merci ! Laissez-nous un avis ⭐` };
    case 'cancelled':
      return { title: 'Réservation annulée', body: `Votre ${svc} a été annulé. Besoin d'aide ? Écrivez-nous.` };
    default:
      return null; // 'pending' et autres : pas de notification
  }
}

/**
 * #8 — Garde d'autorisation. La fonction n'est appelable que par le service_role :
 * webhook DB configuré avec `Authorization: Bearer <SERVICE_ROLE_KEY>`, ou appel
 * admin direct avec le même header. Fail-closed : refuse si la clé serveur manque.
 */
export function isServiceRoleAuthorized(
  authHeader: string | null | undefined,
  serviceRoleKey: string | null | undefined,
): boolean {
  if (!serviceRoleKey) return false;
  return authHeader === `Bearer ${serviceRoleKey}`;
}

/**
 * #8 — FCM HTTP v1 exige que TOUTES les valeurs de `data` soient des strings.
 * On convertit (nombre/booléen → String, objet → JSON) et on ignore null/undefined,
 * pour qu'un appelant ne puisse pas provoquer un 400 « INVALID_ARGUMENT » qui serait
 * ensuite pris à tort pour un token mort (et déclencherait une purge).
 */
export function coerceData(
  data: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data || typeof data !== 'object') return out;
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return out;
}

/**
 * #8 — Classe un échec d'envoi FCM. Renvoie 'invalid' (token mort → purge)
 * UNIQUEMENT quand FCM indique clairement que le token est inutilisable. Tout le
 * reste → 'error' : on ne supprime JAMAIS un token sur une erreur ambiguë
 * (message malformé, quota, 5xx…).
 */
export function classifyFcmFailure(status: number, body: string): 'invalid' | 'error' {
  let errorCode = '';
  let message = '';
  try {
    const j = JSON.parse(body);
    message = String(j?.error?.message ?? '');
    const details = Array.isArray(j?.error?.details) ? j.error.details : [];
    const withCode = details.find((d: any) => d && d.errorCode);
    errorCode = String(withCode?.errorCode ?? j?.error?.status ?? '');
  } catch {
    // corps non-JSON : on se rabat sur le seul code HTTP ci-dessous.
  }
  if (errorCode === 'UNREGISTERED' || errorCode === 'SENDER_ID_MISMATCH') return 'invalid';
  if (status === 404) return 'invalid';
  if (status === 400 && /registration token/i.test(message)) return 'invalid';
  return 'error';
}
