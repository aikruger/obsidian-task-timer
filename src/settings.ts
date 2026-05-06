import { App, PluginSettingTab, Setting } from "obsidian";
import TaskTimerPlugin from "./main";

export interface TaskTimerSettings {
  blockIdPrefix: string;
  archiveOnComplete: boolean;
  allowMultipleRunningTimers: boolean;
  showArchivedInSidebar: boolean;
  exportFolder: string;
}

export const DEFAULT_SETTINGS: TaskTimerSettings = {
  blockIdPrefix: "ttimer",
  archiveOnComplete: true,
  allowMultipleRunningTimers: false,
  showArchivedInSidebar: true,
  exportFolder: "",
};

export class TaskTimerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: TaskTimerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Task Timer settings" });

    new Setting(containerEl)
      .setName("Block ID prefix")
      .setDesc("Prefix for generated task block IDs (default: ttimer).")
      .addText(t => t
        .setValue(this.plugin.settings.blockIdPrefix)
        .onChange(async v => {
          this.plugin.settings.blockIdPrefix = v || "ttimer";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Archive on complete")
      .setDesc("Auto-archive a task timer when its checkbox is marked complete.")
      .addToggle(t => t
        .setValue(this.plugin.settings.archiveOnComplete)
        .onChange(async v => {
          this.plugin.settings.archiveOnComplete = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Allow multiple running timers")
      .setDesc("If off, starting one timer pauses all others.")
      .addToggle(t => t
        .setValue(this.plugin.settings.allowMultipleRunningTimers)
        .onChange(async v => {
          this.plugin.settings.allowMultipleRunningTimers = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Show archived timers in sidebar")
      .addToggle(t => t
        .setValue(this.plugin.settings.showArchivedInSidebar)
        .onChange(async v => {
          this.plugin.settings.showArchivedInSidebar = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Export folder")
      .setDesc("Vault path for exported reports (leave empty for vault root).")
      .addText(t => t
        .setPlaceholder("e.g. reports/timers")
        .setValue(this.plugin.settings.exportFolder)
        .onChange(async v => {
          this.plugin.settings.exportFolder = v;
          await this.plugin.saveSettings();
        }));
  }
}