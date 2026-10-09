# TechLead

An open-source, AI-driven workspace for technical leads and architects who
run several solutions at once. It reads your Teams meeting transcripts, your
notes and your Jira projects, proposes tasks, decisions, risks and team
status updates, and keeps nothing until you accept it.

- **Web and iOS** from one TypeScript codebase.
- **Read-only AI**: it never writes to Jira or Teams.
- **Role-based sharing**: your private items stay private; team members and guests get their own views, enforced by the database.
- **Free to host**: Supabase, Vercel and GitHub Actions free plans. Claude API usage is the only running cost.

Architecture diagrams: [TechLead AI: architecture](https://claude.ai/code/artifact/1ada6e23-1b42-4a68-a77f-bac48f529e42).

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js web app |
| `apps/mobile` | Expo (React Native) iOS app |
| `apps/api` | Hono API, deployed as a Vercel function |
| `apps/worker` | Background jobs: Jira sync and AI extraction, run by GitHub Actions |
| `packages/shared` | Record types and the access rules |
| `packages/db` | Supabase schema, row-level security, database clients |
| `packages/ai` | Prompts and Claude calls |
| `packages/sync` | Read-only Jira and Microsoft Graph clients, transcript parsing |
| `packages/api-client` | Typed client used by web and iOS |
| `prototype/` | The first single-page prototype |

## Run it locally

Requirements: Node 22, pnpm 10, and Postgres 15+ binaries for the database checks.

```bash
pnpm install
cp .env.example .env   # fill in Supabase and Claude keys
pnpm build
pnpm --filter @techlead/api dev    # API on http://localhost:8787
pnpm --filter @techlead/web dev    # web on http://localhost:3000
```

Checks:

```bash
pnpm typecheck
pnpm test
pnpm db:test   # migrations and row-level security against a throwaway Postgres
```

## Deploy

The [fast path](docs/DEPLOYMENT.md#fast-path) takes about 15 minutes: create
free Supabase and Vercel accounts, add three keys as GitHub secrets, and run the
**Go live** workflow. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) also covers every
setting by hand.

## License

[MIT](LICENSE)
