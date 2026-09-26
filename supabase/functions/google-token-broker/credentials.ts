export function requireGoogleClientCredentials(
  clientId: string,
  clientSecret: string,
): { id: string; secret: string } {
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured as Edge Function secrets');
  }
  return { id: clientId, secret: clientSecret };
}
