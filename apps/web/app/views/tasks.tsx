"use client";
import { Priority, TaskStatus, type Task } from "@techlead/shared";
import { useState } from "react";
import { api } from "../../lib/clients";
import type { Desk } from "../dashboard";
import { Empty, errorText, solutionName, today, VisibilityTag } from "./shared";

const COLUMNS: { status: Task["status"]; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "doing", label: "Doing" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];

export function TasksView({ desk, reload, defaultSolutionId }: { desk: Desk; reload: () => Promise<void>; defaultSolutionId: string | null }) {
  const owner = desk.me.role === "owner";
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("P2");
  const [due, setDue] = useState("");

  const move = (t: Task, status: Task["status"]) => api.setTaskStatus(t.id, status).then(reload).catch((err) => setError(errorText(err)));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api.createTask({ title: title.trim(), priority, due: due || null, solutionId: defaultSolutionId });
      setTitle("");
      setDue("");
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  // Team members can move their own tasks; the database refuses the rest.
  const canMove = (t: Task) => owner || (desk.me.role === "team" && t.ownerMemberId === desk.me.id);

  return (
    <section className="panel">
      <h2>Tasks</h2>
      {error && <p className="notice">{error}</p>}
      {owner && (
        <form className="row" onSubmit={add}>
          <input aria-label="New task" placeholder="Add a task (private until you share it)" value={title} onChange={(e) => setTitle(e.target.value)} className="grow" />
          <select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])}>
            {Priority.options.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <button className="primary" type="submit">
            Add
          </button>
        </form>
      )}
      {desk.tasks.length === 0 ? (
        <Empty>No tasks yet. Accept suggestions from the review inbox, or add one above.</Empty>
      ) : (
        <div className="board">
          {COLUMNS.map((col) => {
            const items = desk.tasks.filter((t) => t.status === col.status);
            return (
              <div key={col.status} className="column">
                <h3>
                  {col.label} <span className="muted">{items.length}</span>
                </h3>
                {items.map((t) => (
                  <article key={t.id} className={`card${t.due && t.due < today() && t.status !== "done" ? " late" : ""}`}>
                    <div className="row">
                      <span className={`tag ${t.priority === "P1" ? "warn" : ""}`}>{t.priority}</span>
                      <VisibilityTag visibility={t.visibility} />
                      {t.jiraKey && <span className="muted">{t.jiraKey}</span>}
                    </div>
                    <p>{t.title}</p>
                    <div className="row muted small">
                      {solutionName(desk.solutions, t.solutionId) ?? "No solution"}
                      {t.due && <span>· due {t.due}</span>}
                    </div>
                    {canMove(t) && (
                      <select aria-label={`Status of ${t.title}`} value={t.status} onChange={(e) => void move(t, e.target.value as Task["status"])}>
                        {TaskStatus.options.map((s) => (
                          <option key={s} value={s}>
                            {COLUMNS.find((c) => c.status === s)?.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </article>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
