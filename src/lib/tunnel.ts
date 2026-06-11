/**
 * Logique partagée des tunnels de réservation (les 5 pages de récapitulatif recap.astro).
 *
 * Factorise la soumission pour corriger des bugs qui étaient dupliqués dans
 * chaque recap :
 *  - perte silencieuse de la demande quand on soumet hors-ligne (le state était
 *    effacé AVANT toute confirmation, et la redirection wa.me échouait) ;
 *  - user_id jamais rattaché aux réservations (espace client toujours vide) ;
 *  - insert sans timeout (bouton « Envoi en cours… » bloqué à l'infini) ;
 *  - window.open() appelé après un await (bloqué par les anti-popups).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { clearState, type ServiceKey, type CustomerInfo } from './state';

/** Numéro WhatsApp Bovo qui reçoit les demandes (notif admin + UX client). */
export const ADMIN_WHATSAPP = '2290196677743';

/** Le navigateur se déclare hors-ligne (premier filet contre la perte de données). */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** id de l'utilisateur connecté, sinon null (réservation invité). */
export async function getCurrentUserId(supa: SupabaseClient | null): Promise<string | null> {
  if (!supa) return null;
  try {
    const { data } = await supa.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export interface SubmitResult {
  ok: boolean;       // insert réussi
  skipped: boolean;  // Supabase non configuré (mode invité / WhatsApp seul)
  error?: string;
}

/**
 * Insert best-effort de la réservation, borné par un timeout pour ne jamais
 * laisser l'UI pendre sur une connexion zombie. WhatsApp reste le canal de
 * secours, donc un échec ici n'interrompt pas le parcours.
 */
export async function submitReservation(
  supa: SupabaseClient | null,
  payload: Record<string, unknown>,
  timeoutMs = 8000,
): Promise<SubmitResult> {
  if (!supa) return { ok: false, skipped: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { error } = await supa.from('reservations').insert(payload).abortSignal(controller.signal);
    clearTimeout(timer);
    if (error) {
      console.warn('[Bovo] Supabase insert failed, fallback WhatsApp:', error.message);
      return { ok: false, skipped: false, error: error.message };
    }
    return { ok: true, skipped: false };
  } catch (e: any) {
    clearTimeout(timer);
    console.warn('[Bovo] Supabase insert threw, fallback WhatsApp:', e?.message);
    return { ok: false, skipped: false, error: e?.message ?? 'unknown' };
  }
}

export function whatsappUrl(message: string): string {
  return `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

/** Affiche un message d'erreur accessible (role=alert) au-dessus du CTA, sans toucher au markup. */
export function showSubmitError(message: string): void {
  let el = document.getElementById('submit-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'submit-error';
    el.setAttribute('role', 'alert');
    el.style.cssText =
      'margin:14px 0; padding:12px 14px; border-radius:12px; background:#FEF2F2; color:#B91C1C; font-size:0.9rem; line-height:1.4;';
    const cards = document.getElementById('recap-cards');
    cards?.insertAdjacentElement('afterend', el);
  }
  el.textContent = message;
  el.style.display = 'block';
}

/**
 * Nettoie le state et redirige vers WhatsApp (ou l'inscription pré-remplie si
 * l'utilisateur a coché « créer mon compte »). À n'appeler qu'une fois la
 * tentative de soumission terminée — JAMAIS avant.
 * `preopened` est une fenêtre WhatsApp déjà ouverte dans le geste utilisateur.
 */
export function navigateAfterSubmit(
  service: ServiceKey,
  waUrl: string,
  customer: CustomerInfo | undefined,
  preopened?: Window | null,
): void {
  const wantAccount = sessionStorage.getItem('bovo:create-account') === '1' && !!customer?.email;
  clearState(service);
  sessionStorage.removeItem('bovo:create-account');

  if (wantAccount) {
    const iParams = new URLSearchParams({
      email: customer!.email!,
      name: customer?.fullName ?? '',
      phone: customer?.phone ?? '',
    });
    // Si la fenêtre WhatsApp n'a pas pu être ouverte dans le geste, on l'ouvre ici (best-effort).
    if (!preopened) window.open(waUrl, '_blank', 'noopener');
    window.location.href = `/compte/inscription/?${iParams}`;
  } else {
    window.location.href = waUrl;
  }
}

export interface SubmitAndRedirectOpts {
  service: ServiceKey;
  payload: Record<string, unknown>;
  message: string;            // message WhatsApp pré-construit (synchrone)
  customer: CustomerInfo | undefined;
  cta: HTMLButtonElement;
}

/**
 * Flux de soumission complet pour les tunnels SANS acompte (et la branche sans
 * acompte des tunnels chef/déménagement) :
 *   garde hors-ligne → user_id → insert borné → nettoyage → WhatsApp.
 * Le window.open éventuel est fait avant tout await pour ne pas être bloqué.
 */
export async function submitAndRedirect(opts: SubmitAndRedirectOpts): Promise<void> {
  const { service, payload, message, customer, cta } = opts;

  if (isOffline()) {
    showSubmitError('Vous semblez hors-ligne. Vérifiez votre connexion et réessayez — vos informations sont conservées.');
    return;
  }

  cta.disabled = true;
  cta.textContent = 'Envoi en cours…';

  const waUrl = whatsappUrl(message);
  // Ouvre WhatsApp dans le geste utilisateur (avant tout await) pour éviter le blocage popup.
  const wantAccount = sessionStorage.getItem('bovo:create-account') === '1' && !!customer?.email;
  const preopened = wantAccount ? window.open(waUrl, '_blank', 'noopener') : null;

  const supa = getSupabase();
  const userId = await getCurrentUserId(supa);
  await submitReservation(supa, { ...payload, user_id: userId });

  navigateAfterSubmit(service, waUrl, customer, preopened);
}

// ── Validation partagée (harmonise les 5 pages contact) ──
export const validPhone = (v: string | undefined | null): boolean => !!v && v.replace(/\D/g, '').length >= 8;
export const validEmail = (v: string | undefined | null): boolean => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
