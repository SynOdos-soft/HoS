import { describe, expect, it } from 'vitest';
import { requireGoogleClientCredentials } from '../../supabase/functions/google-token-broker/credentials';

describe('Google token broker credentials', () => {
  it('returns credentials supplied by the Edge Function environment', () => {
    expect(requireGoogleClientCredentials('client-id', 'client-secret')).toEqual({
      id: 'client-id',
      secret: 'client-secret',
    });
  });

  it('fails closed when either credential is missing', () => {
    expect(() => requireGoogleClientCredentials('', 'client-secret')).toThrow(/Edge Function secrets/);
    expect(() => requireGoogleClientCredentials('client-id', '')).toThrow(/Edge Function secrets/);
  });
});
