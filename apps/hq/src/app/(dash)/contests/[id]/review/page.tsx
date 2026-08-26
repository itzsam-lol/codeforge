"use client";

import { useState } from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import { hqApi, ApiError } from "@/lib/api";
import { Button, Card, EmptyState, ErrorNote, Spinner, StatusBadge } from "@/components/ui";
import { ConfirmDialog } from "@/components/Modal";
import { useToast } from "@/components/Toast";

interface Flag {
  severity: number;
  reason: string;
  confidence: number;
  snapshotKey: string;
  presignedUrl: string | null;
  createdAt: string;
}

interface ReviewParticipant {
  userId: string;
  handle: string;
  name: string;
  reviewStatus: string;
  chosenProctoringLevel: string;
  flags: Flag[];
}

export default function ContestReviewPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, error, mutate } = useSWR<{ participants: ReviewParticipant[] }>(
    `/api/contests/${id}/review-data`,
    hqApi
  );
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);

  async function decide(userId: string, decision: "clean" | "cheating_confirmed") {
    setBusyUserId(userId);
    try {
      await hqApi(`/api/contests/${id}/participants/${userId}/review`, { method: "POST", body: { decision } });
      toast.toast(decision === "clean" ? "Marked clean" : "Cheating confirmed — rating reverted");
      mutate();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not record decision", "error");
    } finally {
      setBusyUserId(null);
      setConfirmingUserId(null);
    }
  }

  const loadError = error instanceof ApiError ? error.message : error ? "Could not load review data" : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-headline-md text-on-surface">AI Proctoring Review</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          Only participants with at least one AI-flagged snapshot appear here.
        </p>
      </div>

      {loadError ? (
        <ErrorNote message={loadError} />
      ) : !data ? (
        <Spinner />
      ) : data.participants.length === 0 ? (
        <Card className="p-8">
          <EmptyState title="Nothing flagged" hint="No AI-flagged snapshots for this contest, or Cloud Vision isn't configured." />
        </Card>
      ) : (
        <div className="space-y-3">
          {data.participants.map((p) => (
            <Card key={p.userId} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-on-surface">{p.name}</span>
                    <span className="text-xs text-on-surface-variant">@{p.handle}</span>
                    <StatusBadge status={p.reviewStatus} />
                  </div>
                  <p className="mt-0.5 text-xs text-on-surface-variant">
                    Proctoring level: {p.chosenProctoringLevel} · {p.flags.length} flag{p.flags.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyUserId === p.userId || p.reviewStatus === "clean"}
                    onClick={() => decide(p.userId, "clean")}
                  >
                    Mark clean
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busyUserId === p.userId || p.reviewStatus === "cheating_confirmed"}
                    onClick={() => setConfirmingUserId(p.userId)}
                  >
                    Confirm cheating
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {p.flags.map((f, i) => (
                  <div key={i} className="overflow-hidden rounded-container border border-outline-variant">
                    {f.presignedUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.presignedUrl} alt={f.reason} className="h-28 w-full object-cover" />
                    ) : (
                      <div className="flex h-28 items-center justify-center bg-surface-container text-xs text-on-surface-variant">
                        Image unavailable
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-xs font-medium text-on-surface">{f.reason}</p>
                      <p className="text-[10px] text-on-surface-variant">
                        {Math.round(f.confidence * 100)}% confidence · {new Date(f.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmingUserId !== null}
        title="Confirm cheating?"
        body="This reverts the participant's rating for this contest, zeroes their score/rank, and removes any badges earned in it. This cannot be undone automatically."
        confirmLabel="Confirm cheating"
        danger
        busy={busyUserId === confirmingUserId}
        onConfirm={() => confirmingUserId && decide(confirmingUserId, "cheating_confirmed")}
        onCancel={() => setConfirmingUserId(null)}
      />
    </div>
  );
}
