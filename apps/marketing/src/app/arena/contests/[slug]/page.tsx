import type { Metadata } from "next";
import ContestDetailClient from "./page.client";

const ARENA_API_ORIGIN = process.env.ARENA_API_ORIGIN ?? "http://localhost:4000";

async function fetchContestTitle(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`${ARENA_API_ORIGIN}/api/arena/contests/${slug}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return data.title ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const title = await fetchContestTitle(slug);
  return {
    title: title ? `${title} — CodeForge Arena Contest` : "Contest — CodeForge Arena",
    description: title ? `Compete in "${title}" on CodeForge Arena.` : "A rated coding contest on CodeForge Arena.",
  };
}

export default function ArenaContestDetailPage() {
  return <ContestDetailClient />;
}
