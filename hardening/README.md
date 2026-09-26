# Google token broker hardening

This folder is an archive of the local source and tests for the broker hardening performed in this workspace. It is **not** the active Supabase function deployment directory; the active function source remains under `supabase/functions/google-token-broker/`.

## What changed

- Browser CORS is restricted to exact origins in the `ALLOWED_ORIGINS` Edge Function secret.
- Google OAuth credentials are read only from Edge Function secrets, not the `app_secrets` database table.
- Google refresh tokens are encrypted at rest in `public.google_tokens` using AES-GCM. `GOOGLE_TOKEN_ENCRYPTION_KEY` remains only in Supabase Edge Function secrets.
- Existing plaintext refresh-token rows are converted to encrypted rows the first time the broker reads them after this code is deployed. New tokens are stored encrypted.
- Regression tests cover origin matching, secret validation, and token encryption/decryption.

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

1. Verify the four secrets above in **Edge Functions → Secrets**. Keep the old `app_secrets` rows until the broker is confirmed working.
2. Open **Edge Functions → Functions → `google-token-broker` → Code**.
3. In the file list, create or replace `cors.ts` with `supabase/functions/google-token-broker/cors.ts` from the active source tree.
4. Create or replace `credentials.ts` with `supabase/functions/google-token-broker/credentials.ts`.
5. Create or replace `tokenCrypto.ts` with `supabase/functions/google-token-broker/tokenCrypto.ts`.
6. Replace `index.ts` with `supabase/functions/google-token-broker/index.ts`.
7. Review that `index.ts` imports all three helper files and reads all four secrets. Then click **Deploy updates**.
8. Open `https://hos.synodos.app`, confirm Drive sync succeeds, and check Supabase function logs for errors.
9. Once confirmed, the obsolete `GOOGLE_CLIENT_SECRET` row was removed from `app_secrets`; do not remove `GOOGLE_CLIENT_ID` unless verified unused.

## Local verification

From the repository root, run:

```sh
npm test
npx tsc -b --pretty false
```

The dashboard deployment was reported as successful and Drive sync was reported as working. This README is an operational record; it does not itself deploy code.
