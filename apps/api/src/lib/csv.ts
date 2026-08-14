/** Escapes one CSV cell value, guarding against formula injection. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Formula-injection guard: a value starting with =, +, -, or @ would
  // otherwise execute as a formula when opened in Excel/Sheets. Prefixing
  // with a tab defuses it while staying visually invisible.
  if (/^[=+\-@]/.test(s)) s = "\t" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sendCsv(res: { setHeader: (k: string, v: string) => void; send: (body: string) => void }, filename: string, lines: string[]): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(lines.join("\n"));
}
