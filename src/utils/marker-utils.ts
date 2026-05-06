export function extractStructuredTimerMarker(text: string): { raw: string; blockId: string } | null {
  const match = text.match(/\[⏱\|(\^ttimer-[A-Za-z0-9-]+)\]/);
  if (!match || !match[1] || !match[0]) return null;
  return { raw: match[0], blockId: match[1] };
}

export function stripInlineTimerSyntax(text: string): string {
  return text
    .replace(/\[⏱\|\^ttimer-[A-Za-z0-9-]+\]/g, "")
    .replace(/\[⏱\]/g, "")
    .replace(/⏱/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
