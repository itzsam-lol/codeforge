"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

/**
 * Sanitized markdown renderer. Recruiter-authored content is rendered for
 * candidates, so rehype-sanitize is mandatory here (stored-XSS defense —
 * spec Section 8).
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
