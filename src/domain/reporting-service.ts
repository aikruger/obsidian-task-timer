import { TaskTimerRecord } from "../types";
import { formatElapsed } from "./time-format";

export class ReportingService {
  constructor(private getTimers: () => TaskTimerRecord[]) {}

  exportJSON(): string {
    console.log("[ttimer:reporting] exportJSON");
    return JSON.stringify(this.getTimers(), null, 2);
  }

  exportCSV(): string {
    console.log("[ttimer:reporting] exportCSV");
    const headers = ["timerId","filePath","blockId","taskText","state","createdAt","updatedAt","archivedAt","totalMs","segmentCount"];
    const rows = this.getTimers().map(t => {
      const elapsed = t.totalMsCached;
      return [
        t.id,
        t.anchor.filePath,
        t.anchor.blockId,
        `"${t.anchor.taskTextSnapshot.replace(/"/g, '""')}"`,
        t.state,
        t.createdAt,
        t.updatedAt,
        t.archivedAt ?? "",
        elapsed,
        t.segments.length,
      ].join(",");
    });
    return [headers.join(","), ...rows].join("\n");
  }

  exportMarkdown(): string {
    console.log("[ttimer:reporting] exportMarkdown");
    const now = new Date().toLocaleString();
    const timers = this.getTimers();
    let md = `# Task Timer Report\n_Generated: ${now}_\n\n`;

    const byFile: Record<string, TaskTimerRecord[]> = {};
    for (const t of timers) {
      const key = t.anchor.filePath;
      if (!byFile[key]) byFile[key] = [];
      byFile[key].push(t);
    }

    for (const [filePath, fileTimers] of Object.entries(byFile)) {
      md += `## ${filePath}\n\n`;
      md += `| Task | State | Total time | Sessions |\n`;
      md += `|------|-------|-----------|----------|\n`;
      for (const t of fileTimers) {
        md += `| ${t.anchor.taskTextSnapshot} | ${t.state} | ${formatElapsed(t.totalMsCached)} | ${t.segments.length} |\n`;
      }
      md += "\n";
    }
    return md;
  }
}