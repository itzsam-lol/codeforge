export interface TestDetail {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  settings: {
    shuffleQuestions?: boolean;
    partialCredit?: boolean;
    msqPartialCredit?: boolean;
    allowedLanguages?: string[];
    instructionsMd?: string;
  };
  proctoringLevel: string;
  schedulingStart: string | null;
  schedulingEnd: string | null;
  status: "draft" | "published" | "closed" | "archived";
  questions: {
    id: string;
    questionId: string | null;
    orderIndex: number;
    points: number;
    question: {
      id: string;
      title: string;
      type: string;
      difficulty: string;
      tags: string[];
      estimatedMinutes: number | null;
    } | null;
  }[];
  _count: { invitations: number; sessions: number };
}
