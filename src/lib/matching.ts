/**
 * Moteur d'assignation auto Bovo.
 *
 * `rankCandidates` = fonction PURE (testable) qui classe les workers pour une
 * réservation selon : compétence (requise), zone, disponibilité récurrente,
 * congés (exclusion), conflit d'horaire (exclusion), note moyenne, et charge
 * du jour (équilibrage). Aucune dépendance réseau → unit-testée.
 *
 * `suggestWorkers` = wrapper qui récupère les données via Supabase puis appelle
 * `rankCandidates`. Utilisé par l'inbox admin (/admin/reservations).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Candidate {
  worker_id: string;
  full_name: string;
  score: number;
  reasons: string[];   // points forts (vert)
  warnings: string[];  // points d'attention (orange), n'excluent pas
}

export interface MatchInput {
  reservation: {
    id: string;
    service_type: string;
    zone?: string | null;
    startMs: number;
    durationMin: number;
  };
  workers: { id: string; full_name: string | null }[];
  /** worker_skills déjà filtrés sur le service de la résa */
  skills: { worker_id: string; level: number | null }[];
  zones: { worker_id: string; zone: string }[];
  availability: { worker_id: string; day_of_week: number; startMin: number; endMin: number }[];
  blackouts: { worker_id: string; startMs: number; endMs: number }[];
  /** réservations assignées le même jour (hors la résa courante), pour conflit + charge */
  dayReservations: { worker_id: string; startMs: number; durationMin: number }[];
  reviews: { worker_id: string; rating: number }[];
  /** statut RH (worker_profiles) ; 'suspended'/'archived' → exclus du matching (W3).
   *  Absent / 'active' / null → worker éligible. */
  statuses?: { worker_id: string; status: string | null }[];
}

