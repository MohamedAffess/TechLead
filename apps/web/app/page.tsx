import { Dashboard } from "./dashboard";

export default function Home() {
  return (
    <main>
      <header className="top">
        <strong className="brand">TechLead</strong>
        <span className="muted">Architect&apos;s desk</span>
      </header>
      <Dashboard />
    </main>
  );
}
