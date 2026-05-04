import { App, Modal } from "obsidian";
import { TimerService } from "../domain/timer-service";
import { formatDurationMs } from "../domain/time-format";

export class StatsModal extends Modal {
  constructor(app: App, private timerService: TimerService) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Timer Statistics" });

    const activeTimers = this.timerService.getActiveTimers();
    const archivedTimers = this.timerService.getArchivedTimers();

    let totalActiveMs = 0;
    activeTimers.forEach(t => totalActiveMs += this.timerService.getElapsedMs(t.id));

    let totalArchivedMs = 0;
    archivedTimers.forEach(t => totalArchivedMs += this.timerService.getElapsedMs(t.id));

    contentEl.createEl("p", { text: `Active Timers: ${activeTimers.length}` });
    contentEl.createEl("p", { text: `Archived Timers: ${archivedTimers.length}` });
    contentEl.createEl("p", { text: `Total Active Time: ${formatDurationMs(totalActiveMs)}` });
    contentEl.createEl("p", { text: `Total Archived Time: ${formatDurationMs(totalArchivedMs)}` });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
