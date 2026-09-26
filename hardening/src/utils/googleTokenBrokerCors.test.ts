import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, parseAllowedOrigins } from '../../supabase/functions/google-token-broker/cors';

describe('Google token broker CORS allowlist', () => {
  it('matches only exact configured origins', () => {
    const allowed = parseAllowedOrigins('https://app.example.com, http://localhost:5173 ');

    expect(isAllowedOrigin('https://app.example.com', allowed)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173', allowed)).toBe(true);
    expect(isAllowedOrigin('https://app.example.com.attacker.test', allowed)).toBe(false);
    expect(isAllowedOrigin('https://attacker.test', allowed)).toBe(false);
    expect(isAllowedOrigin(null, allowed)).toBe(false);
  });

  it('trusts no browser origins when the allowlist is unset', () => {
    const allowed = parseAllowedOrigins(undefined);

    expect(allowed.size).toBe(0);
    expect(isAllowedOrigin('https://app.example.com', allowed)).toBe(false);
  });
});
