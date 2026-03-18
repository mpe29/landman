# LANDMAN — Claude Session Instructions

These instructions are loaded automatically at the start of every Claude Code session.

## 1. Sync to Latest Main

Always run `git fetch origin && git checkout main && git pull origin main` before branching or making any changes. Never work off a stale local main.

## 2. Environment

Frontend env is at `frontend/.env` — do NOT waste tokens searching for `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, or `VITE_MAPBOX_TOKEN`. They are already there. To run locally: `cd frontend && npm run dev`.

## 3. Supabase

- **Project ref**: `scpcloowqevurdmuogio`
- Edge functions deploy with: `supabase functions deploy <name> --no-verify-jwt --project-ref scpcloowqevurdmuogio`
- JWT verification is OFF for the `ingest` function (TTN webhooks use `INGEST_SECRET`, not Supabase JWT)

## 4. Architecture Constraints

- **Multi-property, multi-user schema**: all queries must respect `property_memberships` and RLS. Never assume a single property or single user.
- Use `user_has_property_access(property_id)` for RLS policies. Use `user_is_property_admin(property_id)` for admin-only operations.
- All new DB functions must use `SET search_path = public`.
- All `SECURITY DEFINER` functions need explicit `SET search_path`.
- Storage buckets are PRIVATE unless there is a specific reason. Use signed URLs.
- Generate thumbnails for any image features — never serve full-res for small displays.

## 5. Security Checklist (Before PR)

- New tables have RLS enabled with appropriate policies
- New functions have `SET search_path = public`
- No secrets in client code
- Profile/sensitive data gated by ownership or admin access
- Consider what Supabase Security Advisor and Vercel deployment logs would flag
- When creating `CREATE OR REPLACE FUNCTION`, ensure no stale overloads with different parameter types linger in the DB

## 6. Frontend Patterns

- React with plain CSS-in-JS (style objects), no Tailwind
- Mapbox GL JS for map rendering
- `api` object in `frontend/src/api/index.js` for all Supabase calls
- Panels slide in from the right, consistent with existing UI
- Device dots: green (GPS devices), purple pulsing circles (gateways/routing)

## 7. IoT / Ingest Context

- TTN (The Things Network) webhooks POST to the `ingest` edge function
- SenseCAP T1000-E uses newer codec with `fix_tech` / `device_type` fields
- GPS coordinates may be in `decoded_payload` OR `uplink_message.locations.frm-payload`
- The `location_solved` webhook is handled separately from uplink messages
- The `devices_update_last_seen` trigger uses `COALESCE` to preserve last known GPS on heartbeat-only readings

## 8. Branching & Commits

- Always `git fetch origin` before creating a new branch
- Never pressure commits after a rejection — wait for the user
- Commit messages should summarise the "why", not just the "what"
- Include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` on all commits
