import type { Metadata } from "next";
import ArenaProfileClient from "./page.client";

const ARENA_API_ORIGIN = process.env.ARENA_API_ORIGIN ?? "http://localhost:4000";

async function fetchProfileSummary(handle: string): Promise<{ rating: number } | null> {
  try {
    const res = await fetch(`${ARENA_API_ORIGIN}/api/arena/users/${handle}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { profile?: { rating: number } };
    return data.profile ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const profile = await fetchProfileSummary(handle);
  return {
    title: profile ? `@${handle} — CodeForge Arena Profile | Rating ${profile.rating}` : `@${handle} — CodeForge Arena Profile`,
    description: `${handle}'s competitive programming profile on CodeForge Arena.`,
  };
}

export default function ArenaProfilePage() {
  return <ArenaProfileClient />;
}
