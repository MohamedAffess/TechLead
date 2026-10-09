# Contributing

Thanks for helping. A few rules keep the project safe to run with real company data.

- **Access rules live in two places that must agree**: `packages/shared/src/access.ts` (what the UI shows) and the row-level security policies in `packages/db/supabase/migrations` (what the database allows). Change both, and add a check to `packages/db/test/rls.sql`.
- **Integrations stay read-only.** Jira and Microsoft Graph code only reads. Any write needs an issue and a discussion first.
- **The AI proposes, people decide.** Nothing the AI produces becomes a record without an owner accepting it.
- **New migrations** get a new timestamped file; never edit one that has been merged.
- Run `pnpm typecheck && pnpm test && pnpm db:test` before opening a pull request.
