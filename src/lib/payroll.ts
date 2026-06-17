/**
 * Calcul de la rémunération worker par mission (carte W6). Fonction PURE, testée.
 * S'appuie sur le tarif de la fiche RH (W2) : `worker_profiles.pay_type` + `rate_xof`.
 *
 *  - pay_type 'horaire' → rate_xof × (durée_min / 60), arrondi à l'entier.
 *  - pay_type 'mission' (ou non précisé) → forfait `rate_xof`.
 *  - rate_xof non défini (null) → `null` : tarif à définir, la mission est
 *    exclue du total dû tant que l'admin n'a pas renseigné le tarif (W2).
 */
export function computePayout(
  rate_xof: number | null | undefined,
  pay_type: string | null | undefined,
  duration_min: number | null | undefined,
): number | null {
  if (rate_xof == null || rate_xof < 0) return null;
  if (pay_type === 'horaire') {
    const minutes = duration_min ?? 0;
    if (minutes <= 0) return 0;
    return Math.round(rate_xof * (minutes / 60));
  }
  // 'mission' ou non précisé → forfait par mission.
  return Math.round(rate_xof);
}
