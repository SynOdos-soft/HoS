import { describe, it, expect } from 'vitest';
import { evaluateEntitlement, type SubscriptionRow } from './entitlements';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const row = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  status: 'active',
  current_period_end: '2027-09-25T12:00:00Z',
  ...over,
});

describe('evaluateEntitlement', () => {
  it('active plan with future period end grants access', () => {
    const e = evaluateEntitlement(row(), NOW);
    expect(e.active).toBe(true);
    expect(e.reason).toBe('active');
    expect(e.plan).toBe('active');
  });

  it('trialing counts as active', () => {
    const e = evaluateEntitlement(row({ status: 'trialing' }), NOW);
    expect(e.active).toBe(true);
  });

  it('expired period blocks access even with active status', () => {
    const e = evaluateEntitlement(
      row({ current_period_end: '2026-09-25T11:59:59Z' }), // 1s before NOW
      NOW
    );
    expect(e.active).toBe(false);
    expect(e.reason).toBe('expired');
  });

  it('status expired blocks access regardless of period', () => {
    const e = evaluateEntitlement(row({ status: 'expired' }), NOW);
    expect(e.active).toBe(false);
    expect(e.reason).toBe('expired');
  });

  it('unknown inactive statuses block access', () => {
    for (const status of ['past_due', 'canceled', 'unpaid', 'free']) {
      const e = evaluateEntitlement(row({ status }), NOW);
      expect(e.active).toBe(false);
      expect(e.reason).toBe('inactive-status');
    }
  });

  it('missing subscription row = not subscribed', () => {
    const e = evaluateEntitlement(null, NOW);
    expect(e.active).toBe(false);
    expect(e.plan).toBe('free');
    expect(e.reason).toBe('no-subscription');
  });

  it('null period end on an active plan never expires (open-ended plan)', () => {
    const e = evaluateEntitlement(row({ current_period_end: null }), NOW);
    expect(e.active).toBe(true);
  });

  it('boundary: period ending exactly now is expired', () => {
    const e = evaluateEntitlement(
      row({ current_period_end: '2026-09-25T12:00:00Z' }),
      NOW
    );
    expect(e.active).toBe(false);
    expect(e.reason).toBe('expired');
  });
});
