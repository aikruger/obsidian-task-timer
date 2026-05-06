export type TimerState = "running" | "paused" | "stopped" | "archived";

export interface TimeSegment {
  startedAt: number;   // Unix ms
  endedAt?: number;    // Unix ms — undefined means currently open/running
}

export interface TaskAnchor {
  filePath: string;
  line: number;                  // last known line number (fallback only)
  blockId: string;               // e.g. ^ttimer-1714932211-a1b2
  taskTextSnapshot: string;      // stripped task text without markers
  headingPath?: string[];        // e.g. ["Project", "Phase 1"]
}

export interface TaskTimerRecord {
  id: string;                    // internal UUID
  anchor: TaskAnchor;
  state: TimerState;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  segments: TimeSegment[];
  totalMsCached: number;         // sum of closed segments only — speed cache
}

export interface PluginData {
  version: number;               // increment when shape changes
  timers: TaskTimerRecord[];
}