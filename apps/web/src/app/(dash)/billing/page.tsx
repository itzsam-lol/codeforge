"use client";

import useSWR from "swr";
import { staffApi, ApiError } from "@/lib/api";
import { Badge, Card, EmptyState, ErrorNote, Spinner } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { fmtDateTime } from "@/lib/format";

interface Invoice {
  id: string;
  amountCents: number;
  status: "draft" | "sent" | "paid" | "overdue";
  dueDate: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface BillingPayload {
  available: boolean;
  companyName?: string;
  mrrCents?: number | null;
  nextRenewalDate?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  invoices?: Invoice[];
}

const STATUS_COLOR: Record<Invoice["status"], "neutral" | "info" | "ok" | "warn"> = {
  draft: "neutral",
  sent: "info",
  paid: "ok",
  overdue: "warn",
};

function fmtCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function BillingPage() {
  const { data, error } = useSWR<BillingPayload>("/api/billing", staffApi);
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load billing information" : null;

  return (
    <div className="space-y-4">
      <h1 className="text-headline-md text-on-surface">Billing</h1>

      {loadError ? (
        <ErrorNote message={loadError} />
      ) : !data ? (
        <Spinner label="Loading billing…" />
      ) : !data.available ? (
        <Card className="p-5">
          <EmptyState
            title="Billing isn't available for this deployment"
            hint="This deployment isn't linked to a CodeForge HQ billing account yet. Contact CodeForge support if you think this is a mistake."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                Current plan
              </div>
              <div className="mt-1 text-2xl font-semibold text-on-surface">{fmtCents(data.mrrCents)}</div>
              <div className="mt-0.5 text-xs text-on-surface-variant">per month</div>
            </Card>
            <Card className="p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                Next renewal
              </div>
              <div className="mt-1 text-2xl font-semibold text-on-surface">
                {fmtDateOnly(data.nextRenewalDate)}
              </div>
            </Card>
            <Card className="p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                Contract period
              </div>
              <div className="mt-1 text-sm font-medium text-on-surface">
                {fmtDateOnly(data.contractStartDate)} – {fmtDateOnly(data.contractEndDate)}
              </div>
            </Card>
          </div>

          <Card>
            <div className="p-5 pb-0">
              <h2 className="text-sm font-semibold text-on-surface">Invoices</h2>
            </div>
            {!data.invoices || data.invoices.length === 0 ? (
              <EmptyState title="No invoices yet" hint="Past invoices will appear here once issued." />
            ) : (
              <Table>
                <Thead>
                  <tr>
                    <Th className="pl-5">Amount</Th>
                    <Th>Status</Th>
                    <Th>Due</Th>
                    <Th>Paid</Th>
                    <Th>Notes</Th>
                    <Th className="pr-5">Issued</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {data.invoices.map((inv) => (
                    <Tr key={inv.id}>
                      <Td className="pl-5 font-medium text-on-surface">{fmtCents(inv.amountCents)}</Td>
                      <Td>
                        <Badge color={STATUS_COLOR[inv.status]}>
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </Badge>
                      </Td>
                      <Td className="text-on-surface-variant">{fmtDateOnly(inv.dueDate)}</Td>
                      <Td className="text-on-surface-variant">{fmtDateOnly(inv.paidAt)}</Td>
                      <Td className="text-on-surface-variant">{inv.notes ?? "—"}</Td>
                      <Td className="pr-5 text-on-surface-variant">{fmtDateTime(inv.createdAt)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
