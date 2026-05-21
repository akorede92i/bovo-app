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
 *   2. Récupérer la clé publique (sandbox + prod)
 *   3. Mettre dans .env :
 *      PUBLIC_KKIAPAY_PUBLIC_KEY=xxx (sandbox d'abord)
 *   4. Passer `sandbox: false` côté front quand prêt pour la prod
 */

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

/**
 * Helper pour ouvrir le widget Kkiapay et écouter le résultat.
 * Lève une erreur si le widget n'est pas chargé.
 */
export function openDeposit(opts: OpenDepositOpts): void {
  if (!isKkiapayReady()) {
    throw new Error('Widget Kkiapay non chargé — vérifiez que <script src="https://cdn.kkiapay.me/k.js"></script> est dans la page.');
  }

  const apiKey = (import.meta as any).env?.PUBLIC_KKIAPAY_PUBLIC_KEY ?? 'DEMO';
  const sandbox = !((import.meta as any).env?.PROD);

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

  window.addKkiapayListener?.('success', async (resp) => {
    await opts.onSuccess(resp);
  });

  if (opts.onFailed) {
    window.addKkiapayListener?.('failed', async (resp) => {
      await opts.onFailed!(resp);
    });
  }
}
