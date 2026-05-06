import { TimerService } from "../domain/timer-service";
import { formatDurationMs } from "../domain/time-format";
import TaskGeniusTimerPlugin from "../main";

export class TimerPopover {
  public popoverEl: HTMLElement | null = null;
  public currentTimerId: string | null = null;
  public currentAnchorEl: HTMLElement | null = null;
  public openedAt: number = 0;
  public intervalId: number | null = null;
  public showTimeout: number | null = null;
  public hideTimeout: number | null = null;
  public pointerInsideMarker = false;
  public pointerInsidePopover = false;

  constructor(private plugin: TaskGeniusTimerPlugin, private timerService: TimerService) {
    this.currentAnchorEl = null;
    this.openedAt = 0;
    this.handleGlobalClick = this.handleGlobalClick.bind(this);
    this.handleGlobalKeydown = this.handleGlobalKeydown.bind(this);
  }

  public togglePopover(anchorEl: HTMLElement, timerId: string) {
    if (this.popoverEl && this.currentTimerId === timerId) {
      console.debug("[ttimer] togglePopover -> hide", timerId);
      this.hidePopover();
      return;
    }
    console.debug("[ttimer] togglePopover -> show", timerId);
    this.showPopover(anchorEl, timerId);
  }

  public scheduleShow(anchorEl: HTMLElement, timerId: string, evt?: MouseEvent) {
    this.cancelHide();
    if (this.showTimeout) window.clearTimeout(this.showTimeout);

    const delay = this.plugin.dataStore.data.settings.hoverOpenDelayMs ?? 180;
    console.debug("[ttimer] scheduleShow", { timerId, delay });

    this.showTimeout = window.setTimeout(() => {
      this.showPopover(anchorEl, timerId);
    }, delay);
  }

  public scheduleHide() {
    if (this.plugin.dataStore.data.settings.popoverPersistent) return;
    if (this.hideTimeout) window.clearTimeout(this.hideTimeout);
    const delay = this.plugin.dataStore.data.settings.hoverCloseDelayMs ?? 220;
    this.hideTimeout = window.setTimeout(() => {
      if (!this.pointerInsideMarker && !this.pointerInsidePopover) {
        this.hidePopover();
      }
    }, delay);
  }

