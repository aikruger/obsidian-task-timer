import { Modal, App } from "obsidian";
import { TimerService } from "../domain/timer-service";
import { formatElapsed } from "../domain/time-format";
import TaskTimerPlugin from "../main";

export class TaskTimerModal extends Modal {
  private intervalId: number | null = null;

  constructor(
    app: App,
    private plugin: TaskTimerPlugin,
    private timerId: string,
  ) {
    super(app);
  }

  onOpen(): void {
    console.log("[ttimer:modal] open", { timerId: this.timerId });
    this.render();
    this.intervalId = window.setInterval(() => this.render(), 1000);
  }

  onClose(): void {
    console.log("[ttimer:modal] close", { timerId: this.timerId });
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
    this.intervalId = null;
    this.contentEl.empty();
  }

  render(): void {
    const timer = this.plugin.timerService.getTimer(this.timerId);
    console.log("[ttimer:modal] render", {
      timerId: this.timerId,
      state: timer?.state ?? "not found",
    });

    const { contentEl } = this;
    contentEl.empty();

    if (!timer) {
      contentEl.createEl("p", { text: "Timer not found." });
      return;
    }

    // Header
    contentEl.createEl("h2", { text: timer.anchor.taskTextSnapshot || "Task timer" });

    // Metadata pill
    const meta = contentEl.createEl("div", { cls: "ttimer-modal-meta" });
    meta.createEl("span", { text: timer.anchor.filePath, cls: "ttimer-modal-filepath" });
    if (timer.anchor.headingPath?.length) {
      meta.createEl("span", { text: " › " + timer.anchor.headingPath.join(" › "), cls: "ttimer-modal-heading" });
    }

    // State pill
    const statePill = contentEl.createEl("div", {
      cls: `ttimer-state-pill ttimer-state-pill--${timer.state}`,
      text: timer.state.toUpperCase(),
    });
    statePill.style.marginTop = "var(--size-4-2)";

    // Live count-up
    const elapsed = this.plugin.timerService.getElapsedMs(this.timerId);
    contentEl.createEl("div", {
      cls: "ttimer-modal-elapsed",
      text: formatElapsed(elapsed),
    });

    // Segment count
    contentEl.createEl("p", {
      cls: "ttimer-modal-segments",
      text: `Sessions: ${timer.segments.length}  |  Created: ${new Date(timer.createdAt).toLocaleString()}`,
    });

    // Controls
    const controls = contentEl.createEl("div", { cls: "ttimer-modal-controls" });

    const btnStart = controls.createEl("button", { text: "▶ Start", cls: "ttimer-btn ttimer-btn--start" });
    btnStart.disabled = timer.state === "running" || timer.state === "archived";
    btnStart.addEventListener("click", () => {
      console.log("[ttimer:modal] start clicked", { timerId: this.timerId });
      this.plugin.timerService.start(this.timerId);
      this.render();
    });

    const btnPause = controls.createEl("button", { text: "⏸ Pause", cls: "ttimer-btn ttimer-btn--pause" });
    btnPause.disabled = timer.state !== "running";
    btnPause.addEventListener("click", () => {
      console.log("[ttimer:modal] pause clicked", { timerId: this.timerId });
      this.plugin.timerService.pause(this.timerId);
      this.render();
    });

    const btnStop = controls.createEl("button", { text: "⏹ Stop", cls: "ttimer-btn ttimer-btn--stop" });
    btnStop.disabled = timer.state === "stopped" || timer.state === "archived";
    btnStop.addEventListener("click", () => {
      console.log("[ttimer:modal] stop clicked", { timerId: this.timerId });
      this.plugin.timerService.stop(this.timerId);
      this.render();
    });

    const btnArchive = controls.createEl("button", { text: "📦 Archive", cls: "ttimer-btn ttimer-btn--archive" });
    btnArchive.disabled = timer.state === "archived";
    btnArchive.addEventListener("click", () => {
      console.log("[ttimer:modal] archive clicked", { timerId: this.timerId });
      this.plugin.timerService.archive(this.timerId);
      this.render();
    });

    // Secondary actions
    const secondary = contentEl.createEl("div", { cls: "ttimer-modal-secondary" });

    secondary.createEl("button", { text: "Open in sidebar", cls: "ttimer-btn ttimer-btn--ghost" })
      .addEventListener("click", () => {
        console.log("[ttimer:modal] open sidebar clicked");
        this.plugin.openAnalyticsSidebar();
      });

    secondary.createEl("button", { text: "Open task", cls: "ttimer-btn ttimer-btn--ghost" })
      .addEventListener("click", async () => {
        console.log("[ttimer:modal] open task clicked");
        const file = this.app.vault.getAbstractFileByPath(timer.anchor.filePath);
        if (file) {
          // @ts-ignore
          await this.app.workspace.getLeaf(false).openFile(file);
        }
        this.close();
      });

    secondary.createEl("button", { text: "🗑 Delete", cls: "ttimer-btn ttimer-btn--danger" })
      .addEventListener("click", () => {
        console.log("[ttimer:modal] delete clicked", { timerId: this.timerId });
        this.plugin.timerService.deleteTimer(this.timerId);
        this.close();
      });
  }
}