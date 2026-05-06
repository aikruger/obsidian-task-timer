import { App, Modal, TFile } from "obsidian";
import { formatDurationMs } from "../domain/time-format";
import { ConfirmModal } from "./confirm-modal";
import TaskGeniusTimerPlugin from "../main";

export class TaskTimerControlModal extends Modal {
  private intervalId: number | null = null;

  constructor(
    app: App,
    private plugin: TaskGeniusTimerPlugin,
    private timerId: string
  ) {
    super(app);
  }

  onOpen() {
    console.debug("[ttimer:modal] open", { timerId: this.timerId });
    this.render();
    this.intervalId = window.setInterval(() => this.render(), 1000);
  }

  onClose() {
    console.debug("[ttimer:modal] close", { timerId: this.timerId });
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.contentEl.empty();
  }

  private render() {
    const timer = this.plugin.timerService.getTimer(this.timerId);
    console.debug("[ttimer:modal] render", {
      timerId: this.timerId,
      state: timer?.state
    });

    if (!timer) {
      this.contentEl.empty();
      this.contentEl.createEl("p", { text: "Timer not found." });
      return;
    }

    this.contentEl.empty();

    this.contentEl.createEl("h2", {
      text: timer.anchor.taskTextSnapshot || "Task timer"
    });

    const metadataContainer = this.contentEl.createDiv({ cls: "ttimer-modal-metadata" });
    const fileOrNoteName = timer.anchor.filePath || "Unknown file";
    metadataContainer.createEl("p", { text: `File: ${fileOrNoteName}` });

    this.contentEl.createEl("div", {
      cls: "ttimer-modal-state ttimer-modal-state--" + timer.state,
      text: timer.state
    });

    this.contentEl.createEl("div", {
      cls: "ttimer-modal-time",
      text: formatDurationMs(this.plugin.timerService.getElapsedMs(timer.id))
    });

    const controls = this.contentEl.createDiv({ cls: "ttimer-modal-controls" });

    const startBtn = controls.createEl("button", { text: "Start" });
    startBtn.disabled = timer.state === "running" || timer.state === "archived";
    startBtn.onclick = () => {
      console.debug("[ttimer:modal] start clicked", { timerId: timer.id });
      this.plugin.timerService.start(timer.id);
      this.render();
    };

    const pauseBtn = controls.createEl("button", { text: "Pause" });
    pauseBtn.disabled = timer.state !== "running";
    pauseBtn.onclick = () => {
      console.debug("[ttimer:modal] pause clicked", { timerId: timer.id });
      this.plugin.timerService.pause(timer.id);
      this.render();
    };

    const stopBtn = controls.createEl("button", { text: "Stop" });
    stopBtn.disabled = timer.state === "stopped" || timer.state === "archived";
    stopBtn.onclick = () => {
      console.debug("[ttimer:modal] stop clicked", { timerId: timer.id });
      this.plugin.timerService.stop(timer.id);
      this.render();
    };

    const secondary = this.contentEl.createDiv({ cls: "ttimer-modal-secondary" });

    const archiveBtn = secondary.createEl("button", { text: "Archive" });
    archiveBtn.disabled = timer.state === "archived";
    archiveBtn.onclick = () => {
      console.debug("[ttimer:modal] archive clicked", { timerId: timer.id });
      this.plugin.timerService.archive(timer.id);
      this.render();
    };

    const openSidebarBtn = secondary.createEl("button", { text: "Open in sidebar" });
    openSidebarBtn.onclick = () => {
      this.plugin.openSidebar().catch(console.error);
    };

    const openTaskBtn = secondary.createEl("button", { text: "Open task" });
    openTaskBtn.onclick = () => {
      const file = this.app.vault.getAbstractFileByPath(timer.anchor.filePath);
      if (file instanceof TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        leaf.openFile(file).catch(console.error);
      }
    };

    const deleteBtn = secondary.createEl("button", {
      text: "Delete",
      cls: "ttimer-btn-danger"
    });
    deleteBtn.onclick = () => {
      console.debug("[ttimer:modal] delete clicked", { timerId: timer.id });
      new ConfirmModal(
        this.app,
        `Delete timer for:\n"${timer.anchor.taskTextSnapshot.slice(0, 60)}"`,
        "This will remove the ⏱ marker from the task line.",
        (confirmed) => {
          if (!confirmed) return;
          const removeBlockId = this.plugin.dataStore.data.settings.removeBlockIdOnDelete ?? false;
          this.plugin.timerService.deleteTimer(timer.id, { removeBlockId }).then(() => {
            this.close();
          }).catch(console.error);
        }
      ).open();
    };

    const footer = this.contentEl.createDiv({ cls: "ttimer-modal-footer" });
    footer.createEl("small", {
        text: `Created: ${new Date(timer.createdAt).toLocaleString()} | Segments: ${timer.segments.length} | Block ID: ${timer.anchor.blockId || "N/A"}`
    });
  }
}
