import { App } from "obsidian";
import { PluginStore } from "../types/store";
import { LiveTokenIndex } from "../domain/hydration";
import { computeElapsedMs, getCountdownStatus } from "../domain/elapsed";
import { startTimer, pauseTimer, stopTimer, archiveTimer, deleteTimer, resetTimer } from "../domain/transitions";
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

      // Update total time label
      const totalLabel = popover.querySelector<HTMLElement>(".ttimer-popover-total-label");
      if (totalLabel) {
        const liveTotal = computeElapsedMs(fresh.token, store, Date.now());
        totalLabel.textContent = `Total: ${formatMs(liveTotal)}`;
        console.log(`[ttimer] popover tick: updated total label id=${id} liveTotal=${liveTotal}`);
      }

      // Update countdown label
      const cdLabel = popover.querySelector<HTMLElement>(".ttimer-countdown-label");
      if (cdLabel) {
        const cdStatus = getCountdownStatus(id, store, Date.now());
        if (cdStatus) {
          if (cdStatus.isOvertime) {
            cdLabel.textContent = `⚠ Overtime: +${formatMs(cdStatus.overtimeMs)}`;
            cdLabel.classList.add("ttimer-countdown--overtime");
            cdLabel.classList.remove("ttimer-countdown--normal");
          } else {
            cdLabel.textContent = `⏳ ${formatMs(cdStatus.remainingMs)} remaining`;
            cdLabel.classList.remove("ttimer-countdown--overtime");
            cdLabel.classList.add("ttimer-countdown--normal");
          }
        }
      }
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

  // Elapsed time — inline editable when stopped/paused
  const timeEl = popover.createEl("div", { cls: "ttimer-popover-time", text: formatMs(elapsed) });

  if (token.state === "stopped" || token.state === "paused") {
    timeEl.title = "Click to edit time";
    timeEl.style.cursor = "text";
    timeEl.style.textDecoration = "underline dotted";
    timeEl.addEventListener("click", () => {
      console.log(`[ttimer] popover: inline time edit activated id=${id}`);
      const input = document.createElement("input");
      input.type = "text";
      input.value = timeEl.textContent ?? "00:00:00";
      input.style.width = "80px";
      input.style.fontSize = "inherit";
      input.style.fontFamily = "monospace";
      input.style.border = "1px solid var(--interactive-accent)";
      input.style.borderRadius = "3px";
      input.style.padding = "1px 4px";
      input.style.background = "var(--background-primary)";
      input.style.color = "var(--text-normal)";
      input.style.textAlign = "center";
      timeEl.replaceWith(input);
      input.focus();
      input.select();

      const commit = async () => {
        const parts = input.value.trim().split(":").map(Number);
        if (parts.length === 3 && !parts.some(isNaN)) {
          const [h, m, s] = parts as [number, number, number];
          const newMs = ((h * 3600) + (m * 60) + s) * 1000;
          console.log(`[ttimer] popover: inline time edit commit id=${id} newMs=${newMs}`);
          const { editElapsed } = await import("../domain/transitions");
          await editElapsed(id, newMs, app, store, saveStore, tokenIndex);
          popover.remove();
        } else {
          console.warn(`[ttimer] popover: inline time edit invalid="${input.value}"`);
          input.replaceWith(timeEl);
        }
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { input.replaceWith(timeEl); }
      });
    });
  }

  // Total time: sum of all closed segments plus any currently open segment
  const totalElapsed = entry ? computeElapsedMs(entry.token, store, Date.now()) : token.baseMs;
  const allSegs = store.segments[id] ?? [];
  const closedMs = allSegs
    .filter(s => s.endedAt !== undefined)
    .reduce((acc, s) => acc + (s.endedAt! - s.startedAt), 0);
  const sessionCount = allSegs.length;

  const totalRow = popover.createDiv({ cls: "ttimer-popover-total" });
  totalRow.createEl("span", {
    cls: "ttimer-popover-total-label",
    text: `Total: ${formatMs(totalElapsed)}`,
    attr: { title: `${sessionCount} session${sessionCount !== 1 ? "s" : ""}` },
  });
  console.log(`[ttimer] buildPopoverContent: totalElapsed=${totalElapsed} sessions=${sessionCount} id=${id}`);

  // Countdown display (if enabled)
  const meta = store.meta[id];
  const cdStatus = getCountdownStatus(id, store, Date.now());

  if (cdStatus) {
    const cdRow = popover.createDiv({ cls: "ttimer-popover-countdown" });
    if (cdStatus.isOvertime) {
      cdRow.createEl("span", { cls: "ttimer-countdown-label ttimer-countdown--overtime", text: `⚠ Overtime: +${formatMs(cdStatus.overtimeMs)}` });
    } else {
      cdRow.createEl("span", { cls: "ttimer-countdown-label", text: `⏳ ${formatMs(cdStatus.remainingMs)} remaining` });
    }
  }

  // Set countdown button
  const cdBtn = popover.createEl("button", { cls: "ttimer-btn ttimer-btn--countdown", text: "⏳ Set countdown" });
  cdBtn.title = "Set a countdown target for this timer";
  cdBtn.addEventListener("click", async () => {
    console.log(`[ttimer] popover: set countdown clicked id=${id}`);
    const currentTarget = store.meta[id]?.countdownTargetMs;
    const currentMin = currentTarget ? Math.round(currentTarget / 60000) : 25;
    const input = prompt("Set countdown (minutes):", String(currentMin));
    if (input === null) return;
    const mins = parseFloat(input);
    if (isNaN(mins) || mins <= 0) {
      console.warn(`[ttimer] popover: invalid countdown input="${input}"`);
      return;
    }
    const { setCountdown } = await import("../domain/transitions");
    await setCountdown(id, Math.round(mins * 60000), store, saveStore);
    console.log(`[ttimer] popover: countdown set to ${mins} minutes for id=${id}`);
    popover.remove();
  });

  // Single combined button row
  const allBtns = popover.createDiv({ cls: "ttimer-popover-buttons" });

  if (token.state !== "running" && token.state !== "archived") {
    const startBtn = allBtns.createEl("button", { cls: "ttimer-btn ttimer-btn--start", text: "▶" });
    startBtn.title = "Start";
    startBtn.addEventListener("click", async () => {
      console.log(`[ttimer] popover: start clicked id=${id}`);
      await startTimer(id, app, store, saveStore, tokenIndex);
      popover.remove();
    });
  }

  if (token.state === "running") {
    const pauseBtn = allBtns.createEl("button", { cls: "ttimer-btn ttimer-btn--pause", text: "⏸" });
    pauseBtn.title = "Pause";
    pauseBtn.addEventListener("click", async () => {
      console.log(`[ttimer] popover: pause clicked id=${id}`);
      await pauseTimer(id, app, store, saveStore, tokenIndex);
      popover.remove();
    });
  }

  if (token.state !== "stopped" && token.state !== "archived") {
    const stopBtn = allBtns.createEl("button", { cls: "ttimer-btn ttimer-btn--stop", text: "■" });
    stopBtn.title = "Stop";
    stopBtn.addEventListener("click", async () => {
      console.log(`[ttimer] popover: stop clicked id=${id}`);
      await stopTimer(id, app, store, saveStore, tokenIndex);
      popover.remove();
    });
  }

  // Reset button — visible for any non-archived timer that has time accumulated
  if (token.state !== "archived") {
    const currentElapsed = entry ? computeElapsedMs(entry.token, store, Date.now()) : token.baseMs;
    if (currentElapsed > 0) {
      const resetBtn = allBtns.createEl("button", { cls: "ttimer-btn ttimer-btn--reset", text: "↺" });
      resetBtn.title = "Reset timer to zero";
      resetBtn.addEventListener("click", async () => {
        console.log(`[ttimer] popover: reset clicked id=${id}`);
        const confirmed = confirm(`Reset all time on "${taskText}" to zero? This cannot be undone.`);
        if (!confirmed) {
          console.log(`[ttimer] popover: reset cancelled by user id=${id}`);
          return;
        }
        await resetTimer(id, app, store, saveStore, tokenIndex);
        console.log(`[ttimer] popover: reset complete id=${id}`);
        popover.remove();
      });
    }
  }

  if (token.state !== "archived") {
    const archiveBtn = allBtns.createEl("button", { cls: "ttimer-btn ttimer-btn--archive", text: "📦" });
    archiveBtn.title = "Archive";
    archiveBtn.addEventListener("click", async () => {
      console.log(`[ttimer] popover: archive clicked id=${id}`);
      await archiveTimer(id, app, store, saveStore, tokenIndex, "manual");
      popover.remove();
    });
  }

  if (token.state === "archived") {
    const unarchiveBtn = allBtns.createEl("button", { cls: "ttimer-btn ttimer-btn--unarchive", text: "📂" });
    unarchiveBtn.title = "Unarchive";
    unarchiveBtn.addEventListener("click", async () => {
      console.log(`[ttimer] popover: unarchive clicked id=${id}`);
      const { unarchiveTimer } = await import("../domain/transitions");
      await unarchiveTimer(id, app, store, saveStore, tokenIndex);
      popover.remove();
    });
  }

  const deleteBtn = allBtns.createEl("button", { cls: "ttimer-btn ttimer-btn--delete", text: "🗑" });
  deleteBtn.title = "Delete";
  deleteBtn.addEventListener("click", async () => {
    console.log(`[ttimer] popover: delete clicked id=${id}`);
    await deleteTimer(id, app, store, saveStore, tokenIndex);
    popover.remove();
  });
}
