"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { staffApi } from "@/lib/api";
import { QuestionForm, type QuestionData } from "@/components/QuestionForm";
import { PreviewRunner } from "@/components/PreviewRunner";
import { Spinner } from "@/components/ui";

interface FullQuestion extends QuestionData {
  id: string;
  version: number;
  _count: { submissions: number };
}

export default function EditQuestionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [question, setQuestion] = useState<FullQuestion | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    staffApi<{ question: FullQuestion }>(`/api/questions/${params.id}`).then((d) =>
      setQuestion(d.question)
    );
  }, [params.id]);

  if (!question) return <Spinner />;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit question</h1>
        <span className="text-xs text-slate-500">
          v{question.version} · {question._count.submissions} submission
          {question._count.submissions === 1 ? "" : "s"}
        </span>
      </div>
      {question._count.submissions > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This question already has submissions. Saving will create a <b>new version</b> and keep
          historical results attached to the current one.
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
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
