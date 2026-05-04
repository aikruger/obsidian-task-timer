import { TimerService } from "../domain/timer-service";
import { formatDurationMs } from "../domain/time-format";

export class TimerPopover {
  private popoverEl: HTMLElement | null = null;
  private currentTimerId: string | null = null;
  private intervalId: number | null = null;

  constructor(private timerService: TimerService) {
    this.handleGlobalClick = this.handleGlobalClick.bind(this);
    this.handleGlobalKeydown = this.handleGlobalKeydown.bind(this);
  }

  public showPopover(targetEl: HTMLElement, timerId: string) {
    this.hidePopover();

    const timer = this.timerService.getTimer(timerId);
    if (!timer) return;

    this.currentTimerId = timerId;

    this.popoverEl = document.body.createEl("div", { cls: "ttimer-popover" });
    const rect = targetEl.getBoundingClientRect();

    this.popoverEl.style.top = `${rect.bottom + 5}px`;
    this.popoverEl.style.left = `${rect.left}px`;

    this.render();

    this.intervalId = window.setInterval(() => this.render(), 1000);

    // Close on outside click or escape
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
    this.currentTimerId = null;

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

    this.popoverEl.createEl("div", { text: timer.anchor.taskTextSnapshot, cls: "ttimer-popover-text" });

    const elapsed = this.timerService.getElapsedMs(timer.id);
    this.popoverEl.createEl("div", { text: formatDurationMs(elapsed), cls: "ttimer-popover-time" });

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
  }

  private handleGlobalClick(e: MouseEvent) {
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
