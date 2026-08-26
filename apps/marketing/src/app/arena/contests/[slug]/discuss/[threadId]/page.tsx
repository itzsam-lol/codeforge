"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pin } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/arena/Markdown";
import { ApiError, arenaApi } from "@/lib/arenaApi";
import { useArenaAuth } from "@/lib/arenaAuthContext";

interface ThreadDetail {
  id: string;
  title: string;
  bodyMd: string;
  pinned: boolean;
  createdAt: string;
  authorHandle: string;
  authorName: string;
  contestSlug: string | null;
}

interface Reply {
  id: string;
  bodyMd: string;
  createdAt: string;
  authorHandle: string;
  authorName: string;
}

export default function ArenaForumThreadPage() {
  const { slug, threadId } = useParams<{ slug: string; threadId: string }>();
  const router = useRouter();
  const { user } = useArenaAuth();
  const { data, error, mutate } = useSWR<{ thread: ThreadDetail; replies: Reply[] }>(
    `/api/arena/threads/${threadId}`,
    arenaApi
  );
  const [replyBody, setReplyBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  async function postReply() {
    if (!user) {
      router.push("/arena/auth/login");
      return;
    }
    setPosting(true);
    setPostError(null);
    try {
      await arenaApi(`/api/arena/threads/${threadId}/replies`, { method: "POST", body: { bodyMd: replyBody } });
      setReplyBody("");
      mutate();
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : "Could not post this reply");
    } finally {
      setPosting(false);
    }
  }

  if (error) {
    return <p className="px-6 py-24 text-center text-sm text-rose-400">This thread couldn&apos;t be found.</p>;
  }
  if (!data) {
    return <p className="px-6 py-24 text-center text-sm text-slate-500">Loading…</p>;
  }

  return (
    <section className="px-6 py-20">
      <Reveal className="mx-auto max-w-3xl">
        <Link href={`/arena/contests/${slug}/discuss`} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
          <ArrowLeft className="size-3.5" /> Back to discussion
        </Link>

        <div className="mt-4 flex items-center gap-2">
          {data.thread.pinned ? <Pin className="size-4 text-accent-soft" /> : null}
          <h1 className="text-2xl font-semibold text-white">{data.thread.title}</h1>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          by {data.thread.authorName} (@{data.thread.authorHandle}) · {new Date(data.thread.createdAt).toLocaleString()}
        </p>
        <div className="prose prose-invert prose-sm mt-4 max-w-none rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-slate-300">
          <Markdown>{data.thread.bodyMd}</Markdown>
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {data.replies.length} repl{data.replies.length === 1 ? "y" : "ies"}
        </h2>
        <div className="mt-3 space-y-3">
          {data.replies.map((r) => (
            <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs text-slate-500">
                {r.authorName} (@{r.authorHandle}) · {new Date(r.createdAt).toLocaleString()}
              </p>
              <div className="prose prose-invert prose-sm mt-2 max-w-none text-slate-300">
                <Markdown>{r.bodyMd}</Markdown>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            rows={4}
            placeholder={user ? "Write a reply (markdown supported)…" : "Log in to reply"}
            aria-label="Reply body"
            className="w-full rounded-md bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          {postError ? <p className="text-sm text-rose-400">{postError}</p> : null}
          <Button disabled={posting || !replyBody.trim()} onClick={postReply}>
            {posting ? "Posting…" : "Post reply"}
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
