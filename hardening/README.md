# Google token broker hardening

This folder is an archive of an earlier snapshot of the broker hardening. It does **not** include the later server-side subscription gate and must not be copied over the active function. The canonical source and tests are in the root `supabase/functions/google-token-broker/` and `src/utils/` paths referenced below.

## What changed

- Browser CORS is restricted to exact origins in the `ALLOWED_ORIGINS` Edge Function secret.
- Google OAuth credentials are read only from Edge Function secrets, not the `app_secrets` database table.
- Google refresh tokens are encrypted at rest in `public.google_tokens` using AES-GCM. `GOOGLE_TOKEN_ENCRYPTION_KEY` remains only in Supabase Edge Function secrets.
- Existing plaintext refresh-token rows are converted to encrypted rows the first time the broker reads them after this code is deployed. New tokens are stored encrypted.
- The active root function source gates Google Drive token exchange and refresh with a server-side subscription check; disconnect and connection-status checks stay available. This gate trusts the `subscriptions` table as its source of truth, so it is only effective if client roles cannot write subscription rows. The table's RLS/write policies have not been verified in this workspace.
- Regression tests cover origin matching, secret validation, token encryption/decryption, and server-side entitlement decisions.

## Secrets required in Supabase

In the HoS project, open **Edge Functions → Secrets** and verify these custom secrets exist:

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Existing Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Existing Google OAuth client secret |
| `ALLOWED_ORIGINS` | Exact app origin, e.g. `https://hos.synodos.app` |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Strong random key generated once and retained securely |

Do not put secret values in Git, this folder, screenshots, or chat. Do not rotate or delete `GOOGLE_TOKEN_ENCRYPTION_KEY` after tokens have been encrypted unless you first implement a key-rotation migration; old ciphertext cannot be read with a different key.

## Repeat deployment using the Supabase dashboard

The dashboard editor deploys its own current contents; it does **not** automatically read files from this repository. To repeat the deployment without a terminal:

1. Verify the four secrets above in **Edge Functions → Secrets**. The broker also needs the platform-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; do not expose either service-role value to the browser. Keep the old `app_secrets` rows until the broker is confirmed working.
2. Open **Edge Functions → Functions → `google-token-broker` → Code**.
3. In the file list, create or replace `cors.ts` with `supabase/functions/google-token-broker/cors.ts` from the active source tree.
4. Create or replace `credentials.ts` with `supabase/functions/google-token-broker/credentials.ts`.
5. Create or replace `tokenCrypto.ts` with `supabase/functions/google-token-broker/tokenCrypto.ts`.
6. Create `entitlement.ts` with `supabase/functions/google-token-broker/entitlement.ts`.
7. Replace `index.ts` with `supabase/functions/google-token-broker/index.ts`.
8. Review that `index.ts` imports all four helper files and reads the required secrets. Then click **Deploy updates**.
9. Open `https://hos.synodos.app`, confirm a currently subscribed account can sync and check Supabase function logs for errors. Also confirm an unsubscribed account cannot obtain a Drive token, but can still inspect or revoke its connection.
10. Once confirmed, the obsolete `GOOGLE_CLIENT_SECRET` row was removed from `app_secrets`; do not remove `GOOGLE_CLIENT_ID` unless verified unused.

## Local verification

From the repository root, run:

```sh
npm test
npx tsc -b --pretty false
```

The dashboard deployment was reported as successful and Drive sync was reported as working. This README is an operational record; it does not itself deploy code.
