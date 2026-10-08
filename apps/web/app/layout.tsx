import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TechLead",
  description: "Solutions, tasks, decisions and team status for technical leads.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
