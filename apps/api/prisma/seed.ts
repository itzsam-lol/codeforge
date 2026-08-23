/**
 * Seed: organization + super_admin + a starter question bank (Phase 1 types:
 * DSA + MCQ) + one published demo test. Idempotent: skips if the admin exists.
 *
 * The remaining Section 13 seed challenges (frontend UI, bug-fix, API, repo)
 * ship with Phase 3 when their question types become executable.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
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

const DEFAULT_SEED_ADMIN_PASSWORD = "admin1234!";

async function main() {
  // A production seed running with the literal schema default creates a
  // publicly-known super_admin credential — the docs tell an operator to
  // set SEED_ADMIN_PASSWORD, but nothing enforced it. This does.
  if (config.isProd && config.seed.adminPassword === DEFAULT_SEED_ADMIN_PASSWORD) {
    throw new Error(
      "Refusing to seed in production with the default SEED_ADMIN_PASSWORD. " +
        "Set a real value in .env before running db:seed."
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: config.seed.adminEmail.toLowerCase() },
  });
  if (existing) {
    console.log(`Seed skipped: admin ${config.seed.adminEmail} already exists.`);
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
      name: `${config.seed.orgName} Admin`,
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
        "A single integer: the length of the longest substring of `s` with all distinct characters.",
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
        // over the internet. The plagiarism engine flags similarity to this
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

  // ------------------------------------------------ Phase 3 app-dev questions

  // [Frontend/UI] Responsive Pricing Card (Section 13 #1)
  const frontendQ = await prisma.question.create({
    data: {
      ...base,
      type: "frontend_ui",
      title: "Centered Call-to-Action Card",
      difficulty: "easy",
      tags: ["frontend", "css", "flexbox"],
      estimatedMinutes: 20,
      bodyMd: [
        "Build a centered call-to-action card that matches the reference design.",
        "",
        "Requirements:",
        "- A `<section>` containing an `<h2>` with the text **Go Pro**, a paragraph, and a `<button>` labelled **Upgrade**.",
        "- The card is horizontally centered on the page with a light background and rounded corners.",
        "- The button uses an indigo background with white text.",
      ].join("\n"),
      typeConfig: {
        starter: {
          html: '<section class="card">\n  <!-- build the card here -->\n</section>',
          css: "body { font-family: sans-serif; background: #f8fafc; }\n",
          js: "",
        },
        referenceHtml:
          '<section class="card"><h2>Go Pro</h2><p>Unlock every feature.</p><button>Upgrade</button></section>',
        referenceCss:
          "body{font-family:sans-serif;background:#f8fafc;margin:0;display:flex;justify-content:center;padding-top:60px}" +
          ".card{background:#fff;border-radius:16px;padding:32px;box-shadow:0 10px 25px rgba(0,0,0,.08);text-align:center;max-width:320px}" +
          ".card h2{margin:0 0 8px;font-size:24px}.card p{color:#64748b;margin:0 0 20px}" +
          ".card button{background:#4f46e5;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-size:15px;cursor:pointer}",
        breakpoints: [1280, 375],
        referenceScreenshots: {},
        assertions: [
          { label: "has a section", type: "exists", selector: "section" },
          { label: "has an h2", type: "exists", selector: "h2" },
          { label: "has a button", type: "exists", selector: "button" },
          { label: "heading says Go Pro", type: "textContains", selector: "h2", text: "Go Pro" },
          { label: "button says Upgrade", type: "textContains", selector: "button", text: "Upgrade" },
        ],
        interactions: [],
        visualWeightPct: 50,
        assertionsWeightPct: 50,
        interactionsWeightPct: 0,
      } as Prisma.InputJsonValue,
    },
  });

  // [API/Backend] Bookmark Manager REST API (Section 13 #3)
  const apiQ = await prisma.question.create({
    data: {
      ...base,
      type: "api_challenge",
      title: "Bookmark Manager REST API",
      difficulty: "medium",
      tags: ["backend", "rest", "node"],
      estimatedMinutes: 40,
      bodyMd: [
        "Implement an in-memory bookmarks REST API using only Node's built-in `http` module.",
        "",
        "Endpoints:",
        "- `POST /bookmarks`: body `{ \"url\": \"...\" }`; returns **201** with the created bookmark `{ id, url }`.",
        "- `GET /bookmarks`: returns **200** with an array of all bookmarks.",
        "- `DELETE /bookmarks/:id`: returns **204**; a subsequent GET must not include it.",
        "",
        "Respond with JSON and the correct status codes. Listen on `process.env.PORT`.",
      ].join("\n"),
      typeConfig: {
        port: 3000,
        starterCode: [
          'const http = require("http");',
          "const PORT = process.env.PORT || 3000;",
          "// TODO: implement POST /bookmarks, GET /bookmarks, DELETE /bookmarks/:id",
          "const server = http.createServer((req, res) => {",
          '  res.writeHead(404, { "content-type": "application/json" });',
          '  res.end(JSON.stringify({ error: "not found" }));',
          "});",
          "server.listen(PORT);",
        ].join("\n"),
        httpTests: [
          { name: "GET empty list returns 200", method: "GET", path: "/bookmarks", expectStatus: 200, isHidden: false, weight: 1 },
          { name: "POST creates (201)", method: "POST", path: "/bookmarks", body: '{"url":"https://a.com"}', expectStatus: 201, isHidden: false, weight: 2 },
          { name: "POST returns the url", method: "POST", path: "/bookmarks", body: '{"url":"https://b.com"}', expectStatus: 201, expectBodyContains: "b.com", isHidden: true, weight: 2 },
          { name: "GET after posts lists them", method: "GET", path: "/bookmarks", expectStatus: 200, expectBodyContains: "a.com", isHidden: true, weight: 2 },
        ],
      } as Prisma.InputJsonValue,
    },
  });

  // [Bug Fix] Broken utility module (Section 13 #2, simplified to node:test)
  const bugQ = await prisma.question.create({
    data: {
      ...base,
      type: "bug_fix",
      title: "Fix the Broken Cart Utilities",
      difficulty: "medium",
      tags: ["debugging", "javascript"],
      estimatedMinutes: 25,
      bodyMd: [
        "The `cart.js` module has bugs: `total()` has an off-by-one and `applyDiscount()` mutates its input.",
        "Fix `cart.js` so the hidden test suite passes. Do not edit the tests.",
      ].join("\n"),
      typeConfig: {
        files: {
          "cart.js": [
            "function total(items) {",
            "  let sum = 0;",
            "  // BUG: off-by-one, skips the last item",
            "  for (let i = 0; i < items.length - 1; i++) sum += items[i].price;",
            "  return sum;",
            "}",
            "",
            "function applyDiscount(items, pct) {",
            "  // BUG: mutates the caller's objects",
            "  for (const it of items) it.price = it.price * (1 - pct);",
            "  return items;",
            "}",
            "",
            "module.exports = { total, applyDiscount };",
          ].join("\n"),
        },
        sampleTests: {
          "test/sample.test.js": [
            'const { test } = require("node:test");',
            'const assert = require("node:assert");',
            'const { total } = require("../cart.js");',
            'test("total sums all items", () => {',
            "  assert.strictEqual(total([{price:10},{price:5},{price:2}]), 17);",
            "});",
          ].join("\n"),
        },
        hiddenTests: {
          "test/hidden.test.js": [
            'const { test } = require("node:test");',
            'const assert = require("node:assert");',
            'const { total, applyDiscount } = require("../cart.js");',
            'test("total includes every item", () => {',
            "  assert.strictEqual(total([{price:10},{price:5},{price:2}]), 17);",
            "});",
            'test("total of single item", () => {',
            "  assert.strictEqual(total([{price:9}]), 9);",
            "});",
            'test("applyDiscount does not mutate input", () => {',
            "  const items = [{price:100}];",
            "  const out = applyDiscount(items, 0.1);",
            "  assert.strictEqual(items[0].price, 100);",
            "  assert.strictEqual(out[0].price, 90);",
            "});",
          ].join("\n"),
        },
      } as Prisma.InputJsonValue,
    },
  });

  // [Full Project] Mini repo submission (Section 13 #5, simplified grading)
  const repoQ = await prisma.question.create({
    data: {
      ...base,
      type: "repo_project",
      title: "Mini Weather Dashboard (repo submission)",
      difficulty: "hard",
      tags: ["fullstack", "repo"],
      estimatedMinutes: 120,
      bodyMd: [
        "Submit a public GitHub repo for a small web app: current weather + 3-day forecast for a searched city, with loading/error states, responsive.",
        "",
        "Your repo should install and build cleanly (`npm ci`, `npm run build`) and pass `npm test`. Commit incrementally with meaningful messages.",
      ].join("\n"),
      typeConfig: {
        setupCommand: "npm ci --no-audit --no-fund || npm install --no-audit --no-fund",
        buildCommand: "npm run build --if-present",
        testCommand: "npm test --if-present",
        buildWeightPct: 40,
        testWeightPct: 60,
        previewCommand: "",
        previewRoutes: ["/"],
      } as Prisma.InputJsonValue,
      rubric: {
        components: [
          { key: "auto", label: "Build & tests", weightPct: 60, kind: "automated" },
          { key: "ui", label: "UI quality & error handling", weightPct: 25, kind: "manual" },
          { key: "code", label: "Code organization", weightPct: 15, kind: "manual" },
        ],
      } as Prisma.InputJsonValue,
    },
  });

  // ---------------------- App-dev showcase test (Phase 3 types) --------------
  await prisma.test.create({
    data: {
      orgId: org.id,
      createdById: admin.id,
      title: "App Dev Skills: Full Stack Showcase",
      description:
        "Phase 3 demo: a frontend UI build, a backend API, a bug fix, and a repo submission.",
      durationMinutes: 120,
      status: "published",
      proctoringLevel: "none",
      settings: {
        instructionsMd:
          "This assessment covers real app-dev tasks: build a UI to match a design, implement a REST API, fix bugs in an existing module, and submit a small project repo. Your work autosaves continuously.",
      } as Prisma.InputJsonValue,
      questions: {
        create: [
          { questionId: frontendQ.id, orderIndex: 0, points: 30 },
          { questionId: apiQ.id, orderIndex: 1, points: 30 },
          { questionId: bugQ.id, orderIndex: 2, points: 25 },
          { questionId: repoQ.id, orderIndex: 3, points: 15 },
        ],
      },
    },
  });

  // --------------------------------------------------------------- Demo test
  const test = await prisma.test.create({
    data: {
      orgId: org.id,
      createdById: admin.id,
      title: "App Dev Intern Screen: Demo",
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
          "- Your work is **autosaved** continuously; if your browser crashes, reopen the same link to resume.",
          "- Coding questions: **Run** executes the visible sample cases; **Submit** also runs hidden cases. You can submit multiple times, and the **last submission counts**.",
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
  console.log(`  bank:   2 DSA + 4 MCQ + frontend/API/bug-fix/repo questions`);
  console.log(`  tests:  "${test.title}" + "App Dev Skills: Full Stack Showcase"`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
