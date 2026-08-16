import { describe, expect, it } from "vitest";
import { round2, scoreMcq, type McqConfig } from "./index";

/**
 * scoreMcq is the actual grading logic for every MCQ/MSQ question a
 * candidate submits — wrong here means wrong scores in production, silently,
 * for every candidate who ever answers one. No test coverage existed for it
 * before this file.
 */
describe("scoreMcq", () => {
  const singleSelect: McqConfig = {
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
    ],
    correctOptionIds: ["b"],
    multiple: false,
    negativeMarkingPct: 0,
  };

  it("awards full points for an exact single-select match", () => {
    expect(scoreMcq({ config: singleSelect, selectedOptionIds: ["b"], points: 10, msqPartialCredit: false })).toBe(
      10
    );
  });

  it("awards zero for a wrong single-select answer when negative marking is off", () => {
    expect(scoreMcq({ config: singleSelect, selectedOptionIds: ["a"], points: 10, msqPartialCredit: false })).toBe(
      0
    );
  });

  it("applies negative marking to a wrong single-select answer", () => {
    const cfg = { ...singleSelect, negativeMarkingPct: 0.25 };
    expect(scoreMcq({ config: cfg, selectedOptionIds: ["a"], points: 10, msqPartialCredit: false })).toBe(-2.5);
  });

  it("never penalizes an unanswered question, even with negative marking configured", () => {
    const cfg = { ...singleSelect, negativeMarkingPct: 0.5 };
    expect(scoreMcq({ config: cfg, selectedOptionIds: [], points: 10, msqPartialCredit: false })).toBe(0);
  });

  const multiSelect: McqConfig = {
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
      { id: "d", text: "D" },
    ],
    correctOptionIds: ["a", "b"],
    multiple: true,
    negativeMarkingPct: 0,
  };

  it("awards full points for an exact MSQ match", () => {
    expect(
      scoreMcq({ config: multiSelect, selectedOptionIds: ["a", "b"], points: 10, msqPartialCredit: true })
    ).toBe(10);
  });

  it("awards full points for an exact MSQ match regardless of selection order", () => {
    expect(
      scoreMcq({ config: multiSelect, selectedOptionIds: ["b", "a"], points: 10, msqPartialCredit: true })
    ).toBe(10);
  });

  it("gives partial credit for a subset of correct options with msqPartialCredit on", () => {
    // 1 of 2 correct selected, 0 wrong -> frac = (1-0)/2 = 0.5
    expect(
      scoreMcq({ config: multiSelect, selectedOptionIds: ["a"], points: 10, msqPartialCredit: true })
    ).toBe(5);
  });

  it("clamps partial credit at zero rather than going negative when wrong selections outweigh correct ones", () => {
    // 1 correct, 2 wrong selected -> raw frac = (1-2)/2 = -0.5, must clamp to 0
    expect(
      scoreMcq({
        config: multiSelect,
        selectedOptionIds: ["a", "c", "d"],
        points: 10,
        msqPartialCredit: true,
      })
    ).toBe(0);
  });

  it("does not give partial credit when msqPartialCredit is off, falling back to negative-marking-or-zero", () => {
    const cfg = { ...multiSelect, negativeMarkingPct: 0.2 };
    // Non-exact MSQ answer, partial credit disabled -> negative marking applies
    // to the whole answer as if it were simply "wrong", same as single-select.
    expect(
      scoreMcq({ config: cfg, selectedOptionIds: ["a"], points: 10, msqPartialCredit: false })
    ).toBe(-2);
  });

  it("rounds partial-credit MSQ scores to 2 decimal places", () => {
    // 3 correct options, 1 selected -> 10 * (1/3) = 3.3333... must round to 3.33
    const cfg: McqConfig = {
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
        { id: "c", text: "C" },
        { id: "d", text: "D" },
      ],
      correctOptionIds: ["a", "b", "c"],
      multiple: true,
      negativeMarkingPct: 0,
    };
    expect(scoreMcq({ config: cfg, selectedOptionIds: ["a"], points: 10, msqPartialCredit: true })).toBe(3.33);
  });
});

describe("round2", () => {
  it("rounds to 2 decimal places", () => {
    expect(round2(3.14159)).toBe(3.14);
    expect(round2(2.005)).toBe(2.01);
  });

  it("documents the known float-precision edge case at exactly .xx5", () => {
    // 1.005 * 100 === 100.49999999999999 in IEEE 754 double precision, so
    // Math.round rounds it DOWN to 100, giving 1 instead of the
    // mathematically-expected 1.01. Not a bug introduced by round2 — this is
    // what "multiply, round, divide" does with any binary float
    // implementation — but worth having pinned down explicitly rather than
    // discovered later as an unexplained off-by-one-cent score.
    expect(round2(1.005)).toBe(1);
  });

  it("leaves already-precise values untouched", () => {
    expect(round2(5)).toBe(5);
    expect(round2(7.5)).toBe(7.5);
  });
});
