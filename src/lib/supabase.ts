/**
 * Client Supabase pour Bovo.
 * Utilise les variables d'env PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY.
 * Le schéma SQL des tables est dans supabase/schema.sql.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL ?? '';
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anon) {
    // Mode dev sans Supabase : l'app fonctionne en mode "résa invité" uniquement
    if (typeof window !== 'undefined') {
      console.warn('[Bovo] Supabase env vars missing — guest mode only');
    }
    return null;
  }
  if (!client) {
    client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

// ============================================
// TYPES DB (miroir du schéma Postgres)
// ============================================
export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: 'customer' | 'worker' | 'admin';
  created_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  label: string;
  zone: string;
  quartier: string | null;
  street: string;
  building: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface Reservation {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  service_type: 'menage' | 'airbnb' | 'demenagement' | 'chef';
  payload: Record<string, unknown>;
  address_id: string | null;
  scheduled_at: string | null;
  duration_min: number | null;
  estimated_total_xof: number | null;
  status: 'pending' | 'confirmed' | 'assigned' | 'in_progress' | 'done' | 'cancelled';
  deposit_status: 'none' | 'pending' | 'paid' | 'refunded';
  assigned_worker_id: string | null;
  created_at: string;
}
