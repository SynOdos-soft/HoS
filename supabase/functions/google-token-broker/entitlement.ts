export type SubscriptionCheck = 'active' | 'inactive' | 'unavailable' | 'not-required';

interface SubscriptionRow {
  status: string;
  current_period_end: string | null;
}

const isSubscriptionRow = (value: unknown): value is SubscriptionRow => {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.status === 'string' &&
    (row.current_period_end === null || typeof row.current_period_end === 'string');
};

export const isSubscriptionActive = (row: SubscriptionRow, nowMs = Date.now()): boolean => {
  const status = row.status.trim().toLowerCase();
  if (status !== 'active' && status !== 'trialing') return false;
  if (row.current_period_end === null) return true;

  const periodEnd = Date.parse(row.current_period_end);
  return Number.isFinite(periodEnd) && periodEnd > nowMs;
};

/**
 * Verify entitlement through Supabase using the service role, never client
 * claims. Errors and ambiguous database results deny protected broker actions.
 */
export const verifyBrokerSubscription = async (
  action: string | undefined,
  userId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  fetcher: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<SubscriptionCheck> => {
  // Disconnect and status remain available so lapsed users can inspect and
  // revoke a linked account; only creating/renewing Drive access is gated.
  if (action !== 'exchange' && action !== 'token') return 'not-required';
  if (!userId || !supabaseUrl || !serviceRoleKey) return 'unavailable';

  try {
    const endpoint = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/subscriptions`);
    endpoint.searchParams.set('user_id', `eq.${userId}`);
    endpoint.searchParams.set('select', 'status,current_period_end');
    endpoint.searchParams.set('limit', '2');

    const response = await fetcher(endpoint, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!response.ok) return 'unavailable';

    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) return 'unavailable';
    if (rows.length === 0) return 'inactive';
    if (rows.length !== 1 || !isSubscriptionRow(rows[0])) return 'unavailable';

    return isSubscriptionActive(rows[0], nowMs) ? 'active' : 'inactive';
  } catch {
    return 'unavailable';
  }
};
