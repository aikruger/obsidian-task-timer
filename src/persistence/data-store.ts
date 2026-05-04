import { PluginData, TaskTimerRecord } from "../types/models";
import { Plugin } from "obsidian";

export class DataStore {
  private plugin: Plugin;
  private saveTimeout: number | null = null;
  public data: PluginData;

  constructor(plugin: Plugin, data: PluginData) {
    this.plugin = plugin;
    this.data = data;
  }

  get timers(): TaskTimerRecord[] {
    return this.data.timers;
  }

  async save(): Promise<void> {
    if (this.saveTimeout) {
      window.clearTimeout(this.saveTimeout);
    }
    return new Promise((resolve) => {
      this.saveTimeout = window.setTimeout(async () => {
        await this.plugin.saveData(this.data);
        resolve();
      }, 500);
    });
  }

  async saveImmediate(): Promise<void> {
    if (this.saveTimeout) {
      window.clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    await this.plugin.saveData(this.data);
  }

  addTimer(timer: TaskTimerRecord) {
    this.data.timers.push(timer);
    this.save();
  }

  updateTimer(timer: TaskTimerRecord) {
    const index = this.data.timers.findIndex((t) => t.id === timer.id);
    if (index !== -1) {
      this.data.timers[index] = timer;
      this.save();
    }
  }

  deleteTimer(timerId: string) {
    this.data.timers = this.data.timers.filter((t) => t.id !== timerId);
    this.save();
  }
}
