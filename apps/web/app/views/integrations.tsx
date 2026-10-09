"use client";
import type { IntegrationStatus, JiraProjectChoice } from "@techlead/api-client";
import type { Solution } from "@techlead/shared";
import { useEffect, useState } from "react";
import { api } from "../../lib/clients";

const JIRA_RESULT: Record<string, string> = {
  connected: "Jira is connected. Pick the projects to follow below.",
  denied: "Jira was not connected: the sign-in was cancelled or took too long.",
  "no-site": "Jira was not connected: your Atlassian account has no Jira site.",
  error: "Jira was not connected: Atlassian refused the sign-in. Check the client ID and secret.",
};

/** Owner-only settings: connect Jira, choose its projects, and check the Teams connection. */
export function Integrations({ solutions }: { solutions: Solution[] }) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [projects, setProjects] = useState<JiraProjectChoice[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const s = await api.integrations();
      setStatus(s);
      if (s.jira.connected) setProjects(await api.jiraProjects());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load integrations.");
    }
  }

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("jira");
    if (result) {
      setMessage(JIRA_RESULT[result] ?? null);
      window.history.replaceState(null, "", window.location.pathname);
    }
    void load();
  }, []);

  async function connectJira() {
    const { url } = await api.jiraConnectUrl();
    window.location.assign(url);
  }

  async function saveProjects() {
    if (!projects) return;
    setSaving(true);
    try {
      await api.saveJiraProjects(projects.filter((p) => p.selected).map((p) => ({ key: p.key, solutionId: p.solutionId })));
      setMessage("Saved. The next background run picks up issues from these projects.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const update = (key: string, patch: Partial<JiraProjectChoice>) =>
    setProjects((ps) => ps?.map((p) => (p.key === key ? { ...p, ...patch } : p)) ?? null);

  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Integrations</h2>
      {message && <p className="notice">{message}</p>}
      {!status ? (
        <p className="muted">Checking connections…</p>
      ) : (
        <>
          <div className="row">
            <strong>Jira</strong>
            {status.jira.connected ? (
              <>
                <span className="muted">connected to {status.jira.site}, read-only</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => api.disconnect("jira").then(() => { setProjects(null); return load(); })}>Disconnect</button>
              </>
            ) : status.jira.available ? (
              <>
                <span className="muted">not connected</span>
                <span style={{ flex: 1 }} />
                <button className="primary" onClick={() => void connectJira()}>Connect Jira</button>
              </>
            ) : (
              <span className="muted">the server has no Jira app yet (see docs/DEPLOYMENT.md, step 5)</span>
            )}
          </div>

          {projects && (
            <div className="projects">
              {projects.length === 0 && <p className="muted">Your Jira account can't see any projects.</p>}
              {projects.map((p) => (
                <label key={p.key} className="row">
                  <input type="checkbox" checked={p.selected} onChange={(e) => update(p.key, { selected: e.target.checked })} />
                  <span>
                    <strong>{p.key}</strong> {p.name}
                  </span>
                  <span style={{ flex: 1 }} />
                  <select
                    value={p.solutionId ?? ""}
                    disabled={!p.selected}
                    onChange={(e) => update(p.key, { solutionId: e.target.value || null })}
                    aria-label={`Solution for ${p.key}`}
                  >
                    <option value="">Any solution (AI decides)</option>
                    {solutions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {projects.length > 0 && (
                <div className="row">
                  <button className="primary" disabled={saving} onClick={() => void saveProjects()}>
                    {saving ? "Saving…" : "Save projects"}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="row">
            <strong>Teams</strong>
            <span className="muted">
              {status.microsoft.connected
                ? status.microsoft.lastSyncedAt
                  ? `connected, last checked ${new Date(status.microsoft.lastSyncedAt).toLocaleString()}`
                  : "connected, waiting for the first background run"
                : "sign out and in again with Microsoft to connect"}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
