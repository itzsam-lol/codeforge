"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { staffApi, ApiError } from "@/lib/api";
import { QuestionForm, type QuestionData } from "@/components/QuestionForm";
import { PreviewRunner } from "@/components/PreviewRunner";
import { ErrorNote, Spinner } from "@/components/ui";

interface FullQuestion extends QuestionData {
  id: string;
  version: number;
  _count: { submissions: number };
}

export default function EditQuestionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [question, setQuestion] = useState<FullQuestion | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    staffApi<{ question: FullQuestion }>(`/api/questions/${params.id}`)
      .then((d) => setQuestion(d.question))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load this question"));
  }, [params.id]);

  if (!question) return loadError ? <ErrorNote message={loadError} /> : <Spinner />;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-headline-md text-on-surface">Edit question</h1>
        <span className="text-xs text-on-surface-variant">
          v{question.version} · {question._count.submissions} submission
          {question._count.submissions === 1 ? "" : "s"}
        </span>
      </div>
      {question._count.submissions > 0 ? (
        <div className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
          This question already has submissions. Saving will create a <b>new version</b> and keep
          historical results attached to the current one.
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg bg-ok-bg px-3 py-2 text-xs text-ok">
          {notice}
        </div>
      ) : null}
      <QuestionForm
        initial={question}
        onSaved={(id, versioned) => {
          if (versioned) {
            setNotice("Saved as a new version.");
            router.replace(`/questions/${id}`);
          } else {
            router.push("/questions");
          }
        }}
      />
      {question.type === "dsa" ? <PreviewRunner questionId={question.id} question={question} /> : null}
    </div>
  );
}
