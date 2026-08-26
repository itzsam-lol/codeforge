"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { MessageSquare, Pin } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import { ApiError, arenaApi } from "@/lib/arenaApi";
import { useArenaAuth } from "@/lib/arenaAuthContext";

interface ThreadRow {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  authorHandle: string;
  authorName: string;
  replyCount: number;
}

export default function ArenaContestDiscussPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useArenaAuth();
  const { data, error } = useSWR<{ threads: ThreadRow[] }>(`/api/arena/contests/${slug}/threads`, arenaApi);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  async function post() {
    if (!user) {
      router.push("/arena/auth/login");
      return;
    }
    setPosting(true);
    setPostError(null);
    try {
      const res = await arenaApi<{ thread: { id: string } }>(`/api/arena/contests/${slug}/threads`, {
        method: "POST",
        body: { title, bodyMd },
      });
      router.push(`/arena/contests/${slug}/discuss/${res.thread.id}`);
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : "Could not post this thread");
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="px-6 py-20">
      <Reveal className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="Arena" title="Discussion" tone="dark" subtitle="Talk through the problems with other competitors." />

        <div className="mt-6 flex justify-end">
          <Button size="lg" onClick={() => setShowNew((v) => !v)}>
            {showNew ? "Cancel" : "New thread"}
          </Button>
        </div>

        {showNew ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Thread title"
              className="w-full rounded-md bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
            <textarea
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              rows={6}
              placeholder="Write your post (markdown supported)…"
              className="w-full rounded-md bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
            {postError ? <p className="text-sm text-rose-400">{postError}</p> : null}
            <Button disabled={posting || !title.trim() || !bodyMd.trim()} onClick={post}>
              {posting ? "Posting…" : "Post thread"}
            </Button>
          </div>
        ) : null}

        <div className="mt-8 divide-y divide-white/10 rounded-2xl border border-white/10">
          {error ? (
            <p className="p-6 text-center text-sm text-rose-400">
              {error instanceof ApiError ? error.message : "Could not load discussion threads"}
            </p>
          ) : !data ? (
            <p className="p-6 text-center text-sm text-slate-500">Loading…</p>
          ) : data.threads.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No threads yet — start the conversation.</p>
          ) : (
            data.threads.map((t) => (
              <Link
                key={t.id}
                href={`/arena/contests/${slug}/discuss/${t.id}`}
                className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-white/[0.03]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {t.pinned ? <Pin className="size-3.5 shrink-0 text-accent-soft" /> : null}
                    <span className="truncate text-sm font-medium text-white">{t.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    by {t.authorName} · {new Date(t.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
                  <MessageSquare className="size-3.5" /> {t.replyCount}
                </span>
              </Link>
            ))
          )}
        </div>
      </Reveal>
    </section>
  );
}
