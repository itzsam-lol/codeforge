import type { Metadata } from "next";
import ArenaLandingClient from "./page.client";

export const metadata: Metadata = {
  title: "CodeForge Arena — Competitive Coding Platform",
  description:
    "Compete in rated coding contests, climb the global leaderboard, and practice problems anytime on CodeForge Arena.",
};

export default function ArenaLandingPage() {
  return <ArenaLandingClient />;
}
