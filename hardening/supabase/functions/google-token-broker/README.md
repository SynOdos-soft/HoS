# Archived function source

These files are copies of the broker hardening source at the time this archive was created. The canonical working/deployment source is `supabase/functions/google-token-broker/` at the repository root.

To restore this archived snapshot into the active source tree, copy these four files into `supabase/functions/google-token-broker/`:

- `index.ts`
- `cors.ts`
- `credentials.ts`
- `tokenCrypto.ts`

Then follow `hardening/README.md` for required secrets, tests, and dashboard deployment. Do not deploy an archived copy without first checking that it matches the current active source.
