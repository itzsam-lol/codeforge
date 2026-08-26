import type { Metadata } from "next";
import ArenaLeaderboardClient from "./page.client";

export const metadata: Metadata = {
  title: "Global Leaderboard — CodeForge Arena",
  description: "See the top-rated competitors on CodeForge Arena, ranked by rating across all contests.",
};

export default function ArenaLeaderboardPage() {
  return <ArenaLeaderboardClient />;
}
