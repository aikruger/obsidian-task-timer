import { ItemView, WorkspaceLeaf } from "obsidian";
import TaskTimerPlugin from "../main";
import { computeElapsedMs } from "../domain/elapsed";
import { LiveTokenIndex } from "../domain/hydration";
import { startTimer, pauseTimer, stopTimer, archiveTimer } from "../domain/transitions";
import { exportAllToCSV } from "../reporting/reporting-service";

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
    const archived = allTokens.filter(t => t.token.state === "archived");

    // Sort active tokens: running first, then by persisted order
    const active = allTokens
      .filter(t => t.token.state !== "archived")
      .sort((a, b) => {
        const aRunning = a.token.state === "running" ? 0 : 1;
        const bRunning = b.token.state === "running" ? 0 : 1;
        if (aRunning !== bRunning) return aRunning - bRunning;
        const order = this.plugin.store.order ?? [];
        const ai = order.indexOf(a.token.id);
        const bi = order.indexOf(b.token.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

    console.log("[ttimer:analytics-view] render", {
      activeCount: active.length,
      archivedCount: archived.length,
    });

    // Header row
    const headerRow = container.createDiv({ cls: "ttimer-view-header" });
    headerRow.createEl("h3", { text: "Task Timers", cls: "ttimer-view-title" });
    const refreshBtn = headerRow.createEl("button", { cls: "ttimer-refresh-btn", title: "Refresh" });
    refreshBtn.innerHTML = "↺";
    refreshBtn.addEventListener("click", async () => {
      console.log("[ttimer:analytics-view] refresh triggered");
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = "…";
      try {
        this.plugin.tokenIndex = await import("../domain/hydration").then(m =>
          m.hydrateTokenIndex(this.plugin.app, this.plugin.store)
        );
        await this.plugin.saveStore();
        this.render();
      } catch (e) {
        console.error("[ttimer:analytics-view] refresh failed", e);
      }
    });

    const exportBtn = headerRow.createEl("button", {
      cls: "ttimer-refresh-btn",
      title: "Export all timers to CSV"
    });
    exportBtn.innerHTML = "⬇";
    exportBtn.addEventListener("click", async () => {
      console.log("[ttimer:analytics-view] export CSV triggered");
      exportBtn.disabled = true;
      exportBtn.innerHTML = "…";
      try {
        const csv = exportAllToCSV(this.plugin.store);
        const folder = this.plugin.settings.exportFolder;
        const fileName = `${folder ? folder + "/" : ""}ttimer-export-${Date.now()}.csv`;
        await this.plugin.app.vault.create(fileName, csv);
        const { Notice } = await import("obsidian");
        new Notice(`Exported: ${fileName}`);
        console.log(`[ttimer:analytics-view] export complete: ${fileName}`);
      } catch (e) {
        console.error("[ttimer:analytics-view] export failed", e);
        const { Notice } = await import("obsidian");
        new Notice("Export failed — see console.");
      } finally {
        exportBtn.disabled = false;
        exportBtn.innerHTML = "⬇";
      }
    });

    if (active.length === 0) {
      container.createEl("p", { text: "No active timers.", cls: "ttimer-empty" });
    }

    for (const entry of active) {
      this.renderTimerCard(entry, container);
    }

    this.attachDragHandlers(container, active);
    console.log("[ttimer:analytics-view] drag handlers attached");

    // Archived section
    const archSection = container.createEl("details");
    archSection.createEl("summary", { text: `Archived (${archived.length})` });
    for (const entry of archived) {
      const card = archSection.createEl("div", { cls: "ttimer-card ttimer-card--archived" });
      card.createEl("div", { text: entry.taskText, cls: "ttimer-card-label" });
      card.createEl("div", {
        text: formatMs(computeElapsedMs(entry.token, this.plugin.store, Date.now())),
        cls: "ttimer-card-elapsed",
      });
      const archBtnRow = card.createDiv({ cls: "ttimer-card-buttons" });
      const unarchBtn = archBtnRow.createEl("button", { cls: "ttimer-btn ttimer-btn--unarchive", text: "📂" });
      unarchBtn.title = "Unarchive";
      unarchBtn.addEventListener("click", async () => {
        console.log(`[ttimer:analytics-view] unarchive clicked id=${entry.token.id}`);
        const { unarchiveTimer } = await import("../domain/transitions");
        await unarchiveTimer(entry.token.id, this.plugin.app, this.plugin.store, this.plugin.saveStore.bind(this.plugin), this.plugin.tokenIndex);
        this.render();
      });
    }
  }

  private attachDragHandlers(container: HTMLElement, active: import("../domain/hydration").LiveTokenIndex[string][]): void {
    let dragSrcId: string | null = null;

    container.addEventListener("dragstart", (e: DragEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(".ttimer-card[draggable='true']");
      if (!target) return;
      dragSrcId = target.dataset.tokenId ?? null;
      target.style.opacity = "0.5";
      e.dataTransfer?.setData("text/plain", dragSrcId ?? "");
      console.log(`[ttimer] drag: dragstart id=${dragSrcId}`);
    });

    container.addEventListener("dragend", (e: DragEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(".ttimer-card");
      if (target) target.style.opacity = "1";
      dragSrcId = null;
      console.log(`[ttimer] drag: dragend`);
    });

    container.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });

    container.addEventListener("dragenter", (e: DragEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(".ttimer-card[draggable='true']");
      if (target) target.style.borderTop = "2px solid var(--interactive-accent)";
    });

    container.addEventListener("dragleave", (e: DragEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(".ttimer-card[draggable='true']");
      if (target) target.style.borderTop = "";
    });

    container.addEventListener("drop", async (e: DragEvent) => {
      e.preventDefault();
      const dropTarget = (e.target as HTMLElement).closest<HTMLElement>(".ttimer-card[draggable='true']");
      if (!dropTarget || !dragSrcId) return;
      dropTarget.style.borderTop = "";

      const dropId = dropTarget.dataset.tokenId ?? null;
      if (!dropId || dropId === dragSrcId) return;

      console.log(`[ttimer] drag: drop srcId=${dragSrcId} onto dropId=${dropId}`);

      // Re-build ordered id list from current sort
      const order = [...(this.plugin.store.order ?? [])];
      const ids = active
        .sort((a, b) => {
          const ai = order.indexOf(a.token.id), bi = order.indexOf(b.token.id);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1; if (bi === -1) return -1;
          return ai - bi;
        })
        .map(t => t.token.id);

      const srcIdx = ids.indexOf(dragSrcId);
      const dstIdx = ids.indexOf(dropId);
      if (srcIdx === -1 || dstIdx === -1) return;

      ids.splice(srcIdx, 1);
      ids.splice(dstIdx, 0, dragSrcId);

      this.plugin.store.order = ids;
      await this.plugin.saveStore();
      console.log(`[ttimer] drag: new order saved`, ids);
      this.render();
    });
  }

  renderTimerCard(entry: LiveTokenIndex[string], container: HTMLElement): void {
    const { token, filePath, lineNo, taskText } = entry;
    console.log(`[ttimer] renderTimerCard: id=${token.id} state=${token.state} baseMs=${token.baseMs}`);

    const elapsed = computeElapsedMs(token, this.plugin.store, Date.now());
    const card = container.createDiv({ cls: `ttimer-card ttimer-card--${token.state}` });

    // Make the card draggable (only non-archived, non-running cards)
    if (token.state !== "running") {
      card.setAttribute("draggable", "true");
      card.dataset.tokenId = token.id;
      card.style.cursor = "grab";
      console.log(`[ttimer] renderTimerCard: drag enabled for id=${token.id}`);
    }

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

    // Timer display — click to edit when stopped or paused
    const timerEl = card.createEl("span", { cls: "ttimer-card-time" });
    timerEl.dataset.id = token.id;
    timerEl.textContent = formatMs(elapsed);

    if (token.state === "stopped" || token.state === "paused") {
      timerEl.title = "Click to edit time";
      timerEl.style.cursor = "text";
      timerEl.style.textDecoration = "underline dotted";
      timerEl.addEventListener("click", () => {
        console.log(`[ttimer] timerCard: inline edit activated id=${token.id}`);
        const input = document.createElement("input");
        input.type = "text";
        input.value = timerEl.textContent ?? "00:00:00";
        input.style.width = "72px";
        input.style.fontSize = "inherit";
        input.style.fontFamily = "monospace";
        input.style.border = "1px solid var(--interactive-accent)";
        input.style.borderRadius = "3px";
        input.style.padding = "1px 3px";
        input.style.background = "var(--background-primary)";
        input.style.color = "var(--text-normal)";
        timerEl.replaceWith(input);
        input.focus();
        input.select();

        const commit = async () => {
          const parts = input.value.trim().split(":").map(Number);
          if (parts.length === 3 && !parts.some(isNaN)) {
            const [h, m, s] = parts as [number, number, number];
            const newMs = ((h * 3600) + (m * 60) + s) * 1000;
            console.log(`[ttimer] timerCard: inline edit commit id=${token.id} newMs=${newMs}`);
            const { editElapsed } = await import("../domain/transitions");
            await editElapsed(token.id, newMs, this.plugin.app, this.plugin.store, this.plugin.saveStore.bind(this.plugin), this.plugin.tokenIndex);
            this.render();
          } else {
            console.warn(`[ttimer] timerCard: inline edit invalid input="${input.value}"`);
            input.replaceWith(timerEl);
          }
        };

        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { input.replaceWith(timerEl); }
        });
      });
    }

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