"use client";

import dynamic from "next/dynamic";
import { loader, type OnMount } from "@monaco-editor/react";
import { languageById } from "@codeforge/shared";
import { Spinner } from "./ui";

// Serve Monaco's assets from our own origin (see scripts/copy-monaco.mjs)
// instead of the library's jsdelivr-CDN default: candidates run this on
// whatever network/hardware they have, so an external CDN dependency here is
// both a perf and a reliability risk during a timed test.
loader.config({ paths: { vs: "/monaco-editor/vs" } });

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <Spinner label="Loading editor…" />,
});

export function CodeEditor({
  language,
  value,
  onChange,
  height = "100%",
  readOnly = false,
  contextMenu = true,
  onMount,
}: {
  language: string;
  value: string;
  onChange?: (value: string) => void;
  height?: string | number;
  readOnly?: boolean;
  /** false at lockdown level: removes the right-click paste path */
  contextMenu?: boolean;
  onMount?: OnMount;
}) {
  const monacoLang = languageById(language)?.monacoId ?? "plaintext";
  return (
    <MonacoEditor
      height={height}
      language={monacoLang}
      value={value}
      onChange={(v) => onChange?.(v ?? "")}
      onMount={onMount}
      theme="vs-dark"
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 14,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: "on",
        padding: { top: 12 },
        contextmenu: contextMenu,
        dragAndDrop: false,
      }}
    />
  );
}
