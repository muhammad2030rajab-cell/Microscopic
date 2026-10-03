# Security & stability changes

- `src/lib/auth/server.ts`: logs (and `verify.server.ts` throws a clear error) when `BETTER_AUTH_SECRET` or `DATABASE_URL` is missing on Vercel; removed the `https://*.vercel.app` trusted-origin wildcard (own Vercel hosts are added automatically); HTTP sign-up is allowed only until the first platform admin exists.
- Google Drive connect/callback: restricted to platform admins, `state` cookie check, redirect URI derived from `BETTER_AUTH_URL`/request origin (no hard-coded domain). Add `<your-domain>/api/google-drive/callback` to the Google OAuth client's authorized redirect URIs.
- `/lab` shows a retry screen instead of looping to `/login`; `/lab/setup` refreshes data after saving, validates required fields with a clear message, and shows owner-only message for staff.
- "كيف يتم التحليل" (`/methods`) is its own menu item and the only place where method notes are edited (removed from the catalog list).

- Platform settings (`/admin/settings`, super admin only): support WhatsApp number (login page) and a platform-wide announcement banner shown on every lab page, with an optional expiry date (Cairo time). Table: `platform_settings` (migration 0018).
