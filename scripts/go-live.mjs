#!/usr/bin/env node
// Sets up and updates the hosted TechLead on free plans, so nobody has to click
// through dashboards. Run by .github/workflows/go-live.yml in two phases:
//
//   node scripts/go-live.mjs prepare   Supabase project, schema, auth settings,
//                                      Vercel projects and their environment variables
//   node scripts/go-live.mjs finish    checks the live URLs and writes the job summary
//
// Needs SUPABASE_ACCESS_TOKEN and VERCEL_TOKEN. Everything else is optional.
// Safe to run again: each step looks for what already exists first.
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = process.env;
const phase = process.argv[2];
const owner = (env.GITHUB_REPOSITORY_OWNER ?? "me").toLowerCase().replace(/[^a-z0-9-]/g, "-");
const names = { supabase: "techlead", web: `techlead-web-${owner}`, api: `techlead-api-${owner}` };
const region = env.SUPABASE_REGION || "eu-central-1";

function need(name) {
  if (!env[name]) throw new Error(`${name} is missing. Add it under Settings > Secrets and variables > Actions.`);
  return env[name];
}
const mask = (value) => value && console.log(`::add-mask::${value}`);
const output = (key, value) => env.GITHUB_OUTPUT && appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
const summary = (text) => (env.GITHUB_STEP_SUMMARY ? appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`) : console.log(text));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(base, token, method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(`${method} ${path} failed with ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// --- Supabase (Management API) -------------------------------------------------

const sb = (method, path, body) => call("https://api.supabase.com", need("SUPABASE_ACCESS_TOKEN"), method, path, body);

async function ensureSupabaseProject() {
  const projects = await sb("GET", "/v1/projects");
  let project = projects.find((p) => p.name === names.supabase);
  if (!project) {
    const [org] = await sb("GET", "/v1/organizations");
    if (!org) throw new Error("Your Supabase account has no organization. Create one at supabase.com/dashboard, then run this again.");
    console.log(`Creating Supabase project "${names.supabase}" in ${region}…`);
    // The database password is never needed afterwards (schema changes go through the
    // Management API); it can be reset from the Supabase dashboard if ever wanted.
    project = await sb("POST", "/v1/projects", {
      name: names.supabase,
      organization_id: org.id,
      region,
      db_pass: randomBytes(24).toString("base64url"),
    });
  }
  const ref = project.id ?? project.ref;
  for (let i = 0; i < 60; i++) {
    const p = await sb("GET", `/v1/projects/${ref}`);
    if (p.status === "ACTIVE_HEALTHY") return ref;
    if (p.status === "INACTIVE" || p.status === "PAUSED") {
      throw new Error(`The Supabase project is paused. Resume it at https://supabase.com/dashboard/project/${ref}, then run this again.`);
    }
    console.log(`Waiting for Supabase to finish starting (${p.status})…`);
    await sleep(10_000);
  }
  throw new Error("Supabase took more than 10 minutes to start. Run this again in a few minutes.");
}

async function supabaseKeys(ref) {
  const keys = await sb("GET", `/v1/projects/${ref}/api-keys?reveal=true`);
  // Older projects have JWT "anon" and "service_role" keys; newer ones have publishable and secret keys. Either works.
  const anon = keys.find((k) => k.name === "anon")?.api_key ?? keys.find((k) => k.type === "publishable")?.api_key;
  const service = keys.find((k) => k.name === "service_role")?.api_key ?? keys.find((k) => k.type === "secret")?.api_key;
  if (!anon || !service) throw new Error("Could not read the Supabase anon and service_role keys.");
  mask(anon);
  mask(service);
  return { url: `https://${ref}.supabase.co`, anon, service };
}

const sql = (ref, query) => sb("POST", `/v1/projects/${ref}/database/query`, { query });

/** Applies migrations that have not run yet, in name order, each once. */
async function migrate(ref) {
  await sql(ref, "create table if not exists public.techlead_migrations (name text primary key, applied_at timestamptz not null default now());");
  await sql(ref, "alter table public.techlead_migrations enable row level security;");
  const done = new Set((await sql(ref, "select name from public.techlead_migrations;")).map((r) => r.name));
  const dir = "packages/db/supabase/migrations";
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    console.log(`Applying ${file}`);
    const body = readFileSync(`${dir}/${file}`, "utf8");
    await sql(ref, `begin;\n${body}\ninsert into public.techlead_migrations (name) values ('${file}');\ncommit;`);
  }
}

