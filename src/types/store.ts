export interface SegmentEntry {
  id: string;              // same as token ID
  seq: number;             // monotonically increasing per token, used to order entries
  startedAt: number;       // epoch ms
  endedAt?: number;        // epoch ms — absent if segment is still open
  filePath: string;        // for cross-file reporting
  taskTextSnapshot: string;// captured at segment-open time
}

// Fields countdownTargetMs and overtimeStartedAt are optional and only
// present after the user sets a countdown via setCountdown() in transitions.ts
// console.log sanity check: store.meta[id].countdownTargetMs should be a number in ms
export interface TokenMeta {
  id: string;
  filePath: string;
  line: number;
  taskTextSnapshot: string;
  firstSeenAt: number;
  archivedAt?: number;
  countdownTargetMs?: number;    // if set, enables countdown display
  overtimeStartedAt?: number;    // epoch ms when countdown first hit zero
}

export interface PluginStore {
  version: number;
  // keyed by token ID — append-only arrays of segments
  segments: Record<string, SegmentEntry[]>;
  // lightweight metadata per known token — updated on every state change
  meta: Record<string, TokenMeta>;
  order: string[];  // array of token IDs in display order; tokens not in list appear last
}