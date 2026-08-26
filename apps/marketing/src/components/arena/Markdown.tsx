import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

/**
 * Renders problem statements / editorials (arbitrary GFM markdown, including
 * fenced code blocks) as real HTML. Drop into an existing `.prose
 * prose-invert` wrapper — this component only handles the markdown ->
 * elements transform + code syntax highlighting, not the surrounding
 * typography classes, so it slots into the call sites that already have
 * `<div className="prose ...">` around a raw string.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
      {children}
    </ReactMarkdown>
  );
}
