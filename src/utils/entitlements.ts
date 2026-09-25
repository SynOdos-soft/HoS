import { supabase } from './supabaseClient';

export interface SubscriptionRow {
  status: string;
  current_period_end: string | null;
}

export interface Entitlement {
  plan: string;
  active: boolean;
  periodEnd: string | null;
  reason: 'active' | 'expired' | 'no-subscription' | 'inactive-status' | 'error';
}

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/**
 * Pure evaluation of a subscription row. Exported for unit tests — no I/O.
 * Rules: status must be active/trialing AND, when a period end exists, it
 * must be in the future. A missing row = not subscribed.
 */
export const evaluateEntitlement = (row: SubscriptionRow | null | undefined, nowMs = Date.now()): Entitlement => {
  if (!row) {
    return { plan: 'free', active: false, periodEnd: null, reason: 'no-subscription' };
  }
  const plan = (row.status || 'free').toLowerCase();
  const periodEnd = row.current_period_end;
  if (!ACTIVE_STATUSES.has(plan)) {
    return {
      plan,
      active: false,
      periodEnd,
      reason: plan === 'expired' ? 'expired' : 'inactive-status',
    };
  }
  const endMs = periodEnd ? Date.parse(periodEnd) : null;
  if (endMs !== null && endMs <= nowMs) {
    return { plan, active: false, periodEnd, reason: 'expired' };
  }
  return { plan, active: true, periodEnd, reason: 'active' };
};

/**
 * Fetch + evaluate the calling user's subscription. Returns a synthetic
 * error entitlement on query failure (deny-by-default).
 */
export const fetchEntitlement = async (userId: string): Promise<Entitlement> => {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    return { plan: 'free', active: false, periodEnd: null, reason: 'error' };
  }
  return evaluateEntitlement(data as SubscriptionRow | null);
};
