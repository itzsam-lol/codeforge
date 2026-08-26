"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hqApi, ApiError } from "@/lib/api";
import { Button, Card, EmptyState, ErrorNote, Spinner } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { useToast } from "@/components/Toast";

interface TemplateRow {
  id: string;
  title: string;
  _count: { questions: number };
}

export default function ContestTemplatesPage() {
  const router = useRouter();
  const toast = useToast();
  const { data, error, mutate } = useSWR<{ contests: TemplateRow[] }>("/api/contests?templates=true", hqApi);
  const templates = data?.contests ?? null;
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load templates" : null;
  const [usingId, setUsingId] = useState<string | null>(null);

  async function use(id: string) {
    setUsingId(id);
    try {
      const res = await hqApi<{ contest: { id: string } }>(`/api/contests/templates/${id}/use`, { method: "POST" });
      mutate();
      router.push(`/contests/${res.contest.id}`);
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not create a contest from this template", "error");
      setUsingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-headline-md text-on-surface">Contest Templates</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          Reusable contest setups — save any contest as a template from its detail page, then use one here to spin up
          a fresh draft with the same settings and questions.
        </p>
      </div>

      <Card>
        {loadError ? (
          <div className="p-5">
            <ErrorNote message={loadError} />
          </div>
        ) : !templates ? (
          <Spinner />
        ) : templates.length === 0 ? (
          <EmptyState title="No templates yet" hint={'Open a contest and click "Save as template".'} />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="pl-5">Template</Th>
                <Th>Questions</Th>
                <Th className="pr-5">Actions</Th>
              </tr>
            </Thead>
            <Tbody>
              {templates.map((t) => (
                <Tr key={t.id}>
                  <Td className="pl-5">
                    <Link href={`/contests/${t.id}`} className="font-medium text-accent hover:underline">
                      {t.title}
                    </Link>
                  </Td>
                  <Td>{t._count.questions}</Td>
                  <Td className="pr-5">
                    <Button size="sm" disabled={usingId === t.id} onClick={() => use(t.id)}>
                      {usingId === t.id ? "Creating…" : "Use template"}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
