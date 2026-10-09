# Deploying TechLead on free plans

There are two ways to go live. The **fast path** takes about 15 minutes: you
create three free accounts, paste three keys into GitHub, and press one
button. A workflow then sets up the database, the web app and the API for you.
The **manual path** below it explains every setting, if you'd rather click
through the dashboards yourself or need to fix something.

## Fast path

1. **Supabase** (database and sign-in): sign up at [supabase.com](https://supabase.com) with GitHub. Then open [Account > Access tokens](https://supabase.com/dashboard/account/tokens), choose **Generate new token**, and copy it.
2. **Vercel** (web app and API hosting): sign up at [vercel.com](https://vercel.com) with GitHub on the free Hobby plan. Then open [Account settings > Tokens](https://vercel.com/account/tokens), create a token with no expiry, and copy it.
3. **Claude API**: at [console.anthropic.com](https://console.anthropic.com), add a payment method and create an API key. This is the only part that costs money: you pay per use.
4. In this repository on GitHub, open **Settings > Secrets and variables > Actions > New repository secret** and add:

   | Name | Value |
   | --- | --- |
   | `SUPABASE_ACCESS_TOKEN` | From step 1 |
   | `VERCEL_TOKEN` | From step 2 |
   | `ANTHROPIC_API_KEY` | From step 3 |
   | `OWNER_EMAIL` (optional) | The email you'll sign in with. If you leave it out, your Vercel account's email is used. |

5. Open **Actions > Go live > Run workflow**. When it finishes, its summary shows the link to your app.
6. Open the link and sign in with your email (you get a sign-in link by email). The first sign-in with the owner email sets up your workspace and makes you its owner. The app then opens on **Setup**, where you describe your work and the AI drafts the rest.

That's it: the worker starts reading your notes every 30 minutes on its own.
Run **Go live** again whenever you want the latest code online; it only changes
what is new.

Later, when you want them:

- **Teams transcripts and Microsoft sign-in:** create the Entra ID app (manual step 4), add `MS_TENANT_ID`, `MS_CLIENT_ID` and `MS_CLIENT_SECRET` as secrets, and run **Go live** again.
- **Jira:** create the Atlassian app (manual step 5), add `JIRA_CLIENT_ID` and `JIRA_CLIENT_SECRET`, run **Go live** again, then use **Connect Jira** in Setup. The callback URL is your API address (shown in the Go live summary) followed by `/integrations/jira/callback`.
- **Region:** the database is created in Frankfurt (`eu-central-1`). To choose another region, set the repository variable `SUPABASE_REGION` before the first run.

# Manual path

## What runs where

| Part | Service | Plan | Notes |
| --- | --- | --- | --- |
| Database, sign-in, file storage | [Supabase](https://supabase.com) | Free | 500 MB database, 1 GB files. Free projects pause after a week with no activity; one click resumes them. |
| Web app (`apps/web`) | [Vercel](https://vercel.com) | Hobby (free) | Deployed by the **Go live** workflow, or by Vercel's Git integration on the manual path. |
| API (`apps/api`) | Vercel | Hobby (free) | A second Vercel project from the same repo. |
| Background jobs (`apps/worker`) | GitHub Actions | Free for public repos | Runs every 30 minutes. |
| iOS app (`apps/mobile`) | Expo Go | Free | Run it on your iPhone during development. |
| AI | Claude API | Pay per use | The only running cost. You bring your own key. |
| Jira, Teams | Atlassian and Microsoft developer apps | Free | Read-only access. |

Two costs are not avoidable: Claude API usage, and an Apple Developer
account (99 USD a year) when you want TestFlight or the App Store. Everything
else stays free while usage is small.

> Keep the GitHub repository public to get unlimited free Actions minutes.
> A private repository gets 2,000 minutes a month, which the worker alone can use up.
> GitHub pauses scheduled workflows after 60 days with no commits; re-enable the Worker under Actions if that happens.

## 1. Supabase: database and sign-in

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard). Pick a region close to you and save the database password.
2. Open **Project Settings > API** and copy the **Project URL**, the **anon** key and the **service_role** key.
3. Apply the schema. Either:
   - open **SQL Editor**, paste each file from `packages/db/supabase/migrations/` in name order, and run it; or
   - use the fast path's **Go live** workflow, which applies them for you.
4. Sign-in with Microsoft: in **Authentication > Providers > Azure**, paste the client ID and secret of the Entra ID app from step 4, and set the URL to `https://login.microsoftonline.com/<tenant-id>/v2.0`.
5. In **Authentication > URL Configuration**, set **Site URL** to your Vercel web URL (step 2) and add these redirect URLs:
   - `techlead://auth-callback` (the installed iPhone app)
   - `exp://**` (the iPhone app while it runs in Expo Go)

## 2. Vercel: web app and API

1. Sign in at [vercel.com](https://vercel.com) with GitHub and choose **Add New > Project** for `MohamedAffess/TechLead`.
2. Web project: set **Root Directory** to `apps/web`. Add the environment variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` (the API URL from the next step) and, once step 4 is done, `NEXT_PUBLIC_MICROSOFT_SIGNIN=true`. Deploy.
3. API project: add the repository again, set **Root Directory** to `apps/api`. Add these environment variables, then deploy:

   | Name | Value |
   | --- | --- |
   | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | From step 1 |
   | `ALLOWED_ORIGINS`, `WEB_URL` | Your web URL, for example `https://techlead-web.vercel.app` |
   | `API_URL` | This API's own URL, for example `https://techlead-api.vercel.app` |
   | `OAUTH_STATE_SECRET` | Any long random text. Run `openssl rand -base64 32` to make one. |
   | `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET` | From step 5. Add them later and redeploy if you don't have them yet. |
4. Open `https://<your-api>.vercel.app/health`. It should answer `{"ok":true}`.

## 3. Make yourself the owner

In the Supabase SQL Editor, store the email you'll sign in with:

```sql
insert into settings (key, value) values ('owner_email', 'you@example.com');
```

The first time that email signs in, the workspace is created and you become its owner.
Team members and guests are added later with [`scripts/bootstrap-owner.sql`](../scripts/bootstrap-owner.sql)'s
second statement, using the role `team` or `guest`.

## 4. Microsoft Entra ID app (sign-in and Teams transcripts)

1. At [entra.microsoft.com](https://entra.microsoft.com), go to **App registrations > New registration**.
2. Redirect URI (Web): `https://<your-supabase-project>.supabase.co/auth/v1/callback`.
3. Under **Certificates & secrets**, create a client secret and copy it.
4. Under **API permissions**, add these Microsoft Graph **delegated** permissions: `openid`, `email`, `profile`, `offline_access`, `Calendars.Read`, `OnlineMeetings.Read` and `OnlineMeetingTranscript.Read.All`. They are all read-only. Your Infor tenant admin may need to grant consent.
5. Sign out of the web app and sign in again. That hands your Teams access to TechLead. The Integrations panel then shows Teams as connected.

Teams only lets you read transcripts of meetings **you organized**, and only when transcription was turned on in the meeting. The worker looks at the last 7 days on its first run, then at every meeting since the previous run.

## 5. Jira Cloud app (read-only)

1. At [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps), create an **OAuth 2.0 integration**.
2. Permissions: Jira API with `read:jira-work` and `read:jira-user` only. Add `offline_access`.
3. Callback URL: `https://<your-api>.vercel.app/integrations/jira/callback`.
4. Copy the client ID and secret into the Vercel API project (step 2) and GitHub (step 6), then redeploy the API.
5. In the web app, open **Integrations**, choose **Connect Jira**, and approve. Back in the app, tick the projects to follow and, if you like, the solution each one feeds. Save.

## 6. GitHub: background worker

In the repository, open **Settings > Secrets and variables > Actions**.

Secrets:

| Name | Value |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | From step 1 |
| `ANTHROPIC_API_KEY` | From [console.anthropic.com](https://console.anthropic.com) |
| `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET` | From step 5 |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | From step 4 (the tenant ID is on the app's Overview page) |
The worker skips itself until these are set. Open **Actions > Worker > Run workflow** once to check it runs.

## 7. iOS app on your iPhone

1. Install **Expo Go** from the App Store.
2. In `apps/mobile/app.json`, under `extra`, set `apiUrl` to your API URL and `supabaseUrl` and `supabaseAnonKey` to the values from step 1. The anon key is safe to ship in an app; row-level security protects the data.
3. Run `pnpm --filter @techlead/mobile start` and scan the QR code with the iPhone camera.
4. Tap **Sign in with Microsoft**. If Supabase says the redirect URL is not allowed, check that `exp://**` is in step 1.5.

## When something breaks

| Symptom | Likely cause |
| --- | --- |
| Web app says Supabase is not configured | The `NEXT_PUBLIC_` variables are missing in the Vercel web project. Redeploy after adding them. |
| API answers 403 "not a member" | You signed in with a different email than the owner email (the `OWNER_EMAIL` secret, your Vercel email, or manual step 3). Sign out and use that email. |
| Go live fails at "Set up Supabase and Vercel projects" | The error line names the problem; most often a token was copied incompletely. Fix the secret and run it again. |
| Everything times out after a quiet week | The free Supabase project paused. Resume it from the dashboard. |
| Worker run fails at "once" | A secret from step 6 is missing; the log names it. |
| Integrations panel says the server is not set up | `SUPABASE_SERVICE_ROLE_KEY`, `OAUTH_STATE_SECRET`, `WEB_URL` or `API_URL` is missing in the Vercel API project. |
| Jira sends you back with "not connected" | The callback URL in the Atlassian app doesn't match `API_URL` + `/integrations/jira/callback`, or the client secret is wrong. |
| Teams shows connected but no transcripts arrive | The meetings were organized by someone else, transcription was off, or the admin hasn't consented to the step 4 permissions. The worker log names each skipped meeting. |