  public cancelHide() {
    if (this.hideTimeout) {
      window.clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  public showPopover(anchorEl: HTMLElement, timerId: string) {
    const timer = this.timerService.getTimer(timerId);
    if (!timer) {
      console.debug("[ttimer] showPopover aborted: timer missing", timerId);
      return;
    }

    if (this.popoverEl) this.hidePopover();

    this.currentTimerId = timerId;
    this.currentAnchorEl = anchorEl;
    this.openedAt = Date.now();

    this.popoverEl = document.body.createEl("div", { cls: "ttimer-popover" });
    console.debug("[ttimer] showPopover created", { timerId });

    const rect = anchorEl.getBoundingClientRect();

    let top = rect.bottom + 6;
    let left = rect.left;

    const width = 240;
    const estimatedHeight = 180;

    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
    if (top + estimatedHeight > window.innerHeight - 12) top = Math.max(12, rect.top - estimatedHeight - 6);

    this.popoverEl.style.position = "fixed";
    this.popoverEl.style.zIndex = "9999";
    this.popoverEl.style.top = `${top}px`;
    this.popoverEl.style.left = `${left}px`;

    this.render();

    this.intervalId = window.setInterval(() => this.render(), 1000);

    this.popoverEl.addEventListener("mouseenter", () => {
      this.pointerInsidePopover = true;
      this.cancelHide();
    });

    this.popoverEl.addEventListener("mouseleave", () => {
      this.pointerInsidePopover = false;
      this.scheduleHide();
    });

    window.setTimeout(() => {
      document.addEventListener("click", this.handleGlobalClick);
      document.addEventListener("keydown", this.handleGlobalKeydown);
    }, 0);
  }

  public hidePopover() {
    console.debug("[ttimer] hidePopover", this.currentTimerId);

    if (this.popoverEl) {
      this.popoverEl.remove();
      this.popoverEl = null;
    }
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.showTimeout !== null) {
      window.clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }
    this.cancelHide();
    this.currentTimerId = null;
    this.currentAnchorEl = null;
    this.openedAt = 0;
    this.pointerInsidePopover = false;
    this.pointerInsideMarker = false;

    document.removeEventListener("click", this.handleGlobalClick);
    document.removeEventListener("keydown", this.handleGlobalKeydown);
  }

  private render() {
    if (!this.popoverEl || !this.currentTimerId) return;

    console.debug("[ttimer] render popover", this.currentTimerId);

    const timer = this.timerService.getTimer(this.currentTimerId);
    if (!timer) {
      this.hidePopover();
      return;
    }

    this.popoverEl.empty();

    const header = this.popoverEl.createEl("div", { cls: "ttimer-popover-header" });
    header.style.display = "flex";
    header.style.justifyContent = "space-between";

    header.createEl("div", { text: timer.anchor.taskTextSnapshot, cls: "ttimer-popover-text" });

    const closeBtn = header.createEl("button", { text: "×", cls: "ttimer-popover-close" });
    closeBtn.onclick = () => this.hidePopover();

    const elapsed = this.timerService.getElapsedMs(timer.id);
    this.popoverEl.createEl("div", { text: formatDurationMs(elapsed), cls: "ttimer-popover-time" });
    this.popoverEl.createEl("div", { text: timer.state, cls: `ttimer-popover-badge ttimer-popover-badge--${timer.state}` });

    const btnContainer = this.popoverEl.createEl("div", { cls: "ttimer-popover-buttons" });

    if (timer.state !== "running") {
      const startBtn = btnContainer.createEl("button", { text: "Start" });
      startBtn.onclick = (e) => {
          e.stopPropagation();
          this.timerService.start(timer.id);
          this.render();
      };
    }

    if (timer.state === "running") {
      const pauseBtn = btnContainer.createEl("button", { text: "Pause" });
      pauseBtn.onclick = (e) => {
          e.stopPropagation();
          this.timerService.pause(timer.id);
          this.render();
      };
    }

    if (timer.state !== "stopped") {
      const stopBtn = btnContainer.createEl("button", { text: "Stop" });
      stopBtn.onclick = (e) => {
          e.stopPropagation();
          this.timerService.stop(timer.id);
          this.render();
      };
    }

    const openSidebarBtn = this.popoverEl.createEl("button", { text: "Open in sidebar", cls: "ttimer-popover-open-sidebar" });
    openSidebarBtn.style.marginTop = "10px";
    openSidebarBtn.onclick = (e) => {
      e.stopPropagation();
      this.hidePopover();
      this.plugin.openSidebar();
    };

    const deleteBtn = this.popoverEl.createEl("button", {
      text: "Delete",
      cls: "ttimer-popover-delete"
    });

    deleteBtn.onclick = async (evt) => {
      evt.stopPropagation();

      const timerToDel = this.timerService.getTimer(timer.id);
      if (!timerToDel) return;

      if (timerToDel.state === "running") {
        this.timerService.stop(timerToDel.id);
      }

      const confirmed = window.confirm(`Delete timer for "${timerToDel.anchor.taskTextSnapshot}"?`);
      if (!confirmed) return;

      await this.plugin.deleteTimerAndMaybeCleanup(timerToDel.id, {
        removeMarker: false,
        removeBlockId: false
      });

      this.hidePopover();
    };
  }

  private handleGlobalClick(evt: MouseEvent) {
    if (!this.plugin.dataStore.data.settings.popoverClickOutsideCloses) return;
    if (!this.popoverEl) return;

    if (Date.now() - this.openedAt < 100) {
      console.debug("[ttimer] ignoring global click immediately after open");
      return;
    }

    const target = evt.target as Node;
    if (this.popoverEl.contains(target)) return;
    if (this.currentAnchorEl && this.currentAnchorEl.contains && this.currentAnchorEl.contains(target)) return;

    console.debug("[ttimer] outside click -> hide");
    this.hidePopover();
  }

  private handleGlobalKeydown(evt: KeyboardEvent) {
    if (evt.key === "Escape") {
      console.debug("[ttimer] Escape -> hide");
      this.hidePopover();
    }
  }
}