export function rankCandidates(input: MatchInput): Candidate[] {
  const { reservation: res } = input;
  const start = res.startMs;
  const end = res.startMs + res.durationMin * 60_000;
  const d = new Date(start);
  const dow = d.getDay(); // 0=dimanche … 6=samedi (cohérent avec le schéma)
  const startMin = d.getHours() * 60 + d.getMinutes();
  const endMin = startMin + res.durationMin;

  // Index par worker
  const nameById = new Map(input.workers.map((w) => [w.id, w.full_name || 'Worker']));
  const levelById = new Map<string, number>();
  for (const s of input.skills) levelById.set(s.worker_id, s.level ?? 1);

  const zonesByWorker = group(input.zones, (z) => z.worker_id, (z) => z.zone);
  const availByWorker = group(input.availability, (a) => a.worker_id, (a) => a);

  const blockedByBlackout = new Set<string>();
  for (const b of input.blackouts) {
    if (b.startMs < end && b.endMs > start) blockedByBlackout.add(b.worker_id);
  }

  // Workers suspendus/archivés (worker_profiles.status) → exclus du matching (W3).
  const inactive = new Set<string>();
  for (const s of input.statuses ?? []) {
    if (s.status === 'suspended' || s.status === 'archived') inactive.add(s.worker_id);
  }

  const loadByWorker = new Map<string, number>();
  const conflicting = new Set<string>();
  for (const r of input.dayReservations) {
    loadByWorker.set(r.worker_id, (loadByWorker.get(r.worker_id) ?? 0) + 1);
    const rs = r.startMs;
    const re = r.startMs + r.durationMin * 60_000;
    if (rs < end && re > start) conflicting.add(r.worker_id);
  }

  const ratingAgg = new Map<string, { sum: number; n: number }>();
  for (const rv of input.reviews) {
    const a = ratingAgg.get(rv.worker_id) ?? { sum: 0, n: 0 };
    a.sum += rv.rating;
    a.n += 1;
    ratingAgg.set(rv.worker_id, a);
  }

  const candidates: Candidate[] = [];
  // Seuls les workers ayant la compétence sont éligibles.
  for (const workerId of levelById.keys()) {
    if (blockedByBlackout.has(workerId)) continue; // en congé → exclu
    if (conflicting.has(workerId)) continue;        // déjà pris sur le créneau → exclu
    if (inactive.has(workerId)) continue;           // suspendu/archivé → exclu (W3)

    const reasons: string[] = [];
    const warnings: string[] = [];
    let score = 0;

    const level = levelById.get(workerId) ?? 1;
    score += level * 4;
    if (level >= 4) reasons.push(`Expert niv. ${level}`);

    // Zone
    const wz = zonesByWorker.get(workerId) ?? [];
    if (res.zone && wz.length) {
      if (wz.includes(res.zone)) {
        score += 30;
        reasons.push(`Couvre ${res.zone}`);
      } else {
        score -= 20;
        warnings.push(`Hors zone (${wz.join(', ')})`);
      }
    }

    // Disponibilité récurrente
    const dayAvail = (availByWorker.get(workerId) ?? []).filter((a) => a.day_of_week === dow);
    if (dayAvail.length) {
      const covered = dayAvail.some((a) => a.startMin <= startMin && a.endMin >= endMin);
      if (covered) {
        score += 20;
        reasons.push('Dispo sur le créneau');
      } else {
        score -= 15;
        warnings.push('Hors de ses horaires habituels');
      }
    }

    // Note moyenne
    const ra = ratingAgg.get(workerId);
    if (ra && ra.n) {
      const avg = ra.sum / ra.n;
      score += avg * 6;
      reasons.push(`★ ${avg.toFixed(1)} (${ra.n} avis)`);
    }

    // Charge du jour (équilibrage)
    const load = loadByWorker.get(workerId) ?? 0;
    score -= load * 5;
    if (load) warnings.push(`${load} résa déjà ce jour`);

    candidates.push({
      worker_id: workerId,
      full_name: nameById.get(workerId) ?? 'Worker',
      score: Math.round(score),
      reasons,
      warnings,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function group<T, V>(rows: T[], key: (t: T) => string, val: (t: T) => V): Map<string, V[]> {
  const m = new Map<string, V[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k) ?? [];
    arr.push(val(r));
    m.set(k, arr);
  }
  return m;
}

function toMin(t: string): number {
  const [h, m] = String(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Récupère les données Supabase nécessaires puis classe les workers.
 * Renvoie [] si la résa n'a pas de créneau ou si aucun worker n'a la compétence.
 */
export async function suggestWorkers(
  supa: SupabaseClient,
  res: { id: string; service_type: string; zone?: string | null; scheduled_at: string | null; duration_min: number | null },
): Promise<Candidate[]> {
  if (!res.scheduled_at) return [];
  const startMs = new Date(res.scheduled_at).getTime();
  const durationMin = res.duration_min ?? 120;
  const endMs = startMs + durationMin * 60_000;

  // 1) workers ayant la compétence
  const { data: skills } = await supa
    .from('worker_skills')
    .select('worker_id, level')
    .eq('skill', res.service_type);
  const skilled = skills ?? [];
  if (skilled.length === 0) return [];
  const ids = [...new Set(skilled.map((s: any) => s.worker_id))];

  const dayStart = new Date(startMs);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(startMs);
  dayEnd.setHours(23, 59, 59, 999);

  const [profsRes, zonesRes, availRes, blackoutsRes, dayResRes, reviewsRes, statusRes] = await Promise.all([
    supa.from('profiles').select('id, full_name').in('id', ids),
    supa.from('worker_zones').select('worker_id, zone').in('worker_id', ids),
    supa.from('worker_availability').select('worker_id, day_of_week, time_start, time_end').in('worker_id', ids),
    supa.from('worker_blackouts').select('worker_id, starts_at, ends_at').in('worker_id', ids)
      .lt('starts_at', new Date(endMs).toISOString()).gt('ends_at', new Date(startMs).toISOString()),
    supa.from('reservations').select('assigned_worker_id, scheduled_at, duration_min')
      .not('assigned_worker_id', 'is', null)
      .gte('scheduled_at', dayStart.toISOString())
      .lte('scheduled_at', dayEnd.toISOString())
      .neq('status', 'cancelled')
      .neq('id', res.id),
    supa.from('reviews').select('worker_id, rating').in('worker_id', ids),
    supa.from('worker_profiles').select('worker_id, status').in('worker_id', ids),
  ]);

  return rankCandidates({
    reservation: { id: res.id, service_type: res.service_type, zone: res.zone ?? null, startMs, durationMin },
    workers: (profsRes.data ?? []) as any,
    skills: skilled as any,
    zones: (zonesRes.data ?? []) as any,
    availability: (availRes.data ?? []).map((a: any) => ({
      worker_id: a.worker_id,
      day_of_week: a.day_of_week,
      startMin: toMin(a.time_start),
      endMin: toMin(a.time_end),
    })),
    blackouts: (blackoutsRes.data ?? []).map((b: any) => ({
      worker_id: b.worker_id,
      startMs: new Date(b.starts_at).getTime(),
      endMs: new Date(b.ends_at).getTime(),
    })),
    dayReservations: (dayResRes.data ?? []).map((r: any) => ({
      worker_id: r.assigned_worker_id,
      startMs: new Date(r.scheduled_at).getTime(),
      durationMin: r.duration_min ?? 120,
    })),
    reviews: (reviewsRes.data ?? []) as any,
    statuses: (statusRes.data ?? []) as any,
  });
}
