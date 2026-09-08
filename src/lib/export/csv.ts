export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const str = val === null || val === undefined ? "" : String(val);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const header = cols.join(",");
  const body = rows.map((row) => cols.map((c) => escape(row[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns?: string[]) {
  downloadFile(filename, toCsv(rows, columns), "text/csv;charset=utf-8;");
}

export function downloadMarkdown(filename: string, content: string) {
  downloadFile(filename, content, "text/markdown;charset=utf-8;");
}
