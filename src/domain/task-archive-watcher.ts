import { App, TFile } from "obsidian";
import { TimerService } from "./timer-service";
import { TaskLocator } from "./task-locator";
import { PluginSettings } from "../types/models";

export class TaskArchiveWatcher {
  constructor(
    private app: App,
    private timerService: TimerService,
    private taskLocator: TaskLocator,
    private settings: PluginSettings
  ) {}

  public async handleFileModify(file: TFile) {
    if (!this.settings.archiveOnComplete && !this.settings.stopInsteadOfArchiveOnComplete) {
      return;
    }

    // A real implementation would diff the file content or metadata cache
    // to find newly completed tasks. For simplicity we'll just scan
    // active timers in this file and check their completion state.

    const activeTimersInFile = this.timerService.getActiveTimers()
      .filter(t => t.anchor.filePath === file.path);

    if (activeTimersInFile.length === 0) return;

    for (const timer of activeTimersInFile) {
        if (!timer.anchor.blockId) continue;

        const taskInfo = await this.taskLocator.getTaskByBlockId(file, timer.anchor.blockId);
        if (taskInfo && taskInfo.isCompleted) {
            if (this.settings.stopInsteadOfArchiveOnComplete) {
                 this.timerService.stop(timer.id);
            } else {
                 this.timerService.archive(timer.id);
            }
        }
    }
  }
}
