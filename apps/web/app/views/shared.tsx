import type { Solution, Visibility } from "@techlead/shared";

export function solutionName(solutions: Solution[], id: string | null): string | null {
  return id ? (solutions.find((s) => s.id === id)?.name ?? null) : null;
}

/** Shows who can see a record. Private items only ever reach the owner. */
export function VisibilityTag({ visibility }: { visibility: Visibility }) {
  return <span className={`tag vis-${visibility}`}>{visibility}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="muted empty">{children}</p>;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function errorText(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong.";
}
