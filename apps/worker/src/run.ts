// One pass of background work. GitHub Actions runs this on a schedule
// (.github/workflows/worker.yml), so no always-on server is needed.
import { dbConfigFromEnv, serviceClient } from "@techlead/db";
import { processSources } from "./jobs/processSources.js";
import { syncJira } from "./jobs/syncJira.js";
import { syncTeams } from "./jobs/syncTeams.js";

const db = serviceClient(dbConfigFromEnv());

const queued = await syncJira(db, { clientId: process.env.JIRA_CLIENT_ID, clientSecret: process.env.JIRA_CLIENT_SECRET });
console.log(`Jira: ${queued} issues queued`);

const transcripts = await syncTeams(db, {
  tenantId: process.env.MS_TENANT_ID,
  clientId: process.env.MS_CLIENT_ID,
  clientSecret: process.env.MS_CLIENT_SECRET,
});
console.log(`Teams: ${transcripts} transcripts queued`);

const processed = await processSources(db);
console.log(`AI: ${processed} sources processed`);