async function setOwnerEmail(ref, email) {
  if (!email) return;
  const quoted = email.trim().toLowerCase().replace(/'/g, "''");
  await sql(ref, `insert into public.settings (key, value) values ('owner_email', '${quoted}') on conflict (key) do update set value = excluded.value;`);
}

async function configureAuth(ref, webUrl) {
  const microsoft = Boolean(env.MS_CLIENT_ID && env.MS_CLIENT_SECRET && env.MS_TENANT_ID);
  await sb("PATCH", `/v1/projects/${ref}/config/auth`, {
    site_url: webUrl,
    uri_allow_list: [`${webUrl}/**`, "techlead://auth-callback", "exp://**"].join(","),
    ...(microsoft
      ? {
          external_azure_enabled: true,
          external_azure_client_id: env.MS_CLIENT_ID,
          external_azure_secret: env.MS_CLIENT_SECRET,
          external_azure_url: `https://login.microsoftonline.com/${env.MS_TENANT_ID}/v2.0`,
        }
      : {}),
  });
  return microsoft;
}

// --- Vercel (REST API) -----------------------------------------------------------

let teamQuery = "";
const vc = (method, path, body) => {
  const sep = path.includes("?") ? "&" : "?";
  return call("https://api.vercel.com", need("VERCEL_TOKEN"), method, teamQuery ? `${path}${sep}${teamQuery}` : path, body);
};

async function vercelAccount() {
  const { user } = await vc("GET", "/v2/user");
  if (user.defaultTeamId) teamQuery = `teamId=${user.defaultTeamId}`;
  return { email: user.email, orgId: user.defaultTeamId ?? user.id };
}

async function ensureVercelProject(name, rootDirectory, framework) {
  try {
    return await vc("GET", `/v9/projects/${name}`);
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  console.log(`Creating Vercel project ${name}`);
  return vc("POST", "/v11/projects", { name, rootDirectory, framework });
}

/** The project's production address: its first vercel.app domain, or the default one before the first deploy. */
async function productionUrl(project) {
  try {
    const { domains } = await vc("GET", `/v9/projects/${project.id}/domains`);
    const own = domains?.find((d) => !d.redirect && d.name.endsWith(".vercel.app")) ?? domains?.find((d) => !d.redirect);
    if (own) return `https://${own.name}`;
  } catch {
    // No domains yet: fall through to the default.
  }
  return `https://${project.name}.vercel.app`;
}

async function setEnv(project, vars) {
  const entries = Object.entries(vars)
    .filter(([, value]) => value)
    .map(([key, value]) => ({ key, value, type: "encrypted", target: ["production", "preview"] }));
  await vc("POST", `/v10/projects/${project.id}/env?upsert=true`, entries);
}

// --- Phases -------------------------------------------------------------------------

async function prepare() {
  const account = await vercelAccount();
  const ownerEmail = env.OWNER_EMAIL || account.email;

  const ref = await ensureSupabaseProject();
  const keys = await supabaseKeys(ref);
  await migrate(ref);
  await setOwnerEmail(ref, ownerEmail);

  const web = await ensureVercelProject(names.web, "apps/web", "nextjs");
  const api = await ensureVercelProject(names.api, "apps/api", null);
  const webUrl = await productionUrl(web);
  const apiUrl = await productionUrl(api);
  const microsoft = await configureAuth(ref, webUrl);

  // A stable secret for signing the Jira sign-in round trip, derived so reruns keep it.
  const stateSecret = env.OAUTH_STATE_SECRET || (await import("node:crypto")).createHash("sha256").update(`${keys.service}:oauth-state`).digest("base64url");
  mask(stateSecret);

  await setEnv(web, {
    NEXT_PUBLIC_SUPABASE_URL: keys.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: keys.anon,
    NEXT_PUBLIC_API_URL: apiUrl,
    NEXT_PUBLIC_MICROSOFT_SIGNIN: microsoft ? "true" : "false",
  });
  await setEnv(api, {
    SUPABASE_URL: keys.url,
    SUPABASE_ANON_KEY: keys.anon,
    SUPABASE_SERVICE_ROLE_KEY: keys.service,
    ALLOWED_ORIGINS: webUrl,
    WEB_URL: webUrl,
    API_URL: apiUrl,
    OAUTH_STATE_SECRET: stateSecret,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    JIRA_CLIENT_ID: env.JIRA_CLIENT_ID,
    JIRA_CLIENT_SECRET: env.JIRA_CLIENT_SECRET,
  });

  output("org_id", account.orgId);
  output("web_project_id", web.id);
  output("api_project_id", api.id);
  output("web_url", webUrl);
  output("api_url", apiUrl);
  output("owner_email", ownerEmail);
  console.log(`Ready to deploy: web ${webUrl}, API ${apiUrl}`);
}

async function finish() {
  await vercelAccount();
  const web = await vc("GET", `/v9/projects/${names.web}`);
  const api = await vc("GET", `/v9/projects/${names.api}`);
  const webUrl = await productionUrl(web);
  const apiUrl = await productionUrl(api);
  // If Vercel gave a different address than expected (name taken), point the apps at the real ones.
  const moved = webUrl !== env.EXPECTED_WEB_URL || apiUrl !== env.EXPECTED_API_URL;
  if (moved) {
    console.log(`Addresses changed to ${webUrl} and ${apiUrl}; updating settings.`);
    await setEnv(web, { NEXT_PUBLIC_API_URL: apiUrl });
    await setEnv(api, { ALLOWED_ORIGINS: webUrl, WEB_URL: webUrl, API_URL: apiUrl });
    const ref = (await sb("GET", "/v1/projects")).find((p) => p.name === names.supabase).id;
    await configureAuth(ref, webUrl);
  }
  output("redeploy", moved ? "true" : "false");

  let health = "not reachable";
  try {
    const res = await fetch(`${apiUrl}/health`);
    health = res.ok ? "ok" : `HTTP ${res.status}`;
  } catch (err) {
    health = err.message;
  }
  summary(`## TechLead is live\n`);
  summary(`- **Open the app:** ${webUrl}`);
  summary(`- API health check: ${health}${moved ? " (addresses changed; a second deploy runs next)" : ""}`);
  summary(`- Sign in with **${env.OWNER_EMAIL || "your Vercel account email"}** to become the owner.`);
  summary(`- Teams import: ${env.MS_CLIENT_ID ? "on" : "off until the Microsoft secrets are added (docs/DEPLOYMENT.md, step 4)"}`);
  summary(`- Jira: ${env.JIRA_CLIENT_ID ? "on" : "off until the Jira secrets are added (docs/DEPLOYMENT.md, step 5)"}`);
}

/** For the worker: prints the Supabase settings as KEY=value lines for $GITHUB_ENV. */
async function workerEnv() {
  const project = (await sb("GET", "/v1/projects")).find((p) => p.name === names.supabase);
  if (!project) throw new Error("No Supabase project yet. Run the Go live workflow first.");
  const keys = await supabaseKeys(project.id);
  appendFileSync(need("GITHUB_ENV"), `SUPABASE_URL=${keys.url}\nSUPABASE_ANON_KEY=${keys.anon}\nSUPABASE_SERVICE_ROLE_KEY=${keys.service}\n`);
}

const phases = { prepare, finish, "worker-env": workerEnv };
if (!phases[phase]) {
  console.error(`Usage: node scripts/go-live.mjs ${Object.keys(phases).join("|")}`);
  process.exit(2);
}
phases[phase]().catch((err) => {
  console.error(`::error::${err.message}`);
  process.exit(1);
});
