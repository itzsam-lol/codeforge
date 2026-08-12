"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { hqApi, ApiError } from "@/lib/api";
import { Button, Card, ErrorNote, Field, Input, Select, Spinner, StatusBadge, Textarea } from "@/components/ui";
import { Tabs, TabList, Tab as TabItem, TabPanel } from "@/components/Tabs";
import { fmtDateTime } from "@/lib/format";
import { ProvisioningPanel } from "./ProvisioningPanel";
import { BillingPanel } from "./BillingPanel";

interface Activity {
  id: string;
  type: "note" | "status_change" | "system";
  body: string;
  createdAt: string;
  author: { name: string } | null;
}

interface ProvisioningTargetSummary {
  id: string;
  host: string;
  sshPort: number;
  sshUsername: string;
  sshKeyFingerprint: string;
  repoUrl: string;
  appDomain: string;
  mediaDomain: string;
  updatedAt: string;
}

interface Invoice {
  id: string;
  amountCents: number;
  status: "draft" | "sent" | "paid" | "overdue";
  dueDate: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface ClientDetail {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  status: "lead" | "trial" | "live" | "churned";
  notes: string | null;
  mrrCents: number | null;
  nextRenewalDate: string | null;
  activities: Activity[];
  invoices: Invoice[];
  provisioningTarget: ProvisioningTargetSummary | null;
  latestHealthCheck: { healthy: boolean; checkedAt: string } | null;
}

const STATUSES = ["lead", "trial", "live", "churned"] as const;

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "provisioning">("overview");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // GET /:id caps this at the 20 most recent (see client.routes.ts) since it
  // otherwise grows unbounded — extra pages are appended here as loaded.
  const [moreActivities, setMoreActivities] = useState<Activity[]>([]);
  const [activitiesHasMore, setActivitiesHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const reload = useCallback(async () => {
    try {
      const d = await hqApi<{ client: ClientDetail }>(`/api/clients/${params.id}`);
      setClient(d.client);
      setMoreActivities([]);
      setActivitiesHasMore(d.client.activities.length === 20);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load this client");
    }
  }, [params.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function loadMoreActivities() {
    if (!client) return;
    setLoadingMore(true);
    try {
      const skip = client.activities.length + moreActivities.length;
      const d = await hqApi<{ activities: Activity[]; hasMore: boolean }>(
        `/api/clients/${params.id}/activities?skip=${skip}`
      );
      setMoreActivities((prev) => [...prev, ...d.activities]);
      setActivitiesHasMore(d.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  async function changeStatus(status: string) {
    setError(null);
    try {
      await hqApi(`/api/clients/${params.id}`, { method: "PUT", body: { status } });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status");
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await hqApi(`/api/clients/${params.id}/activities`, { method: "POST", body: { body: note.trim() } });
      setNote("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the note");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorNote message={loadError} />;
  if (!client) return <Spinner />;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-headline-md text-on-surface">{client.companyName}</h1>
          <StatusBadge status={client.status} />
          {client.latestHealthCheck ? (
            <span
              className={`inline-flex items-center gap-1.5 text-xs ${client.latestHealthCheck.healthy ? "text-ok" : "text-bad"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${client.latestHealthCheck.healthy ? "bg-ok" : "bg-bad"}`} />
              {client.latestHealthCheck.healthy ? "Healthy" : "Unreachable"} · checked{" "}
              {fmtDateTime(client.latestHealthCheck.checkedAt)}
            </span>
          ) : null}
          <a
            href={`/status/${params.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-accent hover:text-accent-hover"
          >
            View status page →
          </a>
        </div>
        <p className="mt-1 text-sm text-on-surface-variant">
          {client.contactName} · {client.contactEmail}
          {client.contactPhone ? ` · ${client.contactPhone}` : ""}
        </p>
      </div>

      <Tabs value={tab} onChange={(v) => setTab(v as typeof tab)}>
        <TabList>
          <TabItem value="overview">Overview</TabItem>
          <TabItem value="provisioning">Provisioning</TabItem>
        </TabList>
        <div className="mt-5">
          <TabPanel value="overview">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-on-surface">Activity</h3>
                {error ? (
                  <div className="mt-3">
                    <ErrorNote message={error} />
                  </div>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <Textarea
                    rows={2}
                    placeholder="Add a note…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="flex-1"
                  />
                  <Button disabled={busy} onClick={() => void addNote()}>
                    {busy ? "Saving…" : "Add"}
                  </Button>
                </div>
                <div className="mt-4 space-y-3">
                  {client.activities.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">No activity yet.</p>
                  ) : (
                    [...client.activities, ...moreActivities].map((a) => (
                      <div key={a.id} className="pb-3">
                        <div className="flex items-center justify-between text-xs text-on-surface-variant">
                          <span>{a.author?.name ?? "System"}</span>
                          <span>{fmtDateTime(a.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-sm text-on-surface">{a.body}</p>
                      </div>
                    ))
                  )}
                  {activitiesHasMore ? (
                    <button
                      onClick={() => void loadMoreActivities()}
                      disabled={loadingMore}
                      className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  ) : null}
                </div>
              </Card>

              <div className="space-y-5">
                <Card className="space-y-4 p-5">
                  <Field label="Status">
                    <Select value={client.status} onChange={(e) => void changeStatus(e.target.value)}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s[0].toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {client.notes ? (
                    <div>
                      <span className="mb-1 block text-xs font-medium text-on-surface-variant">Notes</span>
                      <p className="whitespace-pre-wrap text-sm text-on-surface">{client.notes}</p>
                    </div>
                  ) : null}
                </Card>

                <BillingPanel
                  clientId={client.id}
                  mrrCents={client.mrrCents}
                  nextRenewalDate={client.nextRenewalDate}
                  invoices={client.invoices}
                  onChanged={reload}
                />
              </div>
            </div>
          </TabPanel>

          <TabPanel value="provisioning">
            <ProvisioningPanel clientId={client.id} target={client.provisioningTarget} onTargetSaved={reload} />
          </TabPanel>
        </div>
      </Tabs>
    </div>
  );
}
