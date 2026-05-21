/**
 * Helpers admin — vérifie que l'utilisateur a le role='admin' dans profiles.
 * À utiliser dans les pages /admin/*.
 */
import { getSessionUser, type SessionUser } from './auth';

export async function requireAdmin(redirectTo = '/compte/connexion/'): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const back = encodeURIComponent(window.location.pathname);
    window.location.href = `${redirectTo}?next=${back}`;
    return new Promise(() => {}) as any;
  }
  if (user.profile?.role !== 'admin') {
    document.body.innerHTML = `
      <div style="max-width: 480px; margin: 80px auto; padding: 40px 24px; text-align: center; font-family: 'Jost', sans-serif;">
        <h1 style="font-size: 1.4rem; margin-bottom: 12px;">Accès refusé</h1>
        <p style="color: #6B7280; margin-bottom: 24px;">Cette section est réservée à l'administration Bovo.</p>
        <a href="/" style="color: #4470B3; font-weight: 600;">← Retour à l'accueil</a>
      </div>
    `;
    return new Promise(() => {}) as any;
  }
  return user;
}

// Labels partagés pour les services
export const SERVICE_LABELS: Record<string, string> = {
  menage: 'Ménage',
  airbnb: 'Airbnb',
  demenagement: 'Déménagement',
  chef: 'Chef',
};

export const SERVICE_ICONS: Record<string, string> = {
  menage: '🧹',
  airbnb: '🏠',
  demenagement: '🚚',
  chef: '👨‍🍳',
};

export const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  assigned: 'Assignée',
  in_progress: 'En cours',
  done: 'Terminée',
  cancelled: 'Annulée',
};

export const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',     // warning
  confirmed: '#10B981',   // success
  assigned: '#4470B3',    // bleu
  in_progress: '#345a8f', // bleu dark
  done: '#6B7280',        // muted
  cancelled: '#DC2626',   // danger
};
