import { App } from "obsidian";
import { PluginStore } from "../types/store";
import { LiveTokenIndex } from "../domain/hydration";
import { computeElapsedMs } from "../domain/elapsed";
import { startTimer, pauseTimer, stopTimer } from "../domain/transitions";

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function showTimerPopover(
  app: App,
  anchorEl: HTMLElement,
  id: string,
  tokenIndex: LiveTokenIndex,
  store: PluginStore,
  saveStore: () => Promise<void>
): void {
  console.log(`[ttimer] showTimerPopover: id=${id}`);

  const existing = document.querySelector(".ttimer-popover");
  if (existing) existing.remove();

  const entry = tokenIndex[id];
  if (!entry) {
    console.warn(`[ttimer] showTimerPopover: no index entry for id=${id}`);
    return;
  }

  const popover = document.body.createDiv({ cls: "ttimer-popover" });
  const rect = anchorEl.getBoundingClientRect();
  popover.style.top = `${rect.bottom + 6}px`;
  popover.style.left = `${rect.left}px`;

  const { token, taskText } = entry;
  popover.createEl("div", { cls: "ttimer-popover-title", text: taskText });

  const timeEl = popover.createEl("div", { cls: "ttimer-popover-time", text: formatMs(computeElapsedMs(token, store, Date.now())) });

  const btnRow = popover.createDiv({ cls: "ttimer-popover-buttons" });

  if (token.state !== "running") {
    const startBtn = btnRow.createEl("button", { text: "▶ Start" });
    startBtn.addEventListener("click", async () => {
      console.log(`[ttimer] popover: start clicked id=${id}`);
      await startTimer(id, app, store, saveStore, tokenIndex);
      popover.remove();
    });
  }

  if (token.state === "running") {
    const interval = window.setInterval(() => {
      const fresh = tokenIndex[id];
      if (!fresh) { clearInterval(interval); return; }
      timeEl.setText(formatMs(computeElapsedMs(fresh.token, store, Date.now())));
    }, 1000);

    const pauseBtn = btnRow.createEl("button", { text: "⏸ Pause" });
    pauseBtn.addEventListener("click", async () => {
      console.log(`[ttimer] popover: pause clicked id=${id}`);
      clearInterval(interval);
      await pauseTimer(id, app, store, saveStore, tokenIndex);
      popover.remove();
    });
  }

  const stopBtn = btnRow.createEl("button", { text: "■ Stop" });
  stopBtn.addEventListener("click", async () => {
    console.log(`[ttimer] popover: stop clicked id=${id}`);
    await stopTimer(id, app, store, saveStore, tokenIndex);
    popover.remove();
  });

  // Dismiss
  const dismiss = (e: MouseEvent) => {
    if (!popover.contains(e.target as Node)) {
      console.log(`[ttimer] popover: dismissed by outside click`);
      popover.remove();
      document.removeEventListener("mousedown", dismiss);
    }
  };
  document.addEventListener("mousedown", dismiss);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      console.log(`[ttimer] popover: dismissed by Escape`);
      popover.remove();
    }
  }, { once: true });
}