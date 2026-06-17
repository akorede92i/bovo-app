import { describe, it, expect } from 'vitest';
import {
  isServiceRoleAuthorized,
  coerceData,
  classifyFcmFailure,
  messageForStatus,
} from '../../supabase/functions/send-push/lib';

const SR = 'sb-service-role-key-0123456789abcdef';

describe("send-push #8 — garde d'autorisation", () => {
  it('accepte le bearer service_role exact', () => {
    expect(isServiceRoleAuthorized(`Bearer ${SR}`, SR)).toBe(true);
  });
  it('refuse une autre clé (ex. clé anon publique)', () => {
    expect(isServiceRoleAuthorized('Bearer anon-public-jwt', SR)).toBe(false);
  });
  it('refuse un header absent ou sans préfixe Bearer', () => {
    expect(isServiceRoleAuthorized(null, SR)).toBe(false);
    expect(isServiceRoleAuthorized(SR, SR)).toBe(false);
  });
  it('fail-closed si la clé serveur est absente', () => {
    expect(isServiceRoleAuthorized(`Bearer ${SR}`, undefined)).toBe(false);
    expect(isServiceRoleAuthorized('Bearer ', '')).toBe(false);
  });
});

describe('send-push #8 — coerceData (FCM exige des strings)', () => {
  it('convertit nombres / booléens en strings', () => {
    expect(coerceData({ count: 3, flag: false, id: 'abc' })).toEqual({ count: '3', flag: 'false', id: 'abc' });
  });
  it('sérialise les objets imbriqués', () => {
    expect(coerceData({ meta: { a: 1 } })).toEqual({ meta: '{"a":1}' });
  });
  it('ignore null/undefined (valeurs et entrée)', () => {
    expect(coerceData({ a: null, b: undefined, c: 'x' })).toEqual({ c: 'x' });
    expect(coerceData(null)).toEqual({});
    expect(coerceData(undefined)).toEqual({});
  });
});

describe('send-push #8 — classifyFcmFailure (ne purge que les vrais tokens morts)', () => {
  it('404 / UNREGISTERED → invalid (purge)', () => {
    expect(
      classifyFcmFailure(404, JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } })),
    ).toBe('invalid');
    expect(classifyFcmFailure(404, '')).toBe('invalid');
  });
  it('400 token malformé → invalid', () => {
    expect(
      classifyFcmFailure(400, JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } })),
    ).toBe('invalid');
  });
  it('400 message malformé → error (NE purge PAS le token)', () => {
    expect(
      classifyFcmFailure(400, JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'Invalid value at "message.data"' } })),
    ).toBe('error');
  });
  it('quota / 5xx → error', () => {
    expect(classifyFcmFailure(429, JSON.stringify({ error: { status: 'QUOTA_EXCEEDED' } }))).toBe('error');
    expect(classifyFcmFailure(500, 'Internal Server Error')).toBe('error');
  });
});

describe('send-push — messageForStatus (régression, inchangé)', () => {
  it('statuts notifiables → message', () => {
    expect(messageForStatus('confirmed', 'menage')?.title).toMatch(/confirmée/i);
    expect(messageForStatus('done', 'chef')?.body).toContain('chef à domicile');
  });
  it('pending / inconnu → null', () => {
    expect(messageForStatus('pending', 'menage')).toBeNull();
    expect(messageForStatus('whatever', 'menage')).toBeNull();
  });
});
