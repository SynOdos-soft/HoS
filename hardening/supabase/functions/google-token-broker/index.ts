// Edge Function: google-token-broker
//
// Exchanges a Google OAuth authorization code (PKCE) for tokens, stores the
// refresh token server-side (keyed to the Supabase user), and hands out fresh
// Google access tokens so the PWA can talk to Google Drive AppData without a
// human re-consenting. This is what makes Drive syncing fully automatic.
//
// Security model:
//  - verify_jwt = true: only authenticated Supabase sessions may call it.
//  - The refresh token NEVER leaves the server; clients get short-lived
//    access tokens only.
//  - One refresh token row per (user, client). Revoking deletes the row and
//    revokes the token at Google.
//
// Env: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured as Edge
// Function secrets. OAuth credentials are never read from the application DB.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isAllowedOrigin, parseAllowedOrigins } from "./cors.ts";
import { requireGoogleClientCredentials } from "./credentials.ts";
import { decryptRefreshToken, encryptRefreshToken, isEncryptedRefreshToken } from "./tokenCrypto.ts";

const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS"));
const TOKEN_ENCRYPTION_KEY = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY") ?? "";

const GOOGLE_AUTH_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

interface TokenRow {
  user_id: string;
  provider: string;
  refresh_token: string;
  scope: string;
  created_at: string;
  updated_at: string;
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!isAllowedOrigin(origin, ALLOWED_ORIGINS)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function fail(message: string, status = 400, extra: Record<string, unknown> = {}, origin: string | null = null): Response {
  return json({ error: message, ...extra }, status, origin);
}

/** Best-effort admin REST call via SERVICE_ROLE_KEY. Returns null when unavailable. */
async function adminFromEnv(): Promise<string | null> {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

async function dbUrl(): Promise<string> {
  // Supabase injects SUPABASE_URL into edge functions.
  return Deno.env.get("SUPABASE_URL") ?? "";
}

async function getTokenRow(userId: string): Promise<TokenRow | null> {
  const url = `${await dbUrl()}/rest/v1/google_tokens?user_id=eq.${userId}&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: (await adminFromEnv()) ?? "",
      Authorization: `Bearer ${await adminFromEnv()}`,
    },
  });
  if (!res.ok) return null;
  const rows: TokenRow[] = await res.json();
  if (rows.length === 0) return null;

  const row = rows[0];
  const storedToken = row.refresh_token;
  row.refresh_token = await decryptRefreshToken(storedToken, TOKEN_ENCRYPTION_KEY);

  // Existing rows are plaintext from before encryption was enabled. Migrate
  // them lazily when read, using the same upsert path as new OAuth grants.
  if (!isEncryptedRefreshToken(storedToken)) {
    const migrated = await upsertTokenRow({
      user_id: row.user_id,
      provider: row.provider,
      refresh_token: row.refresh_token,
      scope: row.scope,
    });
    if (!migrated) throw new Error("Could not migrate legacy Google token to encrypted storage");
  }

  return row;
}

async function upsertTokenRow(row: Omit<TokenRow, "created_at" | "updated_at">): Promise<boolean> {
  const url = `${await dbUrl()}/rest/v1/google_tokens?on_conflict=user_id`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: (await adminFromEnv()) ?? "",
      Authorization: `Bearer ${await adminFromEnv()}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      ...row,
      refresh_token: await encryptRefreshToken(row.refresh_token, TOKEN_ENCRYPTION_KEY),
      updated_at: new Date().toISOString(),
    }),
  });
  return res.ok;
}

