import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { TimerService } from "../domain/timer-service";
import { formatDurationMs } from "../domain/time-format";
import TaskGeniusTimerPlugin from "../main";

export const TASK_TIMER_VIEW_TYPE = "task-timer-view";

export class TaskTimerView extends ItemView {
  private timerService: TimerService;
  private intervalId: number | null = null;
  private plugin: TaskGeniusTimerPlugin;

  constructor(leaf: WorkspaceLeaf, timerService: TimerService, plugin: TaskGeniusTimerPlugin) {
    super(leaf);
    this.timerService = timerService;
    this.plugin = plugin;
  }

  getViewType(): string {
    return TASK_TIMER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Task Timers";
  }

  getIcon(): string {
    return "clock";
  }

  async onOpen() {
    this.render();
    this.intervalId = window.setInterval(() => this.render(), 1000);
    // Bind to datastore changes via events eventually
  }

  async onClose() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
    }
  }

  public render() {
    const container = this.containerEl.children[1];
    if (!container) return;
    container.empty();

    const activeTimers = this.timerService.getActiveTimers();
    activeTimers.sort((a, b) => b.updatedAt - a.updatedAt);

    const activeSection = (container as HTMLElement).createEl("div");
    activeSection.createEl("h3", { text: "Active Timers" });

    if (activeTimers.length === 0) {
      activeSection.createEl("p", { text: "No active timers." });
    }

    activeTimers.forEach((timer) => {
      const card = activeSection.createEl("div", {
        cls: `ttimer-card ttimer-card--${timer.state}`,
      });

      card.createEl("div", { text: timer.anchor.taskTextSnapshot, cls: "ttimer-card-text" });
      const elapsed = this.timerService.getElapsedMs(timer.id);
      card.createEl("div", { text: formatDurationMs(elapsed), cls: "ttimer-card-time" });

      const btnContainer = card.createEl("div", { cls: "ttimer-card-buttons" });

      if (timer.state !== "running") {
        const startBtn = btnContainer.createEl("button", { text: "Start" });
        startBtn.onclick = () => {
          this.timerService.start(timer.id);
          this.render();
        };
      }

      if (timer.state === "running") {
        const pauseBtn = btnContainer.createEl("button", { text: "Pause" });
        pauseBtn.onclick = () => {
          this.timerService.pause(timer.id);
          this.render();
        };
      }

      if (timer.state !== "stopped") {
        const stopBtn = btnContainer.createEl("button", { text: "Stop" });
        stopBtn.onclick = () => {
          this.timerService.stop(timer.id);
          this.render();
        };
      }

      const openTaskBtn = btnContainer.createEl("button", { text: "Open Task" });
      openTaskBtn.onclick = async () => {
         const file = this.app.vault.getAbstractFileByPath(timer.anchor.filePath);
         if (file && file instanceof TFile) {
             const leaf = this.app.workspace.getLeaf(false);
             await leaf.openFile(file);
             // In a real implementation we'd scroll to the line/block
         }
      };

      const archiveBtn = btnContainer.createEl("button", { text: "Archive" });
      archiveBtn.onclick = () => {
        this.timerService.archive(timer.id);
        this.render();
      };
    });

    if (this.plugin.dataStore.data.settings.showArchivedTimers) {
        const archivedTimers = this.timerService.getArchivedTimers();
        if (archivedTimers.length > 0) {
            const archiveSection = (container as HTMLElement).createEl("div");
            archiveSection.createEl("h3", { text: "Archived Timers" });

            archivedTimers.forEach(timer => {
                const card = archiveSection.createEl("div", {
                    cls: `ttimer-card ttimer-card--archived`,
                });
                card.createEl("div", { text: timer.anchor.taskTextSnapshot, cls: "ttimer-card-text" });
                const elapsed = this.timerService.getElapsedMs(timer.id);
                card.createEl("div", { text: formatDurationMs(elapsed), cls: "ttimer-card-time" });
            });
        }
    }
  }
}
