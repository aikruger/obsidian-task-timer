import { ItemView, WorkspaceLeaf } from "obsidian";
import TaskTimerPlugin from "../main";
import { computeElapsedMs } from "../domain/elapsed";
import { LiveTokenIndex } from "../domain/hydration";
import { startTimer, pauseTimer, stopTimer, archiveTimer } from "../domain/transitions";

export const ANALYTICS_VIEW_TYPE = "ttimer-analytics-view";

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export class AnalyticsView extends ItemView {
  private intervalId: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
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
    this.intervalId = window.setInterval(() => this.refreshLiveTimes(), 1000);
  }

  async onClose(): Promise<void> {
    console.log("[ttimer:analytics-view] closed");
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
  }

  refreshLiveTimes(): void {
      const container = this.containerEl.children[1] as HTMLElement;
      if (!container) return;
      const timers = container.querySelectorAll(".ttimer-card-time");
      timers.forEach(t => {
          const id = (t as HTMLElement).dataset.id;
          if (!id) return;
          const entry = this.plugin.tokenIndex[id];
          if (entry && entry.token.state === "running") {
              t.textContent = formatMs(computeElapsedMs(entry.token, this.plugin.store, Date.now()));
          }
      });
  }

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;
    container.empty();

    const allTokens = Object.values(this.plugin.tokenIndex);
    const active = allTokens.filter(t => t.token.state !== "archived");
    const archived = allTokens.filter(t => t.token.state === "archived");

    console.log("[ttimer:analytics-view] render", {
      activeCount: active.length,
      archivedCount: archived.length,
    });

    // Header row with refresh button
    const headerRow = container.createDiv({ cls: "ttimer-view-header" });
    headerRow.createEl("h3", { text: "Task Timers", cls: "ttimer-view-title" });

    const refreshBtn = headerRow.createEl("button", {
      cls: "ttimer-refresh-btn",
      title: "Refresh — re-scan all files for timers"
    });
    refreshBtn.innerHTML = "↺";
    refreshBtn.addEventListener("click", async () => {
      console.log("[ttimer:analytics-view] refresh triggered by user");
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = "…";
      try {
        this.plugin.tokenIndex = await import("../domain/hydration").then(m =>
          m.hydrateTokenIndex(this.plugin.app, this.plugin.store)
        );
        await this.plugin.saveStore();
        console.log("[ttimer:analytics-view] token index refreshed, re-rendering");
        this.render();
      } catch (e) {
        console.error("[ttimer:analytics-view] refresh failed", e);
      }
    });

    if (active.length === 0) {
      container.createEl("p", {
        text: "No active timers.",
        cls: "ttimer-empty",
      });
    }

    for (const entry of active) {
        this.renderTimerCard(entry, container);
    }

    const archSection = container.createEl("details");
    archSection.createEl("summary", { text: `Archived (${archived.length})` });

    for (const entry of archived) {
        const card = archSection.createEl("div", { cls: "ttimer-card ttimer-card--archived" });
        card.createEl("div", { text: entry.taskText, cls: "ttimer-card-label" });
        card.createEl("div", {
          text: formatMs(computeElapsedMs(entry.token, this.plugin.store, Date.now())),
          cls: "ttimer-card-elapsed",
        });
    }
  }

  renderTimerCard(entry: LiveTokenIndex[string], container: HTMLElement): void {
    const { token, filePath, lineNo, taskText } = entry;
    console.log(`[ttimer] renderTimerCard: id=${token.id} state=${token.state} baseMs=${token.baseMs}`);

    const elapsed = computeElapsedMs(token, this.plugin.store, Date.now());
    const card = container.createDiv({ cls: `ttimer-card ttimer-card--${token.state}` });

    // Task text
    card.createEl("span", { cls: "ttimer-card-label", text: taskText });

    // File link
    const fileEl = card.createEl("span", {
      cls: "ttimer-card-file",
      text: filePath.split("/").pop() ?? filePath,
    });
    fileEl.style.cursor = "pointer";
    fileEl.addEventListener("click", () => {
      console.log(`[ttimer] timerCard: open file clicked id=${token.id} file=${filePath} line=${lineNo}`);
      this.plugin.navigateToTask(filePath, lineNo, token.id);
    });

    // Timer display
    const timerEl = card.createEl("span", { cls: "ttimer-card-time", text: formatMs(elapsed) });
    timerEl.dataset.id = token.id;

    // Buttons
    const btnRow = card.createDiv({ cls: "ttimer-card-buttons" });
    if (token.state !== "running") {
      const startBtn = btnRow.createEl("button", { cls: "ttimer-btn ttimer-btn--start", text: "▶" });
      startBtn.addEventListener("click", async () => {
        console.log(`[ttimer] timerCard: start clicked id=${token.id}`);
        await startTimer(token.id, this.plugin.app, this.plugin.store, this.plugin.saveStore.bind(this.plugin), this.plugin.tokenIndex);
        this.render();
      });
    }
    if (token.state === "running") {
      const pauseBtn = btnRow.createEl("button", { cls: "ttimer-btn ttimer-btn--pause", text: "⏸" });
      pauseBtn.addEventListener("click", async () => {
        console.log(`[ttimer] timerCard: pause clicked id=${token.id}`);
        await pauseTimer(token.id, this.plugin.app, this.plugin.store, this.plugin.saveStore.bind(this.plugin), this.plugin.tokenIndex);
        this.render();
      });
    }
    if (token.state !== "stopped" && token.state !== "archived") {
      const stopBtn = btnRow.createEl("button", { cls: "ttimer-btn ttimer-btn--stop", text: "■" });
      stopBtn.addEventListener("click", async () => {
        console.log(`[ttimer] timerCard: stop clicked id=${token.id}`);
        await stopTimer(token.id, this.plugin.app, this.plugin.store, this.plugin.saveStore.bind(this.plugin), this.plugin.tokenIndex);
        this.render();
      });
    }
    const archiveBtn = btnRow.createEl("button", { cls: "ttimer-btn", text: "📦" });
    archiveBtn.addEventListener("click", async () => {
        console.log(`[ttimer] timerCard: archive clicked id=${token.id}`);
        await archiveTimer(token.id, this.plugin.app, this.plugin.store, this.plugin.saveStore.bind(this.plugin), this.plugin.tokenIndex);
        this.render();
    });
  }
}