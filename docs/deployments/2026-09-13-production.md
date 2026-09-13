# 2026-09-13 production release

User authorized deploying the current CrowdSift changes directly to main in the existing checkout.

## Scope

- Refreshed landing, Comment Inbox, YouTube connection and comment policy UI.
- Shared sample/direct-input preview cards with live classification reasons.
- Updated classification contexts, Inbox filters and channel collection cycles.
- Existing repository cleanup and QA artifacts included with the current working state.

## Verification

- `npm run lint`: passed.
- `npm run test`: 826 passed, 4 skipped (143 passed test files, 4 skipped).
- `npm run build`: passed; all 21 routes generated.
- `supabase test db --local`: 213 passed across 17 SQL suites.
- Updated two stale UI expectations to the approved heading and 1100px stacked layout.
- Isolated the dashboard scanner test from existing local data within its rolled-back transaction.
- Only `.env.example` is tracked; populated environment files remain ignored.

## Production database

Verified the public production client points to project `irposxqmcyluzgezmqxz`.
Applied through the authenticated Supabase connector, in this order:

1. `20260913081429_channel_sync_hourly_cycle.sql`
2. `20260913081442_inbox_feed_filters.sql`
3. `20260913081458_youtube_connection_collection_stats.sql`

The connector assigned deployment timestamps. SQL files were renamed to these actual versions. Production migration history was preserved: an attempted metadata-only version normalization was rejected by automatic approval review and was not retried. Only local test migration metadata was aligned to the renamed files; no application data was reset.

New RPCs were checked for role permissions: no anonymous execution; worker entry points are service-role-only; client entry points retain membership checks. Security advisor warnings for the new authenticated entry points correspond to their intended guarded RPC access. Existing warnings about older RPC privileges, the vector extension and Auth configuration predate this release and were not changed.

The older production migration history uses legacy version labels; do not blindly run a full CLI database push without reconciling that historical baseline first.

## Hosting

Vercel project `junyoung-codes-projects/crowd-sift` explicitly lists main as its production branch and `www.crowdsift.cloud` as its production domain.
