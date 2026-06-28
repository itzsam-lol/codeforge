/**
 * Seed: organization + super_admin + a starter question bank (Phase 1 types:
 * DSA + MCQ) + one published demo test. Idempotent — skips if the admin exists.
 *
 * The remaining Section 13 seed challenges (frontend UI, bug-fix, API, repo)
 * ship with Phase 3 when their question types become executable.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { config } from "../src/config";

const prisma = new PrismaClient();

const js = (code: string) => code.trimStart();

const LONGEST_SUBSTRING_STARTERS: Record<string, string> = {
  javascript: js(`
// Read one line from stdin, print the answer to stdout.
const s = require("fs").readFileSync(0, "utf8").replace(/\\r?\\n$/, "");

function lengthOfLongestSubstring(s) {
  // TODO: implement
  return 0;
}

console.log(lengthOfLongestSubstring(s));
`),
  python: js(`
import sys

def length_of_longest_substring(s: str) -> int:
    # TODO: implement
    return 0

s = sys.stdin.readline().rstrip("\\n")
print(length_of_longest_substring(s))
`),
  cpp: js(`
#include <bits/stdc++.h>
using namespace std;

int lengthOfLongestSubstring(const string& s) {
    // TODO: implement
    return 0;
}

int main() {
    string s;
    getline(cin, s);
    cout << lengthOfLongestSubstring(s) << "\\n";
    return 0;
}
`),
  java: js(`
import java.util.*;

public class Main {
    static int lengthOfLongestSubstring(String s) {
        // TODO: implement
        return 0;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.hasNextLine() ? sc.nextLine() : "";
        System.out.println(lengthOfLongestSubstring(s));
    }
}
`),
};

const BRACKETS_STARTERS: Record<string, string> = {
  javascript: js(`
const s = require("fs").readFileSync(0, "utf8").replace(/\\r?\\n$/, "");

function isBalanced(s) {
  // TODO: implement
  return false;
}

console.log(isBalanced(s) ? "true" : "false");
`),
  python: js(`
import sys

def is_balanced(s: str) -> bool:
    # TODO: implement
    return False

s = sys.stdin.readline().rstrip("\\n")
print("true" if is_balanced(s) else "false")
`),
  cpp: js(`
#include <bits/stdc++.h>
using namespace std;

bool isBalanced(const string& s) {
    // TODO: implement
    return false;
}

int main() {
    string s;
    getline(cin, s);
    cout << (isBalanced(s) ? "true" : "false") << "\\n";
    return 0;
}
`),
  java: js(`
import java.util.*;

public class Main {
    static boolean isBalanced(String s) {
        // TODO: implement
        return false;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.hasNextLine() ? sc.nextLine() : "";
        System.out.println(isBalanced(s) ? "true" : "false");
    }
}
`),
};

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: config.seed.adminEmail.toLowerCase() },
  });
  if (existing) {
    console.log(`Seed skipped — admin ${config.seed.adminEmail} already exists.`);
    return;
  }

  const org = await prisma.organization.create({
    data: { name: config.seed.orgName, brandingConfig: { accentColor: "#4f46e5" } },
  });

  const admin = await prisma.user.create({
    data: {
      orgId: org.id,
      role: "super_admin",
      email: config.seed.adminEmail.toLowerCase(),
      passwordHash: await bcrypt.hash(config.seed.adminPassword, 12),
      name: "CodeForge Admin",
    },
  });

  const base = { orgId: org.id, createdById: admin.id };

  // ------------------------------------------------------------------ DSA #1
  const dsa1 = await prisma.question.create({
    data: {
      ...base,
      type: "dsa",
      title: "Longest Substring Without Repeating Characters",
      difficulty: "medium",
      tags: ["strings", "sliding-window", "two-pointers"],
      estimatedMinutes: 25,
      bodyMd: [
        "Given a string `s`, find the **length of the longest substring** without repeating characters.",
        "",
        "### Input",
        "A single line containing the string `s` (`0 <= s.length <= 5 * 10^4`). The string contains printable ASCII characters with no spaces.",
        "",
        "### Output",
        "A single integer — the length of the longest substring of `s` with all distinct characters.",
        "",
        "### Example",
        "```",
        "Input:  abcabcbb",
        "Output: 3",
        "```",
        'The answer is `"abc"`, with a length of 3.',
      ].join("\n"),
      typeConfig: {
        languages: ["javascript", "python", "cpp", "java"],
        starterCode: LONGEST_SUBSTRING_STARTERS,
        timeLimitMs: 2000,
        memoryLimitKb: 128000,
        // Reference corpus: the canonical sliding-window solution found all
        // over the internet — the plagiarism engine flags similarity to this
        // separately from candidate-to-candidate matches.
        referenceSolutions: [
          {
            label: "Canonical sliding-window (public)",
            code: [
              'const s = require("fs").readFileSync(0, "utf8").replace(/\\r?\\n$/, "");',
              "function lengthOfLongestSubstring(s) {",
              "  const map = new Map();",
              "  let left = 0, best = 0;",
              "  for (let right = 0; right < s.length; right++) {",
              "    const ch = s[right];",
              "    if (map.has(ch) && map.get(ch) >= left) left = map.get(ch) + 1;",
              "    map.set(ch, right);",
              "    best = Math.max(best, right - left + 1);",
              "  }",
              "  return best;",
              "}",
              "console.log(lengthOfLongestSubstring(s));",
            ].join("\n"),
          },
        ],
      } as Prisma.InputJsonValue,
      rubric: {
        components: [
          { key: "tests", label: "Hidden test cases", weightPct: 100, kind: "automated" },
        ],
      } as Prisma.InputJsonValue,
      testCases: {
        create: [
          { input: "abcabcbb", expectedOutput: "3", isHidden: false, orderIndex: 0 },
          { input: "bbbbb", expectedOutput: "1", isHidden: false, orderIndex: 1 },
          { input: "pwwkew", expectedOutput: "3", isHidden: false, orderIndex: 2 },
          { input: "", expectedOutput: "0", isHidden: true, orderIndex: 3 },
          { input: "au", expectedOutput: "2", isHidden: true, orderIndex: 4 },
          { input: "dvdf", expectedOutput: "3", isHidden: true, orderIndex: 5 },
          { input: "abba", expectedOutput: "2", isHidden: true, orderIndex: 6 },
          { input: "anviaj", expectedOutput: "5", isHidden: true, orderIndex: 7 },
          { input: "tmmzuxt", expectedOutput: "5", isHidden: true, orderIndex: 8 },
          {
            input: "abcdefghijklmnopqrstuvwxyz".repeat(4),
            expectedOutput: "26",
            isHidden: true,
            orderIndex: 9,
            weight: 2,
          },
        ],
      },
    },
  });

  // ------------------------------------------------------------------ DSA #2
  const dsa2 = await prisma.question.create({
    data: {
      ...base,
      type: "dsa",
      title: "Balanced Brackets",
      difficulty: "easy",
      tags: ["stacks", "strings"],
      estimatedMinutes: 15,
      bodyMd: [
        "Given a string containing only the characters `(`, `)`, `{`, `}`, `[` and `]`, determine whether it is **balanced**:",
        "",
        "1. Every opening bracket is closed by the same type of bracket.",
        "2. Brackets are closed in the correct order.",
        "",
        "### Input",
        "A single line containing the bracket string (may be empty; an empty string is balanced).",
        "",
        "### Output",
        "`true` if the string is balanced, otherwise `false`.",
      ].join("\n"),
      typeConfig: {
        languages: ["javascript", "python", "cpp", "java"],
        starterCode: BRACKETS_STARTERS,
        timeLimitMs: 2000,
        memoryLimitKb: 128000,
      } as Prisma.InputJsonValue,
      testCases: {
        create: [
          { input: "()[]{}", expectedOutput: "true", isHidden: false, orderIndex: 0 },
          { input: "(]", expectedOutput: "false", isHidden: false, orderIndex: 1 },
          { input: "([{}])", expectedOutput: "true", isHidden: true, orderIndex: 2 },
          { input: "(((", expectedOutput: "false", isHidden: true, orderIndex: 3 },
          { input: "", expectedOutput: "true", isHidden: true, orderIndex: 4 },
          { input: ")(", expectedOutput: "false", isHidden: true, orderIndex: 5 },
          { input: "{[]}()", expectedOutput: "true", isHidden: true, orderIndex: 6 },
        ],
      },
    },
  });

  // -------------------------------------------------------------------- MCQs
  const mcq = (
    title: string,
    bodyMd: string,
    options: { id: string; textMd: string }[],
    correct: string[],
    opts: { multiple?: boolean; negativeMarkingPct?: number; tags?: string[] } = {}
  ) =>
    prisma.question.create({
      data: {
        ...base,
        type: "mcq",
        title,
        bodyMd,
        difficulty: "easy",
        tags: opts.tags ?? ["fundamentals"],
        estimatedMinutes: 1,
        typeConfig: {
          options,
          correctOptionIds: correct,
          multiple: opts.multiple ?? false,
          negativeMarkingPct: opts.negativeMarkingPct ?? 0,
        } as Prisma.InputJsonValue,
      },
    });

  const mcq1 = await mcq(
    "HTTP status for resource creation",
    "A REST API endpoint `POST /users` successfully creates a new user. Which HTTP status code **should** it return?",
    [
      { id: "a", textMd: "`200 OK`" },
      { id: "b", textMd: "`201 Created`" },
      { id: "c", textMd: "`204 No Content`" },
      { id: "d", textMd: "`301 Moved Permanently`" },
    ],
    ["b"],
    { tags: ["http", "rest"], negativeMarkingPct: 0.25 }
  );

  const mcq2 = await mcq(
    "useEffect run-once semantics",
    "In React, which dependency argument makes a `useEffect` callback run **exactly once after the initial mount** (ignoring Strict Mode double-invocation)?",
    [
      { id: "a", textMd: "Omitting the dependency array entirely" },
      { id: "b", textMd: "An empty array: `useEffect(fn, [])`" },
      { id: "c", textMd: "`useEffect(fn, [props])`" },
      { id: "d", textMd: "`useEffect(fn, null)`" },
    ],
    ["b"],
    { tags: ["react", "frontend"] }
  );

  const mcq3 = await mcq(
    "Database index trade-offs",
    "Which of the following statements about relational database **indexes** are true? *(select all that apply)*",
    [
      { id: "a", textMd: "They can significantly speed up reads that filter on the indexed column" },
      { id: "b", textMd: "They speed up every `INSERT`/`UPDATE` on the table" },
      { id: "c", textMd: "They consume additional storage" },
      { id: "d", textMd: "A unique index also enforces a uniqueness constraint" },
    ],
    ["a", "c", "d"],
    { multiple: true, tags: ["databases", "sql"] }
  );

  const mcq4 = await mcq(
    "Flexbox main-axis centering",
    "Inside a `display: flex` container, which declaration centers the items **along the main axis**?",
    [
      { id: "a", textMd: "`justify-content: center;`" },
      { id: "b", textMd: "`align-items: center;`" },
      { id: "c", textMd: "`text-align: center;`" },
      { id: "d", textMd: "`vertical-align: middle;`" },
    ],
    ["a"],
    { tags: ["css", "frontend"] }
  );

  // --------------------------------------------------------------- Demo test
  const test = await prisma.test.create({
    data: {
      orgId: org.id,
      createdById: admin.id,
      title: "App Dev Intern Screen — Demo",
      description:
        "Demo assessment seeded on first run: 2 coding problems + 4 fundamentals MCQs. 45 minutes.",
      durationMinutes: 45,
      status: "published",
      proctoringLevel: "none",
      settings: {
        shuffleQuestions: false,
        partialCredit: true,
        msqPartialCredit: false,
        allowedLanguages: [],
        instructionsMd: [
          "## Before you start",
          "",
          "- The test is **45 minutes** long. The timer starts when you click **Start test** and is enforced by the server.",
          "- Your work is **autosaved** continuously — if your browser crashes, reopen the same link to resume.",
          "- Coding questions: **Run** executes the visible sample cases; **Submit** also runs hidden cases. You can submit multiple times — the **last submission counts**.",
          "- One MCQ uses negative marking; it is marked on the question.",
          "- When the timer reaches zero the test submits itself automatically.",
          "",
          "Good luck!",
        ].join("\n"),
      } as Prisma.InputJsonValue,
      questions: {
        create: [
          { questionId: dsa1.id, orderIndex: 0, points: 30 },
          { questionId: dsa2.id, orderIndex: 1, points: 20 },
          { questionId: mcq1.id, orderIndex: 2, points: 5 },
          { questionId: mcq2.id, orderIndex: 3, points: 5 },
          { questionId: mcq3.id, orderIndex: 4, points: 5 },
          { questionId: mcq4.id, orderIndex: 5, points: 5 },
        ],
      },
    },
  });

  console.log("Seed complete:");
  console.log(`  org:    ${org.name}`);
  console.log(`  admin:  ${admin.email}  (password from SEED_ADMIN_PASSWORD)`);
  console.log(`  bank:   2 DSA + 4 MCQ questions`);
  console.log(`  test:   "${test.title}" (published, 70 points)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
