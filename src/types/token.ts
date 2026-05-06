export type TimerState = "running" | "paused" | "stopped" | "archived";

export const TOKEN_NAMESPACE = "ttimer";

// Regex to find token in a line
export const TOKEN_REGEX = /⏱\(ttimer:([a-z0-9]+):(running|paused|stopped|archived):(\d+)\)/;

// Full token string builder
export function buildToken(id: string, state: TimerState, baseMs: number): string {
  return `⏱(ttimer:${id}:${state}:${baseMs})`;
}

// Parse a token from a line — returns null if not found
export function parseTokenFromLine(line: string): ParsedToken | null {
  const match = TOKEN_REGEX.exec(line);
  if (!match) return null;
  const result = {
    raw: match[0],
    id: match[1]!,
    state: match[2] as TimerState,
    baseMs: parseInt(match[3]!, 10),
  };
  console.log(`[ttimer] parseTokenFromLine: line="${line}" → result=${JSON.stringify(result)}`);
  return result;
}

export interface ParsedToken {
  raw: string;
  id: string;
  state: TimerState;
  baseMs: number;
}