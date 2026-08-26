"use client";

import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";

/**
 * Ported from apps/web/src/components/CodeEditor.tsx, trimmed to what
 * Arena needs. Loads Monaco from its default CDN (jsdelivr) rather than
 * apps/web's self-hosted-assets setup (scripts/copy-monaco.mjs) — that
 * exists there because a candidate's timed test can't tolerate an external
 * CDN hiccup; Arena's stakes don't justify duplicating that build-time
 * asset-copy machinery for a second app.
 */

export interface ArenaLanguage {
  id: string;
  label: string;
  monacoId: string;
}

// Small, Arena-local subset — deliberately not importing @codeforge/shared
// (a candidate-testing-domain package apps/marketing otherwise has no
// dependency on) just for this list.
export const ARENA_LANGUAGES: ArenaLanguage[] = [
  { id: "javascript", label: "JavaScript (Node.js)", monacoId: "javascript" },
  { id: "typescript", label: "TypeScript", monacoId: "typescript" },
  { id: "python", label: "Python 3", monacoId: "python" },
  { id: "cpp", label: "C++ (GCC)", monacoId: "cpp" },
  { id: "java", label: "Java", monacoId: "java" },
  { id: "go", label: "Go", monacoId: "go" },
];

export function arenaLanguageById(id: string): ArenaLanguage | undefined {
  return ARENA_LANGUAGES.find((l) => l.id === id);
}

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading editor…</div>
  ),
});

export function CodeEditor({
  language,
  value,
  onChange,
  height = "100%",
  /** Blocks Ctrl/Cmd+V and Shift+Insert — the copy/paste-blocking mechanism
   *  for "strict"/"lockdown" proctoring levels, mirrors apps/web's
   *  CodingWorkspace.tsx exactly. */
  blockPaste = false,
  onPasteBlocked,
}: {
  language: string;
  value: string;
  onChange: (value: string) => void;
  height?: string | number;
  blockPaste?: boolean;
  onPasteBlocked?: () => void;
}) {
  const monacoLang = arenaLanguageById(language)?.monacoId ?? "plaintext";

  const handleMount: OnMount = (editor, monaco) => {
    if (blockPaste) {
      const block = () => onPasteBlocked?.();
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, block);
      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Insert, block);
    }
  };

  return (
    <MonacoEditor
      height={height}
      language={monacoLang}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleMount}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: "on",
        padding: { top: 12 },
        contextmenu: !blockPaste,
        dragAndDrop: false,
      }}
    />
  );
}
