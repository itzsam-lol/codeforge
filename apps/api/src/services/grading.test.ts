import { describe, expect, it } from "vitest";
import { computeDsaScore } from "./grading";

/**
 * computeDsaScore is the actual number that lands on a candidate's DSA
 * scorecard — pulled out of gradeDsa specifically so it can be tested
 * without mocking the Judge0/Docker execution pipeline. No coverage existed
 * for this weighted-partial-credit math before this file.
 */
describe("computeDsaScore", () => {
  it("awards full points when every test case passes, partial credit off", () => {
    expect(computeDsaScore([true, true, true], [1, 1, 1], 10, false)).toBe(10);
  });

  it("awards zero when any test case fails, partial credit off (all-or-nothing)", () => {
    expect(computeDsaScore([true, true, false], [1, 1, 1], 10, false)).toBe(0);
  });

  it("awards proportional partial credit weighted by test-case weight", () => {
    // weights 1,1,2 (total 4); passes the two weight-1 cases -> 2/4 = 50%
    expect(computeDsaScore([true, true, false], [1, 1, 2], 10, true)).toBe(5);
  });

  it("weighs a high-weight test case correctly relative to low-weight ones", () => {
    // weights 1,1,8 (total 10); only the weight-8 case passes -> 80%
    expect(computeDsaScore([false, false, true], [1, 1, 8], 10, true)).toBe(8);
  });

  it("rounds partial credit to 2 decimal places", () => {
    // 1 of 3 equal-weight cases -> 10 * (1/3) = 3.333... -> 3.33
    expect(computeDsaScore([true, false, false], [1, 1, 1], 10, true)).toBe(3.33);
  });

  it("awards zero partial credit when nothing passes", () => {
    expect(computeDsaScore([false, false, false], [1, 1, 1], 10, true)).toBe(0);
  });

  it("awards full points when everything passes, partial credit on", () => {
    expect(computeDsaScore([true, true, true], [1, 1, 1], 10, true)).toBe(10);
  });

  it("handles a single test case", () => {
    expect(computeDsaScore([true], [1], 10, false)).toBe(10);
    expect(computeDsaScore([false], [1], 10, false)).toBe(0);
  });
});
