import { describe, expect, it } from "vitest";
import { effectiveScore, parseMcqDraft, sessionTotals, type SessionWithFinals } from "./session";

describe("parseMcqDraft", () => {
  it("extracts selectedOptionIds from a well-formed draft", () => {
    expect(parseMcqDraft(JSON.stringify({ selectedOptionIds: ["a", "b"] }))).toEqual(["a", "b"]);
  });

  it("treats null/undefined/empty content as unanswered", () => {
    expect(parseMcqDraft(null)).toEqual([]);
    expect(parseMcqDraft(undefined)).toEqual([]);
    expect(parseMcqDraft("")).toEqual([]);
  });

  it("treats malformed JSON as unanswered rather than throwing", () => {
    expect(parseMcqDraft("{not valid json")).toEqual([]);
  });

  it("drops non-string entries and ignores a missing selectedOptionIds field", () => {
    expect(parseMcqDraft(JSON.stringify({ selectedOptionIds: ["a", 1, null, "b"] }))).toEqual(["a", "b"]);
    expect(parseMcqDraft(JSON.stringify({ somethingElse: true }))).toEqual([]);
  });
});

describe("effectiveScore", () => {
  it("prefers a manual override when one exists", () => {
    expect(effectiveScore({ autoScore: 5, manualScore: 8 })).toBe(8);
  });

  it("falls back to autoScore when there's no manual override", () => {
    expect(effectiveScore({ autoScore: 5, manualScore: null })).toBe(5);
  });

  it("falls back to zero when neither score has been set", () => {
    expect(effectiveScore({ autoScore: null, manualScore: null })).toBe(0);
  });

  it("respects an explicit manual override of zero rather than falling back to autoScore", () => {
    // manualScore: 0 is a real recruiter decision ("this deserves nothing"),
    // not "unset" — must not be treated the same as null via `?? `.
    expect(effectiveScore({ autoScore: 7, manualScore: 0 })).toBe(0);
  });
});

describe("sessionTotals", () => {
  function session(overrides: {
    order: { questionId: string; points: number; order: number }[];
    submissions: { isFinal: boolean; autoScore: number | null; manualScore: number | null }[];
  }): SessionWithFinals {
    return {
      questionOrder: overrides.order,
      submissions: overrides.submissions,
      // Only the two fields above are read by sessionTotals/getQuestionOrder;
      // the rest of TestSession's shape is irrelevant to this pure function.
    } as unknown as SessionWithFinals;
  }

  it("sums only final submissions, ignoring superseded (non-final) ones", () => {
    const s = session({
      order: [{ questionId: "q1", points: 10, order: 0 }],
      submissions: [
        { isFinal: false, autoScore: 3, manualScore: null }, // superseded draft attempt
        { isFinal: true, autoScore: 8, manualScore: null },
      ],
    });
    expect(sessionTotals(s)).toEqual({ totalScore: 8, maxScore: 10 });
  });

  it("computes maxScore from the frozen question order, independent of what was actually submitted", () => {
    const s = session({
      order: [
        { questionId: "q1", points: 10, order: 0 },
        { questionId: "q2", points: 15, order: 1 },
      ],
      submissions: [{ isFinal: true, autoScore: 10, manualScore: null }], // q2 never answered
    });
    expect(sessionTotals(s)).toEqual({ totalScore: 10, maxScore: 25 });
  });

  it("rounds the total to 2 decimal places", () => {
    const s = session({
      order: [{ questionId: "q1", points: 10, order: 0 }],
      submissions: [
        { isFinal: true, autoScore: 3.333, manualScore: null },
        { isFinal: true, autoScore: 3.333, manualScore: null },
      ],
    });
    expect(sessionTotals(s).totalScore).toBe(6.67);
  });
});
