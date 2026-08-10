"use client";

/**
 * Frontend UI challenge workspace (spec 5.1 + Section 4): split editor with a
 * live sandboxed <iframe> preview. Candidate JS runs ONLY inside the iframe
 * (sandbox="allow-scripts", no allow-same-origin), never against the app.
 * console.* is intercepted and postMessage'd back for an in-UI console.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CandidateQuestion } from "@codeforge/shared";
import { candidateApi, ApiError } from "@/lib/api";
import { CodeEditor } from "@/components/CodeEditor";
import { Markdown } from "@/components/Markdown";
import { Button, cn } from "@/components/ui";
import type { Answer } from "./TestRunner";

type Pane = "html" | "css" | "js";

interface Parts {
  html: string;
  css: string;
  js: string;
}

function parse(content: string | undefined, starter?: { html: string; css: string; js: string }): Parts {
  if (content) {
    try {
      const p = JSON.parse(content) as Partial<Parts>;
      return { html: p.html ?? "", css: p.css ?? "", js: p.js ?? "" };
    } catch {
      /* fall through to starter */
    }
  }
  return { html: starter?.html ?? "", css: starter?.css ?? "", js: starter?.js ?? "" };
}

const CONSOLE_SHIM = `
<script>
(function(){
  var send=function(level,args){try{parent.postMessage({__cfConsole:true,level:level,
    text:Array.prototype.map.call(args,function(a){try{return typeof a==="object"?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(" ")},"*")}catch(e){}};
  ["log","warn","error","info"].forEach(function(l){var o=console[l];console[l]=function(){send(l,arguments);o&&o.apply(console,arguments)}});
  window.addEventListener("error",function(e){send("error",[e.message])});
  // Runaway-loop guard: hard cap on synchronous execution time.
  var start=Date.now();var _si=setInterval;
})();
<\/script>`;

function buildSrcDoc(p: Parts): string {
  return [
    "<!doctype html><html><head><meta charset='utf-8'>",
    "<meta name='viewport' content='width=device-width, initial-scale=1'>",
    `<style>${p.css}</style>`,
    CONSOLE_SHIM,
    "</head><body>",
    p.html,
    p.js.trim() ? `<script>${p.js}<\/script>` : "",
    "</body></html>",
  ].join("\n");
}

export function FrontendWorkspace({
  question,
  answer,
  onChange,
}: {
  token: string;
  question: CandidateQuestion;
  answer: Answer | undefined;
  onChange: (a: Answer) => void;
}) {
  const [pane, setPane] = useState<Pane>("html");
  const [parts, setParts] = useState<Parts>(() => parse(answer?.content, question.starter));
  const [srcDoc, setSrcDoc] = useState<string>(() => buildSrcDoc(parse(answer?.content, question.starter)));
  const [logs, setLogs] = useState<{ level: string; text: string }[]>([]);
  const [showReference, setShowReference] = useState(true);
  const [previewWidth, setPreviewWidth] = useState<number>(question.breakpoints?.[0] ?? 1280);
  const iframeKey = useRef(0);

  // Console messages from the sandbox
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data as { __cfConsole?: boolean; level: string; text: string };
      if (d?.__cfConsole) setLogs((prev) => [...prev.slice(-49), { level: d.level, text: d.text }]);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const persist = useCallback(
    (next: Parts) => {
      onChange({ content: JSON.stringify(next) });
    },
    [onChange]
  );

  function edit(value: string) {
    const next = { ...parts, [pane]: value };
    setParts(next);
    persist(next);
  }

  function runPreview() {
    setLogs([]);
    iframeKey.current += 1;
    setSrcDoc(buildSrcDoc(parts));
  }

  // Auto-refresh preview shortly after edits settle.
  useEffect(() => {
    const t = setTimeout(runPreview, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts]);

  const referenceUrl = useMemo(() => {
    const urls = question.referenceImageUrls ?? {};
    return urls[String(previewWidth)] ?? Object.values(urls)[0] ?? null;
  }, [question.referenceImageUrls, previewWidth]);

  const editorValue = parts[pane];

  return (
    <div className="flex min-h-0 flex-1">
      {/* Statement + reference */}
      <div className="w-1/3 min-w-64 overflow-y-auto border-r border-slate-200 bg-white p-5">
        <Markdown>{question.bodyMd}</Markdown>
        {referenceUrl ? (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Reference design
              </h4>
              <button
                onClick={() => setShowReference((s) => !s)}
                className="text-xs font-medium text-accent hover:underline"
              >
                {showReference ? "Hide" : "Show"}
              </button>
            </div>
            {showReference ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={referenceUrl}
                alt="Reference design"
                className="w-full rounded-lg border border-slate-200"
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Editor */}
      <div className="flex w-1/3 min-w-64 flex-col border-r border-slate-200">
        <div className="flex border-b border-slate-200 bg-white">
          {(["html", "css", "js"] as Pane[]).map((p) => (
            <button
              key={p}
              onClick={() => setPane(p)}
              className={cn(
                "border-b-2 px-4 py-2 text-xs font-medium uppercase transition-colors",
                pane === p
                  ? "border-accent text-accent"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          <CodeEditor
            language={pane === "js" ? "javascript" : pane === "css" ? "css" : "html"}
            value={editorValue}
            onChange={edit}
          />
        </div>
      </div>

      {/* Preview + console */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-1.5">
          <div className="flex items-center gap-1">
            {(question.breakpoints ?? [1280, 375]).map((w) => (
              <button
                key={w}
                onClick={() => setPreviewWidth(w)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  previewWidth === w ? "bg-accent/10 text-accent" : "text-slate-500 hover:bg-slate-100"
                )}
              >
                {w}px
              </button>
            ))}
          </div>
          <Button size="sm" variant="secondary" onClick={runPreview}>
            Reset preview
          </Button>
        </div>
        <div
          className="min-h-0 flex-[3] overflow-auto bg-slate-100 p-3"
          tabIndex={0}
          role="region"
          aria-label="Live preview"
        >
          <div className="mx-auto bg-white shadow-sm" style={{ width: previewWidth, maxWidth: "100%" }}>
            <iframe
              key={iframeKey.current}
              title="preview"
              srcDoc={srcDoc}
              sandbox="allow-scripts"
              className="h-[600px] w-full border-0"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-300 bg-slate-900 p-2 font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-slate-500">Console output from your code appears here.</p>
          ) : (
            logs.map((l, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap",
                  l.level === "error" ? "text-rose-300" : l.level === "warn" ? "text-amber-300" : "text-slate-200"
                )}
              >
                {l.text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
