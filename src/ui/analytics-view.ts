import { ItemView, WorkspaceLeaf } from "obsidian";
import TaskTimerPlugin from "../main";
import { computeElapsedMs } from "../domain/elapsed";
import { LiveTokenIndex } from "../domain/hydration";
import { startTimer, pauseTimer, stopTimer, archiveTimer } from "../domain/transitions";
import { exportAllToCSV } from "../reporting/reporting-service";

export const ANALYTICS_VIEW_TYPE = "ttimer-analytics-view";

/**
 * Returns the epoch-ms timestamp of the most recent timing activity for a token.
 * Uses the latest endedAt from closed segments, or startedAt if a segment is still open.
 * Returns 0 if the token has no segments recorded.
 */
function getLastTimedAt(tokenId: string, store: import('../types/store').PluginStore): number {
  const segs = store.segments[tokenId];
  if (!segs || segs.length === 0) {
    console.log(`[ttimer:analytics-view] getLastTimedAt: no segments for id=${tokenId}`);
    return 0;
  }
  let latest = 0;
  for (const seg of segs) {
    const ts = seg.endedAt ?? seg.startedAt;
    if (ts > latest) latest = ts;
  }
  console.log(`[ttimer:analytics-view] getLastTimedAt: id=${tokenId} latest=${latest} (${new Date(latest).toISOString()})`);
  return latest;
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export class AnalyticsView extends ItemView {
  private intervalId: number | null = null;
  private searchQuery: string = '';
  private searchInputEl: HTMLInputElement | null = null;

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

    // Refresh running live elapsed
    const timers = container.querySelectorAll(".ttimer-card-time");
    timers.forEach(t => {
      const id = (t as HTMLElement).dataset.id;
      if (!id) return;
      const entry = this.plugin.tokenIndex[id];
      if (entry && entry.token.state === "running") {
        t.textContent = formatMs(computeElapsedMs(entry.token, this.plugin.store, Date.now()));
      }
    });

    // Refresh total time labels for running timers
    const totals = container.querySelectorAll<HTMLElement>(".ttimer-card-total");
    totals.forEach(el => {
      const id = el.dataset.id;
      if (!id) return;
      const entry = this.plugin.tokenIndex[id];
      if (entry && entry.token.state === "running") {
        el.textContent = `Total: ${formatMs(computeElapsedMs(entry.token, this.plugin.store, Date.now()))}`;
      }
    });
  }

  private deriveSidebarTasks(
    allActive: import('../domain/hydration').LiveTokenIndex[string][]
  ): import('../domain/hydration').LiveTokenIndex[string][] {
    const query = this.searchQuery.trim().toLowerCase();
    const sortMode = this.plugin.settings.sidebarSortMode ?? 'manual';

    console.log('[ttimer:analytics-view] deriveSidebarTasks:', {
      totalActive: allActive.length,
      query,
      sortMode,
    });

    // 1. Filter
    let filtered = allActive;
    if (query) {
      filtered = allActive.filter(entry => {
        const inTaskText = entry.taskText.toLowerCase().includes(query);
        const inFilePath = entry.filePath.toLowerCase().includes(query);
        return inTaskText || inFilePath;
      });
      console.log(`[ttimer:analytics-view] deriveSidebarTasks: filtered ${allActive.length} → ${filtered.length} for query="${query}"`);
    }

    // 2. Sort
    if (sortMode === 'alphabetical') {
      filtered = [...filtered].sort((a, b) =>
        a.taskText.localeCompare(b.taskText, undefined, { sensitivity: 'base' })
      );
      console.log('[ttimer:analytics-view] deriveSidebarTasks: sorted alphabetically');
    } else if (sortMode === 'recent') {
      filtered = [...filtered].sort((a, b) => {
        const aTs = getLastTimedAt(a.token.id, this.plugin.store);
        const bTs = getLastTimedAt(b.token.id, this.plugin.store);
        console.log(`[ttimer:analytics-view] deriveSidebarTasks sort: id=${a.token.id} ts=${aTs} vs id=${b.token.id} ts=${bTs}`);
        if (bTs !== aTs) return bTs - aTs; // most recent first
        return a.taskText.localeCompare(b.taskText); // tie-break alphabetically
      });
      console.log('[ttimer:analytics-view] deriveSidebarTasks: sorted by recent');
    } else {
      // Manual: running first, then persisted order
      const order = this.plugin.store.order ?? [];
      filtered = [...filtered].sort((a, b) => {
        const aRunning = a.token.state === 'running' ? 0 : 1;
        const bRunning = b.token.state === 'running' ? 0 : 1;
        if (aRunning !== bRunning) return aRunning - bRunning;
        const ai = order.indexOf(a.token.id);
        const bi = order.indexOf(b.token.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      console.log('[ttimer:analytics-view] deriveSidebarTasks: sorted manual');
    }

    return filtered;
  }

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;
    container.empty();

    const allTokens = Object.values(this.plugin.tokenIndex);
    const archived = allTokens.filter(t => t.token.state === 'archived');
    const allActive = allTokens.filter(t => t.token.state !== 'archived');

    console.log('[ttimer:analytics-view] render', {
      activeCount: allActive.length,
      archivedCount: archived.length,
      searchQuery: this.searchQuery,
      sortMode: this.plugin.settings.sidebarSortMode,
    });

    // ── Header row ───────────────────────────────────────────────────
    const headerRow = container.createDiv({ cls: 'ttimer-view-header' });
    headerRow.createEl('h3', { text: 'Task Timers', cls: 'ttimer-view-title' });

    const actionsRow = headerRow.createDiv({ cls: 'ttimer-view-actions' });

    const sortMode = this.plugin.settings.sidebarSortMode ?? 'manual';

    const sortSelect = actionsRow.createEl('select', {
      cls: 'ttimer-sort-select',
      attr: {
        title: 'Sidebar sort mode',
        'aria-label': 'Sidebar sort mode',
      },
    });

    const sortOptions: Array<{ value: 'manual' | 'alphabetical' | 'recent'; label: string }> = [
      { value: 'manual', label: 'Manual' },
      { value: 'alphabetical', label: 'A–Z' },
      { value: 'recent', label: 'Recent' },
    ];

    for (const option of sortOptions) {
      const opt = sortSelect.createEl('option', { text: option.label });
      opt.value = option.value;
      if (option.value === sortMode) opt.selected = true;
    }

    sortSelect.addEventListener('change', async () => {
      const nextMode = sortSelect.value as 'manual' | 'alphabetical' | 'recent';
      console.log(`[ttimer:analytics-view] sidebar sort mode changed via sidebar: ${sortMode} -> ${nextMode}`);
      this.plugin.settings.sidebarSortMode = nextMode;
      await this.plugin.saveSettings();
      this.render();
    });

    const refreshBtn = actionsRow.createEl('button', { cls: 'ttimer-refresh-btn', title: 'Refresh' });
    refreshBtn.innerHTML = '↺';
    refreshBtn.addEventListener('click', async () => {
      console.log('[ttimer:analytics-view] refresh triggered');
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '…';
      try {
        this.plugin.tokenIndex = await import('../domain/hydration').then(m =>
          m.hydrateTokenIndex(this.plugin.app, this.plugin.store)
        );
        await this.plugin.saveStore();
        this.render();
      } catch (e) {
        console.error('[ttimer:analytics-view] refresh failed', e);
      }
    });

    const exportBtn = actionsRow.createEl('button', {
      cls: 'ttimer-refresh-btn',
      title: 'Export all timers to CSV',
    });
    exportBtn.innerHTML = '⬇';
    exportBtn.addEventListener('click', async () => {
      console.log('[ttimer:analytics-view] export CSV triggered');
      exportBtn.disabled = true;
      exportBtn.innerHTML = '…';
      try {
        const csv = exportAllToCSV(this.plugin.store);
        const folder = this.plugin.settings.exportFolder;
        const fileName = `${folder ? folder + '/' : ''}ttimer-export-${Date.now()}.csv`;
        await this.plugin.app.vault.create(fileName, csv);
        const { Notice } = await import('obsidian');
        new Notice(`Exported: ${fileName}`);
        console.log(`[ttimer:analytics-view] export complete: ${fileName}`);
      } catch (e) {
        console.error('[ttimer:analytics-view] export failed', e);
        const { Notice } = await import('obsidian');
        new Notice('Export failed — see console.');
      } finally {
        exportBtn.disabled = false;
        exportBtn.innerHTML = '⬇';
      }
    });

    // ── Search bar ───────────────────────────────────────────────────
    const searchRow = container.createDiv({ cls: 'ttimer-search-row' });
    const searchInput = searchRow.createEl('input', {
      cls: 'ttimer-search-input',
      attr: {
        type: 'text',
        placeholder: 'Search tasks…',
        'aria-label': 'Search tasks',
        value: this.searchQuery,
      },
    }) as HTMLInputElement;
    this.searchInputEl = searchInput;

    // Restore cursor position after re-render is not possible, but focus is restored
    // by focusing on input if there was already a query present
    if (this.searchQuery) {
      // Defer focus so Obsidian's render cycle completes first
      window.setTimeout(() => {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }, 0);
    }

    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      console.log('[ttimer:analytics-view] search query changed:', this.searchQuery);
      this.render();
    });

    searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.searchQuery = '';
        console.log('[ttimer:analytics-view] search cleared via Escape');
        this.render();
      }
    });

    // Clear button shown when query is non-empty
    if (this.searchQuery) {
      const clearBtn = searchRow.createEl('button', {
        cls: 'ttimer-search-clear',
        attr: { title: 'Clear search', 'aria-label': 'Clear search' },
        text: '✕',
      });
      clearBtn.addEventListener('click', () => {
        this.searchQuery = '';
        console.log('[ttimer:analytics-view] search cleared via button');
        this.render();
      });
    }

    // ── Derive visible tasks ─────────────────────────────────────────
    const visible = this.deriveSidebarTasks(allActive);

    console.log('[ttimer:analytics-view] visible task count after derive:', visible.length);

    if (allActive.length === 0) {
      container.createEl('p', { text: 'No active timers.', cls: 'ttimer-empty' });
    } else if (visible.length === 0 && this.searchQuery) {
      container.createEl('p', {
        text: `No tasks match "${this.searchQuery}".`,
        cls: 'ttimer-empty',
      });
    }

    for (const entry of visible) {
      this.renderTimerCard(entry, container);
    }

    // Drag-and-drop only works in manual sort mode
    if (sortMode === 'manual') {
      this.attachDragHandlers(container, visible);
      console.log('[ttimer:analytics-view] drag handlers attached (manual sort mode)');
    } else {
      console.log(`[ttimer:analytics-view] drag disabled — sort mode is "${sortMode}"`);
    }

    // ── Archived section ─────────────────────────────────────────────
    const archSection = container.createEl('details');
    archSection.createEl('summary', { text: `Archived (${archived.length})` });
    for (const entry of archived) {
      const card = archSection.createEl('div', { cls: 'ttimer-card ttimer-card--archived' });
      card.createEl('div', { text: entry.taskText, cls: 'ttimer-card-label' });
      card.createEl('div', {
        text: formatMs(computeElapsedMs(entry.token, this.plugin.store, Date.now())),
        cls: 'ttimer-card-elapsed',
      });
      const archBtnRow = card.createDiv({ cls: 'ttimer-card-buttons' });
      const unarchBtn = archBtnRow.createEl('button', {
        cls: 'ttimer-btn ttimer-btn--unarchive',
        text: '📂',
      });
      unarchBtn.title = 'Unarchive';
      unarchBtn.addEventListener('click', async () => {
        console.log(`[ttimer:analytics-view] unarchive clicked id=${entry.token.id}`);
        const { unarchiveTimer } = await import('../domain/transitions');
        await unarchiveTimer(
          entry.token.id,
          this.plugin.app,
          this.plugin.store,
          this.plugin.saveStore.bind(this.plugin),
          this.plugin.tokenIndex
        );
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
      const manualMovable = active.filter(entry => entry.token.state !== 'running');
      const ids = manualMovable
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

    // Total time display
    const totalMs = computeElapsedMs(token, this.plugin.store, Date.now());
    const totalEl = card.createEl("span", {
      cls: "ttimer-card-total",
      text: `Total: ${formatMs(totalMs)}`,
    });
    totalEl.dataset.id = token.id;
    totalEl.dataset.role = "total";
    console.log(`[ttimer] renderTimerCard: totalMs=${totalMs} id=${token.id}`);

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

    // Reset button — only for non-archived timers with accumulated time
    if (token.state !== "archived") {
      const currentTotal = computeElapsedMs(token, this.plugin.store, Date.now());
      if (currentTotal > 0) {
        const resetBtn = btnRow.createEl("button", {
          cls: "ttimer-btn ttimer-btn--reset",
          text: "↺",
        });
        resetBtn.title = "Reset timer to zero";
        resetBtn.addEventListener("click", async () => {
          console.log(`[ttimer] timerCard: reset clicked id=${token.id}`);
          const confirmed = confirm(`Reset all time on "${taskText}" to zero? This cannot be undone.`);
          if (!confirmed) {
            console.log(`[ttimer] timerCard: reset cancelled id=${token.id}`);
            return;
          }
          const { resetTimer } = await import("../domain/transitions");
          await resetTimer(
            token.id,
            this.plugin.app,
            this.plugin.store,
            this.plugin.saveStore.bind(this.plugin),
            this.plugin.tokenIndex
          );
          console.log(`[ttimer] timerCard: reset complete id=${token.id}`);
          this.render();
        });
      }
    }

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