async function deleteTokenRow(userId: string): Promise<boolean> {
  const url = `${await dbUrl()}/rest/v1/google_tokens?user_id=eq.${userId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      apikey: (await adminFromEnv()) ?? "",
      Authorization: `Bearer ${await adminFromEnv()}`,
    },
  });
  return res.ok;
}

/** Exchange an authorization code for Google tokens. */
async function exchangeCode(code: string, codeVerifier: string, redirectUri: string) {
  const { id, secret } = requireGoogleClientCredentials(
    Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
    Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
  );
  const res = await fetch(GOOGLE_AUTH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  return { ok: res.ok, data: await res.json() };
}

/** Refresh an existing Google refresh token into a fresh access token. */
async function refreshAccessToken(refreshToken: string) {
  const { id, secret } = requireGoogleClientCredentials(
    Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
    Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
  );
  const res = await fetch(GOOGLE_AUTH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: id,
      client_secret: secret,
      grant_type: "refresh_token",
    }),
  });
  return { ok: res.ok, data: await res.json() };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  // Only configured browser origins may use the broker. Requests without an
  // Origin can still be made by non-browser clients, but never receive CORS.
  if (origin !== null && !isAllowedOrigin(origin, ALLOWED_ORIGINS)) {
    return fail("Origin not allowed", 403);
  }

  // Browser preflight must pass before any POST can happen.
  if (req.method === "OPTIONS") {
    if (!isAllowedOrigin(origin, ALLOWED_ORIGINS)) return fail("Origin not allowed", 403);
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") return fail("POST only", 405, {}, origin);

  // Resolve the calling user from their Supabase JWT (x-supabase-auth style).
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return fail("Missing bearer token", 401, {}, origin);
  const supabaseJwt = authHeader.slice("Bearer ".length);

  // Decode JWT claims without verification — verification is already done by
  // the platform (verify_jwt = true). We only need the `sub` claim.
  let userId = "";
  try {
    const payload = JSON.parse(atob(supabaseJwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    userId = payload.sub;
  } catch {
    return fail("Invalid token", 401, {}, origin);
  }
  if (!userId) return fail("Invalid token", 401, {}, origin);

  let body: { action?: string; code?: string; codeVerifier?: string; redirectUri?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body", 400, {}, origin);
  }

  try {
    switch (body.action) {
      // ---- Step 1 of the handshake: swap the auth code for tokens ----
      case "exchange": {
        if (!body.code || !body.codeVerifier || !body.redirectUri) {
          return fail("code, codeVerifier and redirectUri are required", 400, {}, origin);
        }
        const { ok, data } = await exchangeCode(body.code, body.codeVerifier, body.redirectUri);
        if (!ok) {
          return fail("Google token exchange failed", 502, { googleError: data }, origin);
        }
        await upsertTokenRow({
          user_id: userId,
          provider: "google",
          refresh_token: data.refresh_token,
          scope: data.scope ?? "",
        });
        return json({
          accessToken: data.access_token,
          expiresInSeconds: data.expires_in,
          scope: data.scope,
        }, 200, origin);
      }

      // ---- Step 2: silent refresh for background sync ----
      case "token": {
        const row = await getTokenRow(userId);
        if (!row) return fail("No Google connection for this user", 404, {}, origin);
        const { ok, data } = await refreshAccessToken(row.refresh_token);
        if (!ok) {
          const desc = (data as { error?: string }).error ?? "";
          if (desc === "invalid_grant") {
            // Refresh token revoked/expired at Google: drop our row. The user
            // must reconnect.
            await deleteTokenRow(userId);
            return fail("Google authorization revoked — reconnect required", 401, { reconnect: true }, origin);
          }
          return fail("Google token refresh failed", 502, { googleError: data }, origin);
        }
        return json({
          accessToken: data.access_token,
          expiresInSeconds: data.expires_in,
          scope: data.scope ?? row.scope,
        }, 200, origin);
      }

      // ---- Disconnect: revoke at Google and forget the row ----
      case "revoke": {
        const row = await getTokenRow(userId);
        if (row) {
          await fetch(GOOGLE_REVOKE_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token: row.refresh_token }),
          }).catch(() => {});
          await deleteTokenRow(userId);
        }
        return json({ ok: true }, 200, origin);
      }

      // ---- Status: is Google connected? ----
      case "status": {
        const row = await getTokenRow(userId);
        return json({ connected: !!row, scope: row?.scope ?? null }, 200, origin);
      }

      default:
        return fail("Unknown action", 400, {}, origin);
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500, {}, origin);
  }
});
