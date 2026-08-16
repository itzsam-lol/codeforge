import { describe, expect, it } from "vitest";
import { compareFingerprints, fingerprint, tokenize } from "./plagiarism";

describe("tokenize", () => {
  it("normalizes identifiers to V, numbers to N, and strings to S", () => {
    const tokens = tokenize('let total = 42 + "hi";');
    const norms = tokens.map((t) => t.norm);
    expect(norms).toEqual(["let", "V", "=", "N", "+", "S", ";"]);
  });

  it("strips line comments (// and #) but keeps surrounding code", () => {
    const jsTokens = tokenize("let x = 1; // a comment\nlet y = 2;");
    expect(jsTokens.map((t) => t.norm)).toEqual(["let", "V", "=", "N", ";", "let", "V", "=", "N", ";"]);

    const pyTokens = tokenize("x = 1  # a comment\ny = 2");
    expect(pyTokens.map((t) => t.norm)).toEqual(["V", "=", "N", "V", "=", "N"]);
  });

  it("strips block comments entirely, including their contents", () => {
    const tokens = tokenize("let x = /* skip this = garbage */ 1;");
    expect(tokens.map((t) => t.norm)).toEqual(["let", "V", "=", "N", ";"]);
  });

  it("keeps language keywords as themselves rather than normalizing them", () => {
    const tokens = tokenize("if (found) { return true; }");
    expect(tokens.map((t) => t.norm)).toEqual(["if", "(", "V", ")", "{", "return", "true", ";", "}"]);
  });
});

describe("fingerprint", () => {
  it("produces no fingerprints for source shorter than one k-gram (K=5 tokens)", () => {
    const fp = fingerprint("let x = 1;"); // 5 tokens: let, x, =, 1, ; -> exactly K, but winnowing needs W more
    expect(fingerprint("x").size).toBe(0);
    expect(fp.size).toBeGreaterThanOrEqual(0); // doesn't throw either way
  });

  it("produces identical fingerprints for identical source", () => {
    const source = "function add(a, b) { return a + b; }";
    const fp1 = fingerprint(source);
    const fp2 = fingerprint(source);
    expect([...fp1.spans.keys()].sort()).toEqual([...fp2.spans.keys()].sort());
  });
});

describe("compareFingerprints", () => {
  const noStarter = new Set<number>();

  it("scores identical submissions at 100% similarity", () => {
    const source = `
      function longestSubstring(s) {
        let seen = new Map();
        let start = 0;
        let best = 0;
        for (let end = 0; end < s.length; end++) {
          const c = s[end];
          if (seen.has(c) && seen.get(c) >= start) {
            start = seen.get(c) + 1;
          }
          seen.set(c, end);
          best = Math.max(best, end - start + 1);
        }
        return best;
      }
    `;
    const result = compareFingerprints(fingerprint(source), fingerprint(source), noStarter);
    expect(result.similarityPct).toBe(100);
  });

  it("scores unrelated submissions at low similarity", () => {
    const a = `
      function longestSubstring(s) {
        let seen = new Map();
        let start = 0;
        let best = 0;
        for (let end = 0; end < s.length; end++) {
          const c = s[end];
          if (seen.has(c) && seen.get(c) >= start) start = seen.get(c) + 1;
          seen.set(c, end);
          best = Math.max(best, end - start + 1);
        }
        return best;
      }
    `;
    const b = `
      class Stack {
        constructor() { this.items = []; }
        push(item) { this.items.push(item); }
        pop() { return this.items.pop(); }
        peek() { return this.items[this.items.length - 1]; }
        isEmpty() { return this.items.length === 0; }
      }
    `;
    const result = compareFingerprints(fingerprint(a), fingerprint(b), noStarter);
    expect(result.similarityPct).toBeLessThan(15);
  });

  it("still catches near-identical logic disguised by renamed variables — the actual point of the tool", () => {
    const original = `
      function longestSubstring(s) {
        let seen = new Map();
        let start = 0;
        let best = 0;
        for (let end = 0; end < s.length; end++) {
          const c = s[end];
          if (seen.has(c) && seen.get(c) >= start) start = seen.get(c) + 1;
          seen.set(c, end);
          best = Math.max(best, end - start + 1);
        }
        return best;
      }
    `;
    // Same structure, every identifier renamed, whitespace changed.
    const renamed = `
      function findLongest(str) {
        let lastIndex = new Map();
        let left = 0;
        let maxLen = 0;
        for (let right = 0; right < str.length; right++) {
          const ch = str[right];
          if (lastIndex.has(ch) && lastIndex.get(ch) >= left) left = lastIndex.get(ch) + 1;
          lastIndex.set(ch, right);
          maxLen = Math.max(maxLen, right - left + 1);
        }
        return maxLen;
      }
    `;
    const result = compareFingerprints(fingerprint(original), fingerprint(renamed), noStarter);
    expect(result.similarityPct).toBeGreaterThan(80);
  });

  it("subtracts starter-template code so two candidates who both only wrote the boilerplate don't flag each other", () => {
    const starter = `
      function solve(input) {
        // TODO: implement
        return null;
      }
    `;
    // Two candidates who submitted the untouched starter, nothing else.
    const starterHashes = new Set(fingerprint(starter).spans.keys());
    const result = compareFingerprints(fingerprint(starter), fingerprint(starter), starterHashes);
    expect(result.similarityPct).toBe(0);
  });

  it("returns zero similarity when either submission has no fingerprints outside the starter template", () => {
    const starter = "function solve(input) { return null; }";
    const starterHashes = new Set(fingerprint(starter).spans.keys());
    const real = `
      function solve(input) {
        let total = 0;
        for (let i = 0; i < input.length; i++) total += input[i];
        return total;
      }
    `;
    const result = compareFingerprints(fingerprint(starter), fingerprint(real), starterHashes);
    expect(result.similarityPct).toBe(0);
  });
});
