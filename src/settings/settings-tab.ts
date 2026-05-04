import { App, PluginSettingTab, Setting } from "obsidian";
import type { PluginSettings } from "../types/models";
import TaskGeniusTimerPlugin from "../main";

export class TaskTimerSettingTab extends PluginSettingTab {
  plugin: TaskGeniusTimerPlugin;
  settings: PluginSettings;

  constructor(app: App, plugin: TaskGeniusTimerPlugin, settings: PluginSettings) {
    super(app, plugin);
    this.plugin = plugin;
    this.settings = settings;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Block ID prefix")
      .setDesc("Prefix used for generated task timer block IDs.")
      .addText((text) =>
        text
          .setPlaceholder("ttimer")
          .setValue(this.settings.blockIdPrefix)
          .onChange(async (value) => {
            this.settings.blockIdPrefix = value || "ttimer";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Marker style")
      .setDesc("Visual style of the inline timer marker.")
      .addDropdown((dropdown) => {
        dropdown.addOption("icon", "Icon (⏱)");
        dropdown.addOption("text", "Text (⏱)");
        dropdown.addOption("token", "Token ([⏱])");
        dropdown.setValue(this.settings.markerStyle);
        dropdown.onChange(async (value: "icon" | "text" | "token") => {
          this.settings.markerStyle = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Archive on complete")
      .setDesc("Automatically archive timer when its task is marked complete.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.archiveOnComplete)
          .onChange(async (value) => {
            this.settings.archiveOnComplete = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Stop instead of archive on complete")
      .setDesc("Stop the timer instead of archiving when the task is marked complete.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.stopInsteadOfArchiveOnComplete)
          .onChange(async (value) => {
            this.settings.stopInsteadOfArchiveOnComplete = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Allow multiple running timers")
      .setDesc("If disabled, starting a timer will pause others.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.allowMultipleRunningTimers)
          .onChange(async (value) => {
            this.settings.allowMultipleRunningTimers = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default sidebar sort")
      .addDropdown((dropdown) => {
        dropdown.addOption("newest", "Newest first");
        dropdown.addOption("oldest", "Oldest first");
        dropdown.setValue(this.settings.defaultSidebarSort);
        dropdown.onChange(async (value: "newest" | "oldest") => {
          this.settings.defaultSidebarSort = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Show archived timers")
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.showArchivedTimers)
          .onChange(async (value) => {
            this.settings.showArchivedTimers = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Hover popup enabled")
      .setDesc("Show controls when hovering over timer marker.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.hoverPopupEnabled)
          .onChange(async (value) => {
            this.settings.hoverPopupEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Trigger mode")
      .setDesc("How to trigger the popover.")
      .addDropdown((dropdown) => {
        dropdown.addOption("hover", "Hover only");
        dropdown.addOption("alt", "Alt + hover");
        dropdown.addOption("ctrl", "Ctrl + hover");
        dropdown.addOption("shift", "Shift + hover");
        dropdown.addOption("meta", "Meta + hover");
        dropdown.addOption("alt-ctrl", "Alt+Ctrl + hover");
        dropdown.addOption("alt-shift", "Alt+Shift + hover");
        dropdown.addOption("click", "Click on marker");
        dropdown.addOption("none", "None");
        dropdown.setValue(this.settings.hoverTriggerMode);
        dropdown.onChange(async (value: "hover" | "alt" | "ctrl" | "shift" | "meta" | "alt-ctrl" | "alt-shift" | "click" | "none") => {
          this.settings.hoverTriggerMode = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Click action")
      .setDesc("Action when clicking the marker.")
      .addDropdown((dropdown) => {
        dropdown.addOption("sidebar", "Open sidebar");
        dropdown.addOption("popover", "Open popover");
        dropdown.addOption("both", "Both");
        dropdown.setValue(this.settings.clickAction);
        dropdown.onChange(async (value: "sidebar" | "popover" | "both") => {
          this.settings.clickAction = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Hover open delay (ms)")
      .addText((text) =>
        text
          .setValue(this.settings.hoverOpenDelayMs.toString())
          .onChange(async (value) => {
            this.settings.hoverOpenDelayMs = parseInt(value, 10) || 180;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Hover close delay (ms)")
      .addText((text) =>
        text
          .setValue(this.settings.hoverCloseDelayMs.toString())
          .onChange(async (value) => {
            this.settings.hoverCloseDelayMs = parseInt(value, 10) || 220;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Persistent popover")
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.popoverPersistent)
          .onChange(async (value) => {
            this.settings.popoverPersistent = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Click outside closes popover")
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.popoverClickOutsideCloses)
          .onChange(async (value) => {
            this.settings.popoverClickOutsideCloses = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Export folder")
      .setDesc("Where to save exported reports.")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(this.settings.exportFolder)
          .onChange(async (value) => {
            this.settings.exportFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Provider selection")
      .setDesc("Backend used for timer data. Advanced providers may be experimental.")
      .addDropdown((dropdown) => {
        dropdown.addOption("internal", "Internal");
        dropdown.addOption("timekeep", "Timekeep (Experimental)");
        dropdown.addOption("legacy-task-timer", "Legacy Task Timer (Experimental)");
        dropdown.setValue(this.settings.providerSelection);
        dropdown.onChange(async (value: "internal" | "timekeep" | "legacy-task-timer") => {
          this.settings.providerSelection = value;
          await this.plugin.saveSettings();
        });
      });
  }
}
