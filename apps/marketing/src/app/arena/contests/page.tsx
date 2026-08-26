import type { Metadata } from "next";
import ArenaContestsListClient from "./page.client";

export const metadata: Metadata = {
  title: "Contests — CodeForge Arena",
  description: "Browse upcoming, live, and past rated coding contests on CodeForge Arena.",
};

export default function ArenaContestsListPage() {
  return <ArenaContestsListClient />;
}
