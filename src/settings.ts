import { App, PluginSettingTab, Setting } from "obsidian";
import TaskTimerPlugin from "./main";

export interface TaskTimerSettings {
  archiveOnComplete: boolean;
  exportFolder: string;
}

export const DEFAULT_SETTINGS: TaskTimerSettings = {
  archiveOnComplete: true,
  exportFolder: "",
};

export class TaskTimerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: TaskTimerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Task Timer Settings").setHeading();

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