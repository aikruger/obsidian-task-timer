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
export interface CountdownStatus {
  isCountdown: boolean;
  targetMs: number;
  remainingMs: number;   // negative when in overtime
  isOvertime: boolean;
  overtimeMs: number;
  totalMs: number;       // countdown target + overtime
}

export function getCountdownStatus(
  id: string,
  store: import("../types/store").PluginStore,
  nowMs: number
): CountdownStatus | null {
  const meta = store.meta[id];
  if (!meta || meta.countdownTargetMs == null) return null;

  const { countdownTargetMs } = meta;
  // We need elapsed ms from the segments
  let elapsed = 0;
  const segments = store.segments[id] ?? [];
  for (const seg of segments) {
    const end = seg.endedAt ?? nowMs;
    elapsed += end - seg.startedAt;
  }

  const remaining = countdownTargetMs - elapsed;
  const isOvertime = remaining <= 0;
  const overtimeMs = isOvertime ? Math.abs(remaining) : 0;
  const totalMs = elapsed; // actual time spent = full elapsed

  console.log(`[ttimer] getCountdownStatus: id=${id} elapsed=${elapsed} remaining=${remaining} isOvertime=${isOvertime}`);

  return {
    isCountdown: true,
    targetMs: countdownTargetMs,
    remainingMs: remaining,
    isOvertime,
    overtimeMs,
    totalMs,
  };
}
