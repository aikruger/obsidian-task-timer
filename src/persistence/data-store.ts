import { Plugin } from "obsidian";
import { PluginData, TaskTimerRecord } from "../types";

const CURRENT_VERSION = 1;

export class DataStore {
  private saveTimeout: number | null = null;
  data: PluginData = { version: CURRENT_VERSION, timers: [] };

  constructor(private plugin: Plugin) {}

  get timers(): TaskTimerRecord[] {
    return this.data.timers;
  }

  async load(): Promise<void> {
    const raw = await this.plugin.loadData() as Partial<PluginData> | null;
    console.log("[ttimer:data-store] loaded raw", raw);
    if (!raw) {
      this.data = { version: CURRENT_VERSION, timers: [] };
      return;
    }
    this.data = {
      version: raw.version ?? CURRENT_VERSION,
      timers:  raw.timers  ?? [],
    };
    console.log("[ttimer:data-store] parsed", {
      version: this.data.version,
      timerCount: this.data.timers.length,
    });
  }

  addTimer(record: TaskTimerRecord): void {
    this.data.timers.push(record);
    console.log("[ttimer:data-store] addTimer", { id: record.id });
    this.save();
  }

  updateTimer(record: TaskTimerRecord): void {
    const idx = this.data.timers.findIndex(t => t.id === record.id);
    if (idx === -1) {
      console.warn("[ttimer:data-store] updateTimer: record not found", record.id);
      return;
    }
    this.data.timers[idx] = record;
    this.save();
  }

  deleteTimer(id: string): void {
    console.log("[ttimer:data-store] deleteTimer", { id });
    this.data.timers = this.data.timers.filter(t => t.id !== id);
    this.save();
  }

  save(): void {
    if (this.saveTimeout !== null) window.clearTimeout(this.saveTimeout);
    this.saveTimeout = window.setTimeout(async () => {
      await this.plugin.saveData(this.data);
      console.log("[ttimer:data-store] saved", { timerCount: this.data.timers.length });
    }, 500);
  }

  async saveImmediate(): Promise<void> {
    if (this.saveTimeout !== null) window.clearTimeout(this.saveTimeout);
    this.saveTimeout = null;
    await this.plugin.saveData(this.data);
    console.log("[ttimer:data-store] saveImmediate complete");
  }
}