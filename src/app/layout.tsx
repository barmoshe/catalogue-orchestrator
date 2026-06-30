import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "catalogue-orchestrator",
  description:
    "Local-first, domain-agnostic AI video orchestrator: catalogue + intent -> AI-planned EDL -> deterministic ffmpeg cut.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
