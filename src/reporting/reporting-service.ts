import { TaskTimerRecord } from "../types/models";
import { formatDurationMs } from "../domain/time-format";

export class ReportingService {
  constructor(private getTimers: () => TaskTimerRecord[]) {}

  public exportJSON(): string {
    return JSON.stringify(this.getTimers(), null, 2);
  }

  public exportCSV(): string {
    const timers = this.getTimers();
    const headers = ["timerId", "filePath", "blockId", "taskText", "state", "createdAt", "updatedAt", "archivedAt", "totalMs", "segmentCount"];

    const rows = timers.map(t => {
      // Basic MS calc for the report
      let totalMs = t.totalMsCached;
      if (t.state === "running" && t.segments.length > 0) {
          const open = t.segments[t.segments.length - 1];
          if (open && !open.endedAt) totalMs += Date.now() - open.startedAt;
      }

      return [
        t.id,
        `"${t.anchor.filePath}"`,
        t.anchor.blockId || "",
        `"${t.anchor.taskTextSnapshot.replace(/"/g, '""')}"`,
        t.state,
        t.createdAt,
        t.updatedAt,
        t.archivedAt || "",
        totalMs,
        t.segments.length
      ].join(",");
    });

    return [headers.join(","), ...rows].join("\n");
  }

  public exportMarkdown(): string {
    const timers = this.getTimers();
    let md = "# Task Timer Report\n\n";

    md += `Generated on: ${new Date().toLocaleString()}\n\n`;

    const byFile = timers.reduce((acc, t) => {
      const file = t.anchor.filePath;
      if (!acc[file]) acc[file] = [];
      acc[file].push(t);
      return acc;
    }, {} as Record<string, TaskTimerRecord[]>);

    for (const [file, fileTimers] of Object.entries(byFile)) {
      md += `## File: ${file}\n\n`;
      md += `| Task | Status | Time |\n`;
      md += `|------|--------|------|\n`;
      for (const t of fileTimers) {
        let totalMs = t.totalMsCached;
        if (t.state === "running" && t.segments.length > 0) {
            const open = t.segments[t.segments.length - 1];
            if (open && !open.endedAt) totalMs += Date.now() - open.startedAt;
        }
        md += `| ${t.anchor.taskTextSnapshot} | ${t.state} | ${formatDurationMs(totalMs)} |\n`;
      }
      md += "\n";
    }

    return md;
  }
}
