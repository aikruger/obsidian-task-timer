export interface SegmentEntry {
  id: string;              // same as token ID
  seq: number;             // monotonically increasing per token, used to order entries
  startedAt: number;       // epoch ms
  endedAt?: number;        // epoch ms — absent if segment is still open
  filePath: string;        // for cross-file reporting
  taskTextSnapshot: string;// captured at segment-open time
}

export interface TokenMeta {
  id: string;
  filePath: string;
  line: number;            // best-known line — advisory only, not authoritative
  taskTextSnapshot: string;
  firstSeenAt: number;
  archivedAt?: number;
}

export interface PluginStore {
  version: number;
  // keyed by token ID — append-only arrays of segments
  segments: Record<string, SegmentEntry[]>;
  // lightweight metadata per known token — updated on every state change
  meta: Record<string, TokenMeta>;
}