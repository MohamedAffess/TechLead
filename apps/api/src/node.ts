// Local development server: `pnpm --filter @techlead/api dev`
import { serve } from "@hono/node-server";
import { dbConfigFromEnv } from "@techlead/db";
import { draftCompanyProfile } from "@techlead/ai";
import { createApp } from "./app.js";
import { supabaseMembers } from "./members.js";
import { integrationsFromEnv } from "./tokens.js";

const config = dbConfigFromEnv();
const app = createApp({
  resolveMember: supabaseMembers(config),
  integrations: integrationsFromEnv(config),
  draftProfile: process.env.ANTHROPIC_API_KEY ? (input) => draftCompanyProfile(input) : undefined,
});
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`TechLead API on http://localhost:${port}`);
