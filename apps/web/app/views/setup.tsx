"use client";
import type { ProfileDraft } from "@techlead/api-client";
import { useState } from "react";
import { api } from "../../lib/clients";
import type { Desk } from "../dashboard";
import { Integrations } from "./integrations";
import { errorText } from "./shared";

/** Owner setup: the company context that personalizes the AI, solutions, notes and integrations. */
export function SetupView({ desk, reload }: { desk: Desk; reload: () => Promise<void> }) {
  const [companyName, setCompanyName] = useState(desk.workspace.companyName);
  const [aboutMe, setAboutMe] = useState("");
  const [profile, setProfile] = useState(desk.workspace.profile);
  const [focus, setFocus] = useState(desk.workspace.focus);
  const [suggested, setSuggested] = useState<ProfileDraft["solutions"]>([]);
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const firstRun = !desk.workspace.profile.trim();

  async function draft() {
    setBusy("draft");
    setMessage(null);
    try {
      const d = await api.draftProfile({ companyName, aboutMe });
      setProfile(d.profile);
      setFocus(d.focus);
      const existing = new Set(desk.solutions.map((s) => s.name.toLowerCase()));
      setSuggested(d.solutions.filter((s) => !existing.has(s.name.toLowerCase())));
      setMessage("Here is a draft. Edit anything that's wrong, then save.");
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    try {
      await api.updateWorkspace({ companyName, profile, focus });
      setMessage("Saved. Every suggestion from now on uses this context.");
      await reload();
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function addSolution(s: { name: string; summary: string }) {
    try {
      await api.createSolution({ name: s.name, summary: s.summary, health: "green", phase: "discovery", visibility: "team" });
      setSuggested((list) => list.filter((x) => x.name !== s.name));
      await reload();
    } catch (err) {
      setMessage(errorText(err));
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Company and focus</h2>
        <p className="muted">
          {firstRun
            ? "Start here. Tell the AI where you work and what you lead; it uses this to judge what matters in your meetings and Jira."
            : "This context shapes every suggestion the AI makes."}
        </p>
        {message && <p className="notice">{message}</p>}
        <label className="field">
          <span>Company</span>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </label>
        <label className="field">
          <span>About your work (for the AI draft)</span>
          <textarea
            rows={4}
            value={aboutMe}
            onChange={(e) => setAboutMe(e.target.value)}
            placeholder="For example: I lead three solutions in the CloudSuite platform team and act as architect. This quarter I'm focused on…"
          />
        </label>
        <div className="row">
          <button onClick={() => void draft()} disabled={busy !== null || aboutMe.trim().length < 20}>
            {busy === "draft" ? "Drafting…" : "Draft with AI"}
          </button>
          <span className="muted small">The AI only drafts. Nothing is saved until you press Save.</span>
        </div>
        <label className="field">
          <span>Company profile</span>
          <textarea rows={7} value={profile} onChange={(e) => setProfile(e.target.value)} />
        </label>
        <label className="field">
          <span>Your current focus</span>
          <textarea rows={3} value={focus} onChange={(e) => setFocus(e.target.value)} />
        </label>
        <div className="row">
          <button className="primary" onClick={() => void save()} disabled={busy !== null || !companyName.trim()}>
            {busy === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      <Solutions desk={desk} suggested={suggested} onAdd={addSolution} />
      <Note desk={desk} />
      <Integrations solutions={desk.solutions} />
    </>
  );
}

function Solutions({ desk, suggested, onAdd }: { desk: Desk; suggested: ProfileDraft["solutions"]; onAdd: (s: { name: string; summary: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  return (
    <section className="panel">
      <h2>Solutions you lead</h2>
      {desk.solutions.length > 0 && (
        <ul className="list">
          {desk.solutions.map((s) => (
            <li key={s.id} className="row">
              <strong>{s.name}</strong> <span className="muted">{s.phase} · {s.health}</span> <span className="muted small">{s.summary}</span>
            </li>
          ))}
        </ul>
      )}
      {suggested.map((s) => (
        <div key={s.name} className="row">
          <span className="tag">suggested</span> <strong>{s.name}</strong> <span className="muted small grow">{s.summary}</span>
          <button onClick={() => void onAdd(s)}>Add</button>
        </div>
      ))}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void onAdd({ name: name.trim(), summary: "" }).then(() => setName(""));
        }}
      >
        <input aria-label="Solution name" placeholder="Add a solution" value={name} onChange={(e) => setName(e.target.value)} className="grow" />
        <button type="submit">Add</button>
      </form>
    </section>
  );
}

/** Paste meeting notes or a transcript by hand; the AI reads it on its next run. */
function Note({ desk }: { desk: Desk }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [solutionId, setSolutionId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <section className="panel">
      <h2>Add notes for the AI</h2>
      <p className="muted">Paste meeting notes or a transcript. The background job reads it within 30 minutes and puts suggestions in your review inbox.</p>
      {message && <p className="notice">{message}</p>}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          api
            .addNote({ title, text, solutionId: solutionId || null })
            .then(() => {
              setTitle("");
              setText("");
              setMessage("Queued for the AI.");
            })
            .catch((err) => setMessage(errorText(err)));
        }}
      >
        <div className="row">
          <input aria-label="Note title" placeholder="Title, for example: Architecture sync 9 Oct" value={title} onChange={(e) => setTitle(e.target.value)} className="grow" required />
          <select aria-label="Solution" value={solutionId} onChange={(e) => setSolutionId(e.target.value)}>
            <option value="">Any solution</option>
            {desk.solutions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <textarea aria-label="Notes" rows={6} value={text} onChange={(e) => setText(e.target.value)} required />
        <div className="row">
          <button className="primary" type="submit">
            Send to the AI
          </button>
        </div>
      </form>
    </section>
  );
}
