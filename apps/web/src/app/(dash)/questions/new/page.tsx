"use client";

import { useRouter } from "next/navigation";
import { QuestionForm } from "@/components/QuestionForm";

export default function NewQuestionPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-headline-md text-on-surface">New question</h1>
      <QuestionForm onSaved={() => router.push("/questions")} />
    </div>
  );
}
