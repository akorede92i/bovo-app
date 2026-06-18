/**
 * Utilitaires Kkiapay — passerelle de paiement Mobile Money + carte au Bénin.
 *
 * Le widget Kkiapay est chargé via <script src="https://cdn.kkiapay.me/k.js"></script>
 * dans les pages de récap qui en ont besoin (déménagement, chef).
 *
 * Documentation : https://docs.kkiapay.me/
 *
 * Setup :
 *   1. Créer un compte sur app.kkiapay.me
 *   2. Récupérer la clé publique (une clé sandbox + une clé prod)
 *   3. Mettre dans .env :
 *      PUBLIC_KKIAPAY_PUBLIC_KEY=xxx   (clé de test en dev/preprod, clé live en prod)
 *      PUBLIC_KKIAPAY_SANDBOX=true     (paiements de test) — voir openDeposit()
 *   4. Paiements RÉELS = opt-in EXPLICITE : poser PUBLIC_KKIAPAY_SANDBOX=false
 *      (uniquement sur le build prod web / release mobile). Sinon → sandbox par défaut,
 *      donc aucun build oublié (preprod, APK de test, dev) ne peut débiter un vrai compte.
 */

import { getSupabase } from './supabase';

declare global {
  interface Window {
    openKkiapayWidget?: (config: KkiapayConfig) => void;
    addKkiapayListener?: (event: 'success' | 'failed', cb: (resp: KkiapayResponse) => void) => void;
  }
}

export interface KkiapayConfig {
  amount: number;
  api_key: string;
  callback?: string;
  position?: 'left' | 'center' | 'right';
  sandbox?: boolean;
  data?: string;
  theme?: string;
  name?: string;
  email?: string;
  phone?: string;
  reason?: string;
}

export interface KkiapayResponse {
  transactionId?: string;
  amount?: number;
  status?: 'SUCCESS' | 'FAILED';
  data?: string;
}

export function isKkiapayReady(): boolean {
  return typeof window !== 'undefined' && typeof window.openKkiapayWidget === 'function';
}

export interface OpenDepositOpts {
  amountXof: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  reservationId?: string;
  reason?: string;
  onSuccess: (resp: KkiapayResponse) => void | Promise<void>;
  onFailed?: (resp: KkiapayResponse) => void | Promise<void>;
}

// Les listeners Kkiapay ne peuvent pas être retirés via l'API : on ne les
// enregistre donc qu'UNE fois, et on route vers les callbacks du dernier appel.
// Sinon chaque ouverture du widget empile un listener → double soumission.
let listenersBound = false;
let currentSuccess: ((resp: KkiapayResponse) => void | Promise<void>) | null = null;
let currentFailed: ((resp: KkiapayResponse) => void | Promise<void>) | null = null;

/**
 * Helper pour ouvrir le widget Kkiapay et écouter le résultat.
 * Lève une erreur si le widget n'est pas chargé.
 * Le mode sandbox est piloté par la variable PUBLIC_KKIAPAY_SANDBOX (cf. plus bas) :
 * en prod (web/mobile) les paiements sont réels — ne jamais coder `sandbox: true`
 * en dur dans les pages, ni s'appuyer sur PROD pour distinguer preprod et prod.
 */
export function openDeposit(opts: OpenDepositOpts): void {
  if (!isKkiapayReady()) {
    throw new Error('Widget Kkiapay non chargé — vérifiez que <script src="https://cdn.kkiapay.me/k.js"></script> est dans la page.');
  }

  const apiKey = (import.meta as any).env?.PUBLIC_KKIAPAY_PUBLIC_KEY ?? 'DEMO';
  // Mode sandbox à DÉFAUT SÛR : on reste en sandbox SAUF si les paiements réels sont
  // activés EXPLICITEMENT par PUBLIC_KKIAPAY_SANDBOX='false'. Ainsi tout build qui
  // oublie la variable (preprod, APK de test, dev) ne peut PAS débiter un vrai compte
  // Mobile Money. Les vrais paiements exigent un opt-in explicite, posé uniquement
  // dans deploy.yml (build prod web). Ne JAMAIS coder sandbox:true/false en dur dans
  // les pages, ni s'appuyer sur PROD pour distinguer preprod et prod.
  const sandboxEnv = (import.meta as any).env?.PUBLIC_KKIAPAY_SANDBOX;
  const sandbox = !(sandboxEnv === 'false' || sandboxEnv === false);

  currentSuccess = opts.onSuccess;
  currentFailed = opts.onFailed ?? null;

  if (!listenersBound) {
    window.addKkiapayListener?.('success', async (resp) => {
      if (currentSuccess) await currentSuccess(resp);
    });
    window.addKkiapayListener?.('failed', async (resp) => {
      if (currentFailed) await currentFailed(resp);
    });
    listenersBound = true;
  }

  window.openKkiapayWidget!({
    amount: opts.amountXof,
    api_key: apiKey,
    sandbox,
    data: opts.reservationId ?? '',
    theme: '#4470B3',
    name: opts.customerName ?? '',
    email: opts.customerEmail ?? '',
    phone: opts.customerPhone ?? '',
    reason: opts.reason ?? 'Acompte réservation Bovo',
  });
}

/**
 * Confirme un acompte CÔTÉ SERVEUR après un paiement Kkiapay réussi.
 * Appelle l'Edge Function `confirm-deposit`, qui VÉRIFIE la transaction auprès de
 * Kkiapay avant de passer la réservation à deposit_status='paid' (le client ne
 * peut pas l'écrire : RLS + trigger). Best-effort : un échec n'interrompt pas le
 * parcours (l'admin peut réconcilier), mais le transactionId est transmis au
 * serveur pour ne jamais être perdu.
 */
export async function confirmDeposit(reservationId: string, transactionId: string): Promise<void> {
  try {
    const supa = getSupabase();
    if (!supa) return;
    const { error } = await supa.functions.invoke('confirm-deposit', {
      body: { reservationId, transactionId },
    });
    if (error) console.warn('[Bovo] confirm-deposit a échoué :', error.message);
  } catch (e: any) {
    console.warn('[Bovo] confirm-deposit a levé une exception :', e?.message);
  }
}
