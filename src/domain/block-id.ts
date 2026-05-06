const BLOCK_ID_REGEX = /\^ttimer-[a-z0-9]+-[a-z0-9]+/;
const MARKER_REGEX   = /⏱\s*\d{2}:\d{2}:\d{2}|⏱/g;

export function generateBlockId(prefix = "ttimer"): string {
  const ts  = Math.floor(Date.now() / 1000).toString(36);
  const rnd = Math.random().toString(36).substring(2, 7);
  console.log("[ttimer:block-id] generated", { ts, rnd });
  return `^${prefix}-${ts}-${rnd}`;
}

export function extractBlockId(line: string): string | null {
  const match = line.match(BLOCK_ID_REGEX);
  const result = match ? match[0] : null;
  console.log("[ttimer:block-id] extract", { line: line.slice(0, 80), result });
  return result;
}

export function stripTimerSyntax(text: string): string {
  return text
    .replace(MARKER_REGEX, "")
    .replace(BLOCK_ID_REGEX, "")
    .replace(/\s+/g, " ")
    .trim();
}