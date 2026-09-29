// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { isSubscriptionActive, verifyBrokerSubscription } from '../../supabase/functions/google-token-broker/entitlement';

const NOW = Date.parse('2026-09-29T12:00:00Z');
const URL = 'https://project.example';
const KEY = 'service-role-test-key';

const response = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
const check = (fetcher: typeof fetch, action = 'token') => verifyBrokerSubscription(action, 'user-1', URL, KEY, fetcher, NOW);

describe('server-side subscription entitlement', () => {
  it('accepts active/trialing rows with a future end or no end', () => {
    expect(isSubscriptionActive({ status: 'active', current_period_end: '2026-10-01T00:00:00Z' }, NOW)).toBe(true);
    expect(isSubscriptionActive({ status: 'trialing', current_period_end: null }, NOW)).toBe(true);
  });

  it('rejects inactive statuses, expired periods, and malformed dates', () => {
    expect(isSubscriptionActive({ status: 'canceled', current_period_end: null }, NOW)).toBe(false);
    expect(isSubscriptionActive({ status: 'active', current_period_end: '2026-09-29T12:00:00Z' }, NOW)).toBe(false);
    expect(isSubscriptionActive({ status: 'active', current_period_end: 'not-a-date' }, NOW)).toBe(false);
  });

  it('returns active only for one valid active subscription row', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response([{ status: 'active', current_period_end: '2026-10-01T00:00:00Z' }])
    );
    await expect(check(fetcher as typeof fetch)).resolves.toBe('active');

    const [input, init] = fetcher.mock.calls[0];
    const request = new globalThis.URL(String(input));
    expect(request.searchParams.get('user_id')).toBe('eq.user-1');
    expect(request.searchParams.get('limit')).toBe('2');
    const headers = new Headers(init?.headers);
    expect(headers.get('apikey')).toBe(KEY);
    expect(headers.get('Authorization')).toBe(`Bearer ${KEY}`);
  });

  it('denies missing or inactive subscriptions', async () => {
    await expect(check(async () => response([]))).resolves.toBe('inactive');
    await expect(check(async () => response([{ status: 'canceled', current_period_end: null }]))).resolves.toBe('inactive');
  });

  it('fails closed when entitlement cannot be verified', async () => {
    await expect(check(async () => response({}, 500))).resolves.toBe('unavailable');
    await expect(check(async () => response([{ status: 'active', current_period_end: null }, { status: 'active', current_period_end: null }]))).resolves.toBe('unavailable');
    await expect(check(async () => { throw new Error('network down'); })).resolves.toBe('unavailable');
    await expect(verifyBrokerSubscription('token', 'user-1', URL, '', fetch, NOW)).resolves.toBe('unavailable');
  });

  it('does not block status or revoke from an inactive or unavailable subscription', async () => {
    const fetcher = vi.fn(async () => response([]));
    await expect(check(fetcher, 'status')).resolves.toBe('not-required');
    await expect(check(fetcher, 'revoke')).resolves.toBe('not-required');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
