export type TimerState = "running" | "paused" | "stopped" | "archived";

export interface TaskAnchor {
  filePath: string;
  line: number;
  blockId?: string;
  taskTextSnapshot: string;
  headingPath?: string[];
}

export interface TimeSegment {
  startedAt: number;
  endedAt?: number;
}

export interface TaskTimerRecord {
  id: string;
  anchor: TaskAnchor;
  state: TimerState;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  segments: TimeSegment[];
  totalMsCached: number;
  providerRef?: string;
  iconInserted: boolean;
}

export interface PluginData {
  version: number;
  timers: TaskTimerRecord[];
  settings: PluginSettings;
}

export interface PluginSettings {
  blockIdPrefix: string;
  markerStyle: "icon" | "text" | "token";
  archiveOnComplete: boolean;
  stopInsteadOfArchiveOnComplete: boolean;
  allowMultipleRunningTimers: boolean;
  defaultSidebarSort: "newest" | "oldest";
  showArchivedTimers: boolean;
  hoverPopupEnabled: boolean;
  hoverModifierKey: "Alt" | "Ctrl" | "Shift" | "Meta";
  exportFolder: string;
  providerSelection: "internal" | "timekeep" | "legacy-task-timer";
}
