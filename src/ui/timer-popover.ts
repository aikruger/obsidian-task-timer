import { TimerService } from "../domain/timer-service";
import { formatDurationMs } from "../domain/time-format";
import TaskGeniusTimerPlugin from "../main";

export class TimerPopover {
  public popoverEl: HTMLElement | null = null;
  public currentTimerId: string | null = null;
  public intervalId: number | null = null;
  public showTimeout: number | null = null;
  public hideTimeout: number | null = null;
  public pointerInsideMarker = false;
  public pointerInsidePopover = false;

  constructor(private plugin: TaskGeniusTimerPlugin, private timerService: TimerService) {
    this.handleGlobalClick = this.handleGlobalClick.bind(this);
    this.handleGlobalKeydown = this.handleGlobalKeydown.bind(this);
  }

  public scheduleShow(anchorEl: HTMLElement, timerId: string, evt?: MouseEvent) {
    this.cancelHide();
    if (this.showTimeout) window.clearTimeout(this.showTimeout);
    const delay = this.plugin.dataStore.data.settings.hoverOpenDelayMs ?? 180;
    this.showTimeout = window.setTimeout(() => this.showPopover(anchorEl, timerId), delay);
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

  public showPopover(targetEl: HTMLElement, timerId: string) {
    this.hidePopover();

    const timer = this.timerService.getTimer(timerId);
    if (!timer) return;

    this.currentTimerId = timerId;

    this.popoverEl = document.body.createEl("div", { cls: "ttimer-popover" });
    const rect = targetEl.getBoundingClientRect();

    let top = rect.bottom + 6;
    let left = rect.left;

    const width = 240;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
    if (top + 160 > window.innerHeight - 12) top = rect.top - 160 - 6;

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

    document.addEventListener("click", this.handleGlobalClick);
    document.addEventListener("keydown", this.handleGlobalKeydown);
  }

  public hidePopover() {
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
    this.pointerInsidePopover = false;

    document.removeEventListener("click", this.handleGlobalClick);
    document.removeEventListener("keydown", this.handleGlobalKeydown);
  }

  private render() {
    if (!this.popoverEl || !this.currentTimerId) return;

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
  }

  private handleGlobalClick(e: MouseEvent) {
    if (!this.plugin.dataStore.data.settings.popoverClickOutsideCloses) return;
    if (this.popoverEl && !this.popoverEl.contains(e.target as Node)) {
      this.hidePopover();
    }
  }

  private handleGlobalKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      this.hidePopover();
    }
  }
}
