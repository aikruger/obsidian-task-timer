import { PluginStore } from "../types/store";

export interface TimerReport {
  id: string;
  filePath: string;
  taskText: string;
  totalMs: number;
  segments: { startedAt: number; endedAt: number; durationMs: number }[];
  firstSeenAt: number;
  archivedAt?: number;
}

export function buildTimerReport(id: string, store: PluginStore): TimerReport {
  const meta = store.meta[id];
  const segments = store.segments[id] ?? [];
  const closedSegments = segments.filter(s => !!s.endedAt);
  const totalMs = closedSegments.reduce((acc, s) => acc + (s.endedAt! - s.startedAt), 0);

  console.log(`[ttimer] buildTimerReport: id=${id} segmentCount=${segments.length} closedCount=${closedSegments.length} totalMs=${totalMs}`);

  return {
    id,
    filePath: meta?.filePath ?? "unknown",
    taskText: meta?.taskTextSnapshot ?? "unknown",
    totalMs,
    segments: closedSegments.map(s => ({
      startedAt: s.startedAt,
      endedAt: s.endedAt!,
      durationMs: s.endedAt! - s.startedAt,
    })),
    firstSeenAt: meta?.firstSeenAt ?? 0,
    archivedAt: meta?.archivedAt,
  };
}

export function exportAllToCSV(store: PluginStore): string {
  console.log(`[ttimer] exportAllToCSV: exporting ${Object.keys(store.segments).length} timers`);
  const rows = ["timerId,filePath,taskText,segmentStart,segmentEnd,durationMs,totalMs"];
  for (const id of Object.keys(store.segments)) {
    const report = buildTimerReport(id, store);
    for (const seg of report.segments) {
      rows.push([
        id, report.filePath, `"${report.taskText.replace(/"/g, '""')}"`,
        new Date(seg.startedAt).toISOString(),
        new Date(seg.endedAt).toISOString(),
        seg.durationMs,
        report.totalMs,
      ].join(","));
    }
  }
  return rows.join("\n");
}