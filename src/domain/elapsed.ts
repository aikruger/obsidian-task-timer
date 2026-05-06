import { ParsedToken } from "../types/token";
import { PluginStore } from "../types/store";

export function computeElapsedMs(
  token: ParsedToken,
  store: PluginStore,
  now: number
): number {
  if (token.state !== "running") {
    console.log(`[ttimer] computeElapsedMs: id=${token.id} state=${token.state} → returning baseMs=${token.baseMs}`);
    return token.baseMs;
  }
  // Find the last open segment
  const segments = store.segments[token.id] ?? [];
  const openSeg = [...segments].reverse().find(s => !s.endedAt);
  if (!openSeg) {
    // No open segment in store — use baseMs only, log a warning
    console.warn(`[ttimer] computeElapsedMs: id=${token.id} is running but no open segment found in store — using baseMs only`);
    return token.baseMs;
  }
  const live = now - openSeg.startedAt;
  console.log(`[ttimer] computeElapsedMs: id=${token.id} baseMs=${token.baseMs} liveDelta=${live} total=${token.baseMs + live}`);
  return token.baseMs + live;
}