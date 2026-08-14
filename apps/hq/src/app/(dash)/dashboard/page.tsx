"use client";

import { type ReactNode } from "react";
import useSWR from "swr";
import Link from "next/link";
import { hqApi, ApiError } from "@/lib/api";
import { Badge, Card, EmptyState, ErrorNote, Spinner, StatusBadge } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { fmtDateTime, titleCase } from "@/lib/format";
import {
  IconActivity,
  IconAlert,
  IconBuilding,
  IconDollar,
  IconServer,
  IconTicket,
  IconTrendingUp,
  IconUsers,
} from "@/components/icons";

interface Stats {
  totalClients: number;
  clientCounts: Record<"lead" | "trial" | "live" | "churned", number>;
  mrrCents: number;
  renewingSoon: number;
  leadCounts: Record<"new" | "contacted" | "qualified" | "converted" | "dismissed", number>;
  newLeads30d: number;
  openTickets: number;
  activeStaff: number;
  deploymentsMonitored: number;
  deploymentsUnreachable: number;
  deploymentsTotal: number;
}

interface Renewal {
  id: string;
  companyName: string;
  nextRenewalDate: string;
  mrrCents: number | null;
  status: string;
}

interface RecentLead {
  id: string;
  name: string;
  company: string;
  status: string;
  intent: string;
  createdAt: string;
}

interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  actorName: string;
  createdAt: string;
}

interface DashboardPayload {
  stats: Stats;
  upcomingRenewals: Renewal[];
  recentLeads: RecentLead[];
  recentAudit: AuditEntry[];
}

