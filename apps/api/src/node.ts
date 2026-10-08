// Local development server: `pnpm --filter @techlead/api dev`
import { serve } from "@hono/node-server";
import { dbConfigFromEnv } from "@techlead/db";
import { createApp } from "./app.js";
import { supabaseMembers } from "./members.js";

const app = createApp({ resolveMember: supabaseMembers(dbConfigFromEnv()) });
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`TechLead API on http://localhost:${port}`);
