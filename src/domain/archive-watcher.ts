import { TFile, App } from "obsidian";
import { TimerService } from "./timer-service";
import { TaskLocator } from "./task-locator";

export class ArchiveWatcher {
  constructor(
    private app: App,
    private timerService: TimerService,
    private taskLocator: TaskLocator,
  ) {}

  async handleFileModify(file: TFile): Promise<void> {
    const activeTimers = this.timerService.getActiveTimers()
      .filter(t => t.anchor.filePath === file.path && t.anchor.blockId);

    if (activeTimers.length === 0) return;

    console.log("[ttimer:archive-watcher] checking file", {
      filePath: file.path,
      activeTimerCount: activeTimers.length,
    });

    for (const timer of activeTimers) {
      const task = await this.taskLocator.getTaskByBlockId(
        file.path, timer.anchor.blockId
      );
      if (!task) continue;

      if (task.isCompleted) {
        console.log("[ttimer:archive-watcher] task completed — archiving timer", {
          timerId: timer.id,
          blockId: timer.anchor.blockId,
        });
        this.timerService.archive(timer.id);
      }
    }
  }
}