import { App } from "obsidian";
import { PluginStore } from "../types/store";
import { LiveTokenIndex } from "../domain/hydration";
import { computeElapsedMs } from "../domain/elapsed";
import { startTimer, pauseTimer, stopTimer, archiveTimer, deleteTimer } from "../domain/transitions";
import TaskTimerPlugin from "../main";

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

export function showTimerPopover(
  app: App,
  anchorEl: HTMLElement,
  id: string,
  tokenIndex: LiveTokenIndex,
  store: PluginStore,
  saveStore: () => Promise<void>,
  plugin?: TaskTimerPlugin
): void {
  console.log(`[ttimer] showTimerPopover: id=${id}`);

  const existing = document.querySelector(".ttimer-popover");
  if (existing) existing.remove();

  const entry = tokenIndex[id];
  if (!entry) {
    console.warn(`[ttimer] showTimerPopover: no index entry for id=${id}`);
    return;
  }

  const { token, taskText } = entry;

  const popover = document.body.createDiv({ cls: "ttimer-popover" });

  // --- Position the popover within viewport bounds (see Issue 3) ---
  // Temporarily place off-screen to measure
  popover.style.visibility = "hidden";
  popover.style.position = "fixed";
  popover.style.top = "0";
  popover.style.left = "0";
  document.body.appendChild(popover);

  const anchorRect = anchorEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Build content first so we can measure popover size
  buildPopoverContent(popover, id, token, taskText, tokenIndex, store, saveStore, plugin, app);

  // Now measure and clamp
  const pw = popover.offsetWidth;
  const ph = popover.offsetHeight;

  let top = anchorRect.bottom + 6;
  let left = anchorRect.left;

  if (left + pw > vw - 8) left = vw - pw - 8;
  if (left < 8) left = 8;
  if (top + ph > vh - 8) top = anchorRect.top - ph - 6; // flip above if no room below
  if (top < 8) top = 8;

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
  popover.style.visibility = "visible";

  console.log(`[ttimer] popover: positioned top=${top} left=${left} pw=${pw} ph=${ph} vw=${vw} vh=${vh}`);

  // --- Dismiss handlers ---
  const dismiss = (e: MouseEvent) => {
    if (!popover.contains(e.target as Node)) {
      console.log(`[ttimer] popover: dismissed by outside click`);
      cleanup();
    }
  };
  const onEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      console.log(`[ttimer] popover: dismissed by Escape`);
      cleanup();
    }
  };

  let intervalId: number | null = null;
  if (token.state === "running") {
    intervalId = window.setInterval(() => {
      const fresh = tokenIndex[id];
      if (!fresh) { cleanup(); return; }
      const timeEl = popover.querySelector<HTMLElement>(".ttimer-popover-time");
      if (timeEl) timeEl.textContent = formatMs(computeElapsedMs(fresh.token, store, Date.now()));
    }, 1000);
  }

  function cleanup() {
    if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
    popover.remove();
    document.removeEventListener("mousedown", dismiss);
    document.removeEventListener("keydown", onEscape);
    console.log(`[ttimer] popover: cleaned up id=${id}`);
  }

  document.addEventListener("mousedown", dismiss);
  document.addEventListener("keydown", onEscape);
}

function buildPopoverContent(
  popover: HTMLElement,
  id: string,
  token: { state: string; baseMs: number },
  taskText: string,
  tokenIndex: LiveTokenIndex,
  store: PluginStore,
  saveStore: () => Promise<void>,
  plugin: TaskTimerPlugin | undefined,
  app: App,
): void {
  // Header row: task text + open sidebar button
  const headerRow = popover.createDiv({ cls: "ttimer-popover-header" });
  headerRow.createEl("div", { cls: "ttimer-popover-title", text: taskText });

  if (plugin) {
    const sidebarBtn = headerRow.createEl("button", { cls: "ttimer-popover-icon-btn", title: "Open timer sidebar" });
    sidebarBtn.innerHTML = "◫";
    sidebarBtn.addEventListener("click", () => {
      console.log(`[ttimer] popover: open sidebar clicked id=${id}`);
      plugin.openAnalyticsSidebar();
      popover.remove();
    });
  }

  // Elapsed time
  const entry = tokenIndex[id];
  const elapsed = entry ? computeElapsedMs(entry.token, store, Date.now()) : token.baseMs;
  popover.createEl("div", { cls: "ttimer-popover-time", text: formatMs(elapsed) });

  // Control buttons row
  const btnRow = popover.createDiv({ cls: "ttimer-popover-buttons" });

  if (token.state !== "running" && token.state !== "archived") {
    const startBtn = btnRow.createEl("button", { cls: "ttimer-btn ttimer-btn--start", text: "▶ Start" });
    startBtn.addEventListener("click", async () => {
      console.log(`[ttimer] popover: start clicked id=${id}`);
      await startTimer(id, app, store, saveStore, tokenIndex);
      popover.remove();
    });
  }

  if (token.state === "running") {
    const pauseBtn = btnRow.createEl("button", { cls: "ttimer-btn ttimer-btn--pause", text: "⏸ Pause" });
    pauseBtn.addEventListener("click", async () => {
      console.log(`[ttimer] popover: pause clicked id=${id}`);
      await pauseTimer(id, app, store, saveStore, tokenIndex);
      popover.remove();
    });
  }

  if (token.state !== "stopped" && token.state !== "archived") {
    const stopBtn = btnRow.createEl("button", { cls: "ttimer-btn ttimer-btn--stop", text: "■ Stop" });
    stopBtn.addEventListener("click", async () => {
      console.log(`[ttimer] popover: stop clicked id=${id}`);
      await stopTimer(id, app, store, saveStore, tokenIndex);
      popover.remove();
    });
  }

  // Action buttons row
  const actionRow = popover.createDiv({ cls: "ttimer-popover-actions" });

  if (token.state !== "archived") {
    const archiveBtn = actionRow.createEl("button", { cls: "ttimer-btn ttimer-btn--archive", text: "📦 Archive" });
    archiveBtn.addEventListener("click", async () => {
      console.log(`[ttimer] popover: archive clicked id=${id}`);
      await archiveTimer(id, app, store, saveStore, tokenIndex, "manual");
      popover.remove();
    });
  }

  const deleteBtn = actionRow.createEl("button", { cls: "ttimer-btn ttimer-btn--delete", text: "🗑 Delete" });
  deleteBtn.addEventListener("click", async () => {
    console.log(`[ttimer] popover: delete clicked id=${id}`);
    await deleteTimer(id, app, store, saveStore, tokenIndex);
    popover.remove();
  });
}
