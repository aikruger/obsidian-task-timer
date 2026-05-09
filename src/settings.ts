import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import TaskTimerPlugin from "./main";

export interface TaskTimerSettings {
  archiveOnComplete: boolean;
  exportFolder: string;
  uiScale: number; // multiplier: 1.0 = default, range 0.75–2.0
}

export const DEFAULT_SETTINGS: TaskTimerSettings = {
  archiveOnComplete: true,
  exportFolder: "",
  uiScale: 1.0,
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

    new Setting(containerEl)
      .setName("UI scale")
      .setDesc("Adjust the font and button size in the sidebar and popover. Default is 1.0 (100%). Drag right to enlarge.")
      .addSlider(slider => slider
        .setLimits(0.75, 2.0, 0.05)
        .setValue(this.plugin.settings.uiScale)
        .setDynamicTooltip()
        .onChange(async (v) => {
          console.log(`[ttimer:settings] uiScale changed to ${v}`);
          this.plugin.settings.uiScale = v;
          await this.plugin.saveSettings();
          applyUiScale(v);
        }));

    new Setting(containerEl)
      .setName("Clear all timers")
      .setDesc("⚠ Permanently removes all timer tokens from your notes and wipes all recorded time data. This cannot be undone. Use to resolve broken data from older plugin versions.")
      .addButton(btn => btn
        .setButtonText("Clear all timers…")
        .setWarning()
        .onClick(async () => {
          console.log("[ttimer:settings] clear all timers button clicked");
          const confirmed = confirm(
            "This will permanently delete ALL timer tokens from your notes and erase all recorded time.\n\nThis cannot be undone. Are you sure?"
          );
          if (!confirmed) {
            console.log("[ttimer:settings] clear all timers: cancelled by user");
            return;
          }
          const { clearAllTimers } = await import("./domain/transitions");
          await clearAllTimers(
            this.plugin.app,
            this.plugin.store,
            this.plugin.saveStore.bind(this.plugin),
            this.plugin.tokenIndex
          );
          new Notice("All timers cleared.");
          console.log("[ttimer:settings] clear all timers: complete");
        }));
  }
}

export function applyUiScale(scale: number): void {
  console.log(`[ttimer] applyUiScale: scale=${scale}`);
  document.documentElement.style.setProperty("--ttimer-scale", String(scale));
}