function fmtCents(cents: number | null | undefined): string {
  if (!cents) return "$0";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatTile({ label, value, icon, href }: { label: string; value: ReactNode; icon: ReactNode; href?: string }) {
  const body = (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          {icon}
        </div>
        <span className="text-label-caps text-on-surface-variant">{label}</span>
      </div>
      <div className="mt-2.5 text-display-lg text-on-surface">{value}</div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block transition-transform duration-150 hover:-translate-y-0.5">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Direct-labeled horizontal bar list — each row names its own category and
 *  count in text, so identity never depends on color alone (dataviz skill's
 *  categorical rule); colors reused from the app's own reserved status
 *  vocabulary (StatusBadge's statusMeta) rather than a new invented set. A
 *  soft-to-solid gradient (sequential treatment of the one hue, per the
 *  dataviz skill) reads as more deliberate than a flat fill. */
function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div title={`${label}: ${count}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-on-surface">{label}</span>
        <span className="text-on-surface-variant">{count}</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})`,
          }}
        />
      </div>
    </div>
  );
}

const AUDIT_ACTION_COLOR: Record<string, "ok" | "warn" | "bad" | "accent" | "neutral"> = {
  "staff.create": "accent",
  "staff.permissions.update": "warn",
  "provisioning.target.save": "warn",
  "invoice.create": "ok",
  "invoice.update": "ok",
};

function describeAudit(e: AuditEntry): string {
  switch (e.action) {
    case "staff.create":
      return `Added HQ staff ${String(e.metadata.email ?? "")}`;
    case "staff.permissions.update":
      return `Updated permissions for a staff account`;
    case "provisioning.target.save":
      return `Saved deployment target (${String(e.metadata.host ?? e.targetId)})`;
    case "invoice.create":
      return `Created an invoice`;
    case "invoice.update":
      return `Updated an invoice (${String(e.metadata.status ?? "")})`;
    default:
      return `${titleCase(e.action.replace(/\./g, " "))} on ${e.targetType}`;
  }
}

export default function HqDashboardPage() {
  const { data, error } = useSWR<DashboardPayload>("/api/dashboard", hqApi);
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load the dashboard" : null;

  if (loadError) return <ErrorNote message={loadError} />;
  if (!data) return <Spinner label="Loading dashboard…" />;

  const { stats, upcomingRenewals, recentLeads, recentAudit } = data;
  const totalLeads = Object.values(stats.leadCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-headline-md text-on-surface">Dashboard</h1>

      <div className="cf-stagger grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Total clients" value={stats.totalClients} icon={<IconBuilding size={16} />} href="/clients" />
        <StatTile label="Monthly recurring revenue" value={fmtCents(stats.mrrCents)} icon={<IconDollar size={16} />} />
        <StatTile label="Renewing within 30 days" value={stats.renewingSoon} icon={<IconAlert size={16} />} />
        <StatTile
          label="Deployments unreachable"
          value={`${stats.deploymentsUnreachable} / ${stats.deploymentsMonitored}`}
          icon={<IconServer size={16} />}
        />
        <StatTile label="Open support tickets" value={stats.openTickets} icon={<IconTicket size={16} />} href="/support" />
        <StatTile label="New leads (30d)" value={stats.newLeads30d} icon={<IconTrendingUp size={16} />} href="/leads" />
        <StatTile label="Total leads" value={totalLeads} icon={<IconTrendingUp size={16} />} href="/leads" />
        <StatTile label="Active HQ staff" value={stats.activeStaff} icon={<IconUsers size={16} />} href="/team" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-semibold text-on-surface">Client status breakdown</h2>
          <div className="space-y-3">
            <BarRow label="Live" count={stats.clientCounts.live} total={stats.totalClients} color="var(--color-ok)" />
            <BarRow label="Trial" count={stats.clientCounts.trial} total={stats.totalClients} color="var(--color-accent)" />
            <BarRow label="Lead" count={stats.clientCounts.lead} total={stats.totalClients} color="var(--color-info)" />
            <BarRow label="Churned" count={stats.clientCounts.churned} total={stats.totalClients} color="var(--color-bad)" />
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-semibold text-on-surface">Lead pipeline</h2>
          <div className="space-y-3">
            <BarRow label="New" count={stats.leadCounts.new} total={totalLeads} color="var(--color-on-surface-variant)" />
            <BarRow label="Contacted" count={stats.leadCounts.contacted} total={totalLeads} color="var(--color-info)" />
            <BarRow label="Qualified" count={stats.leadCounts.qualified} total={totalLeads} color="var(--color-accent)" />
            <BarRow label="Converted" count={stats.leadCounts.converted} total={totalLeads} color="var(--color-ok)" />
            <BarRow label="Dismissed" count={stats.leadCounts.dismissed} total={totalLeads} color="var(--color-bad)" />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="px-5 py-3 text-sm font-semibold text-on-surface">Upcoming renewals</div>
          {upcomingRenewals.length === 0 ? (
            <EmptyState title="Nothing renewing soon" hint="Clients renewing within 30 days show up here." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th className="pl-5">Client</Th>
                  <Th>MRR</Th>
                  <Th className="pr-5">Renews</Th>
                </tr>
              </Thead>
              <Tbody>
                {upcomingRenewals.map((r) => (
                  <Tr key={r.id}>
                    <Td className="pl-5">
                      <Link href={`/clients/${r.id}`} className="font-medium text-accent hover:underline">
                        {r.companyName}
                      </Link>
                    </Td>
                    <Td className="text-on-surface-variant">{fmtCents(r.mrrCents)}</Td>
                    <Td className="pr-5 text-on-surface-variant">{fmtDateOnly(r.nextRenewalDate)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>

        <Card>
          <div className="px-5 py-3 text-sm font-semibold text-on-surface">Recent leads</div>
          {recentLeads.length === 0 ? (
            <EmptyState title="No leads yet" />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th className="pl-5">Lead</Th>
                  <Th>Status</Th>
                  <Th className="pr-5">Received</Th>
                </tr>
              </Thead>
              <Tbody>
                {recentLeads.map((l) => (
                  <Tr key={l.id}>
                    <Td className="pl-5">
                      <div className="font-medium text-on-surface">{l.name}</div>
                      <div className="text-xs text-on-surface-variant">{l.company}</div>
                    </Td>
                    <Td>
                      <StatusBadge status={l.status} />
                    </Td>
                    <Td className="pr-5 text-on-surface-variant">{fmtDateTime(l.createdAt)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-on-surface">
          <IconActivity size={15} />
          Recent activity
        </div>
        {recentAudit.length === 0 ? (
          <EmptyState title="No activity yet" hint="Sensitive staff actions will show up here." />
        ) : (
          <div className="divide-y divide-outline-variant">
            {recentAudit.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge color={AUDIT_ACTION_COLOR[e.action] ?? "neutral"}>{e.action}</Badge>
                  <span className="text-on-surface">{describeAudit(e)}</span>
                </div>
                <div className="text-xs text-on-surface-variant">
                  {e.actorName} · {fmtDateTime(e.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
