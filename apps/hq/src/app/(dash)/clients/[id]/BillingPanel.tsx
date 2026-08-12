"use client";

import { useState } from "react";
import { hqApi, ApiError } from "@/lib/api";
import { Badge, Button, Card, ErrorNote, Field, Input } from "@/components/ui";
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

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const INVOICE_STATUS_COLOR = { draft: "neutral", sent: "info", paid: "ok", overdue: "bad" } as const;

export function BillingPanel({
  clientId,
  mrrCents,
  nextRenewalDate,
  invoices,
  onChanged,
}: {
  clientId: string;
  mrrCents: number | null;
  nextRenewalDate: string | null;
  invoices: Invoice[];
  onChanged: () => void;
}) {
  const [mrr, setMrr] = useState(mrrCents != null ? String(mrrCents / 100) : "");
  const [renewal, setRenewal] = useState(nextRenewalDate ? nextRenewalDate.slice(0, 10) : "");
  const [savingContract, setSavingContract] = useState(false);
  const [newAmount, setNewAmount] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [addingInvoice, setAddingInvoice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveContract() {
    setSavingContract(true);
    setError(null);
    try {
      await hqApi(`/api/clients/${clientId}`, {
        method: "PUT",
        body: {
          mrrCents: mrr.trim() ? Math.round(Number(mrr) * 100) : null,
          nextRenewalDate: renewal || null,
        },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save billing details");
    } finally {
      setSavingContract(false);
    }
  }

  async function addInvoice() {
    if (!newAmount.trim()) return;
    setAddingInvoice(true);
    setError(null);
    try {
      await hqApi(`/api/clients/${clientId}/invoices`, {
        method: "POST",
        body: { amountCents: Math.round(Number(newAmount) * 100), dueDate: newDueDate || undefined },
      });
      setNewAmount("");
      setNewDueDate("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the invoice");
    } finally {
      setAddingInvoice(false);
    }
  }

  async function setInvoiceStatus(id: string, status: Invoice["status"]) {
    setError(null);
    try {
      await hqApi(`/api/invoices/${id}`, { method: "PUT", body: { status } });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the invoice");
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <h3 className="text-sm font-semibold text-on-surface">Billing</h3>
      {error ? <ErrorNote message={error} /> : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="MRR (USD)">
          <Input type="number" min="0" step="0.01" value={mrr} onChange={(e) => setMrr(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Next renewal">
          <Input type="date" value={renewal} onChange={(e) => setRenewal(e.target.value)} />
        </Field>
      </div>
      <Button size="sm" variant="secondary" disabled={savingContract} onClick={() => void saveContract()}>
        {savingContract ? "Saving…" : "Save"}
      </Button>

      <div className="pt-4">
        <span className="mb-2 block text-xs font-medium text-on-surface-variant">Invoices</span>
        {invoices.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No invoices yet.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-control bg-surface-container px-3 py-2 text-sm">
                <div>
                  <span className="font-medium text-on-surface">{fmtCents(inv.amountCents)}</span>
                  {inv.dueDate ? <span className="ml-2 text-xs text-on-surface-variant">due {fmtDateTime(inv.dueDate)}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={INVOICE_STATUS_COLOR[inv.status]}>{inv.status}</Badge>
                  {inv.status !== "paid" ? (
                    <div className="flex gap-1">
                      {inv.status === "draft" ? (
                        <button
                          onClick={() => void setInvoiceStatus(inv.id, "sent")}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          Mark sent
                        </button>
                      ) : null}
                      <button
                        onClick={() => void setInvoiceStatus(inv.id, "paid")}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        Mark paid
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-end gap-2">
          <Field label="Amount (USD)" className="flex-1">
            <Input type="number" min="0" step="0.01" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Due date" className="flex-1">
            <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
          </Field>
          <Button size="sm" disabled={addingInvoice} onClick={() => void addInvoice()}>
            {addingInvoice ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
