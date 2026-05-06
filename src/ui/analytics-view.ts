import { ItemView, WorkspaceLeaf } from "obsidian";
import { TimerService } from "../domain/timer-service";
import { formatElapsed } from "../domain/time-format";
import TaskTimerPlugin from "../main";

export const ANALYTICS_VIEW_TYPE = "ttimer-analytics-view";

export class AnalyticsView extends ItemView {
  private intervalId: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private timerService: TimerService,
    private plugin: TaskTimerPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string { return ANALYTICS_VIEW_TYPE; }
  getDisplayText(): string { return "Task Timers"; }
  getIcon(): string { return "clock"; }

  async onOpen(): Promise<void> {
    console.log("[ttimer:analytics-view] opened");
    this.render();
    this.intervalId = window.setInterval(() => this.render(), 1000);
  }

  async onClose(): Promise<void> {
    console.log("[ttimer:analytics-view] closed");
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
  }

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;
    container.empty();

    const active   = this.timerService.getActiveTimers()
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const archived = this.timerService.getArchivedTimers()
      .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

    console.log("[ttimer:analytics-view] render", {
      activeCount: active.length,
      archivedCount: archived.length,
    });

    // ── Active timers ──────────────────────────────────────────
    container.createEl("h3", { text: "Active timers" });

    if (active.length === 0) {
      container.createEl("p", {
        text: "No active timers.",
        cls: "ttimer-empty",
      });
    }

    for (const timer of active) {
      const card = container.createEl("div", {
        cls: `ttimer-card ttimer-card--${timer.state}`,
      });

      card.createEl("div", {
        text: timer.anchor.taskTextSnapshot,
        cls: "ttimer-card-label",
      });

      card.createEl("div", {
        text: formatElapsed(this.timerService.getElapsedMs(timer.id)),
        cls: "ttimer-card-elapsed",
      });

      const statePill = card.createEl("span", {
        cls: `ttimer-state-pill ttimer-state-pill--${timer.state}`,
        text: timer.state,
      });
      statePill.style.marginLeft = "var(--size-4-2)";

      const btns = card.createEl("div", { cls: "ttimer-card-buttons" });

      if (timer.state !== "running") {
        btns.createEl("button", { text: "▶", cls: "ttimer-btn-icon", attr: { title: "Start" } })
          .addEventListener("click", () => {
            console.log("[ttimer:analytics-view] start", timer.id);
            this.timerService.start(timer.id);
            this.render();
          });
      }

      if (timer.state === "running") {
        btns.createEl("button", { text: "⏸", cls: "ttimer-btn-icon", attr: { title: "Pause" } })
          .addEventListener("click", () => {
            console.log("[ttimer:analytics-view] pause", timer.id);
            this.timerService.pause(timer.id);
            this.render();
          });
      }

      if (timer.state !== "stopped") {
        btns.createEl("button", { text: "⏹", cls: "ttimer-btn-icon", attr: { title: "Stop" } })
          .addEventListener("click", () => {
            console.log("[ttimer:analytics-view] stop", timer.id);
            this.timerService.stop(timer.id);
            this.render();
          });
      }

      btns.createEl("button", { text: "📦", cls: "ttimer-btn-icon", attr: { title: "Archive" } })
        .addEventListener("click", () => {
          console.log("[ttimer:analytics-view] archive", timer.id);
          this.timerService.archive(timer.id);
          this.render();
        });

      btns.createEl("button", { text: "🔍", cls: "ttimer-btn-icon", attr: { title: "Open modal" } })
        .addEventListener("click", () => {
          console.log("[ttimer:analytics-view] open modal", timer.id);
          this.plugin.openTimerModal(timer.id);
        });
    }

    // ── Daily summary ──────────────────────────────────────────
    this.renderDailySummary(container, [...active, ...archived]);

    // ── Archived timers ────────────────────────────────────────
    const archSection = container.createEl("details");
    archSection.createEl("summary", { text: `Archived (${archived.length})` });

    for (const timer of archived) {
      const card = archSection.createEl("div", { cls: "ttimer-card ttimer-card--archived" });
      card.createEl("div", { text: timer.anchor.taskTextSnapshot, cls: "ttimer-card-label" });
      card.createEl("div", {
        text: formatElapsed(this.timerService.getElapsedMs(timer.id)),
        cls: "ttimer-card-elapsed",
      });
    }
  }

  private renderDailySummary(container: HTMLElement, all: ReturnType<TimerService["getActiveTimers"]>): void {
    const now = Date.now();
    const dayMs = 86_400_000;

    const buckets: Record<string, number> = {};
    for (const t of all) {
      for (const seg of t.segments) {
        if (!seg.endedAt) continue;
        const date = new Date(seg.startedAt).toLocaleDateString();
        buckets[date] = (buckets[date] ?? 0) + (seg.endedAt - seg.startedAt);
      }
      // open segment for today
      if (t.state === "running") {
        const seg = t.segments[t.segments.length - 1];
        if (seg && !seg.endedAt) {
          const date = new Date(seg.startedAt).toLocaleDateString();
          buckets[date] = (buckets[date] ?? 0) + (now - seg.startedAt);
        }
      }
    }

    const section = container.createEl("div", { cls: "ttimer-daily-summary" });
    section.createEl("h3", { text: "Daily totals" });

    const entries = Object.entries(buckets).sort((a, b) =>
      new Date(b[0]).getTime() - new Date(a[0]).getTime()
    );

    if (entries.length === 0) {
      section.createEl("p", { text: "No data yet.", cls: "ttimer-empty" });
      return;
    }

    for (const [date, ms] of entries.slice(0, 7)) {
      const row = section.createEl("div", { cls: "ttimer-daily-row" });
      row.createEl("span", { text: date, cls: "ttimer-daily-date" });
      row.createEl("span", { text: formatElapsed(ms), cls: "ttimer-daily-total" });
    }
  }
}