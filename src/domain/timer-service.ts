import { DataStore } from "../persistence/data-store";
import { TaskTimerRecord, TimerState } from "../types";

type TimerEvent = "timerCreated" | "timerUpdated" | "timerDeleted";
type Listener = (id: string) => void;

export class TimerService {
  private listeners: Record<string, Listener[]> = {};

  constructor(private store: DataStore) {}

  on(event: TimerEvent, listener: Listener): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }

  private emit(event: TimerEvent, id: string): void {
    this.listeners[event]?.forEach(fn => fn(id));
  }

  getTimer(id: string): TaskTimerRecord | undefined {
    return this.store.timers.find(t => t.id === id);
  }

  getActiveTimers(): TaskTimerRecord[] {
    return this.store.timers.filter(t => t.state !== "archived");
  }

  getArchivedTimers(): TaskTimerRecord[] {
    return this.store.timers.filter(t => t.state === "archived");
  }

  getTimerByBlockId(blockId: string): TaskTimerRecord | undefined {
    return this.store.timers.find(t => t.anchor.blockId === blockId);
  }

  createTimer(record: TaskTimerRecord): void {
    console.log("[ttimer:service] createTimer", { id: record.id, blockId: record.anchor.blockId });
    this.store.addTimer(record);
    this.emit("timerCreated", record.id);
  }

  start(id: string): void {
    const t = this.getTimer(id);
    if (!t) { console.warn("[ttimer:service] start: not found", id); return; }
    if (t.state === "running") { console.log("[ttimer:service] start: already running", id); return; }

    // pause any other running timer if setting disallows multiple
    this.getActiveTimers()
      .filter(r => r.state === "running" && r.id !== id)
      .forEach(r => this.pause(r.id));

    t.state = "running";
    t.updatedAt = Date.now();
    t.segments.push({ startedAt: Date.now() });
    this.store.updateTimer(t);
    console.log("[ttimer:service] started", { id });
    this.emit("timerUpdated", id);
  }

  pause(id: string): void {
    const t = this.getTimer(id);
    if (!t || t.state !== "running") return;
    const seg = t.segments[t.segments.length - 1];
    if (seg && !seg.endedAt) {
      seg.endedAt = Date.now();
      t.totalMsCached += seg.endedAt - seg.startedAt;
    }
    t.state = "paused";
    t.updatedAt = Date.now();
    this.store.updateTimer(t);
    console.log("[ttimer:service] paused", { id, totalMsCached: t.totalMsCached });
    this.emit("timerUpdated", id);
  }

  stop(id: string): void {
    const t = this.getTimer(id);
    if (!t) return;
    if (t.state === "running") {
      const seg = t.segments[t.segments.length - 1];
      if (seg && !seg.endedAt) {
        seg.endedAt = Date.now();
        t.totalMsCached += seg.endedAt - seg.startedAt;
      }
    }
    t.state = "stopped";
    t.updatedAt = Date.now();
    this.store.updateTimer(t);
    console.log("[ttimer:service] stopped", { id });
    this.emit("timerUpdated", id);
  }

  archive(id: string): void {
    const t = this.getTimer(id);
    if (!t) return;
    if (t.state === "running") this.pause(id);
    const fresh = this.getTimer(id)!;
    fresh.state = "archived";
    fresh.archivedAt = Date.now();
    fresh.updatedAt = Date.now();
    this.store.updateTimer(fresh);
    console.log("[ttimer:service] archived", { id });
    this.emit("timerUpdated", id);
  }

  deleteTimer(id: string): void {
    console.log("[ttimer:service] deleteTimer", { id });
    this.store.deleteTimer(id);
    this.emit("timerDeleted", id);
  }

  getElapsedMs(id: string, now = Date.now()): number {
    const t = this.getTimer(id);
    if (!t) return 0;
    let ms = t.totalMsCached;
    if (t.state === "running" && t.segments.length > 0) {
      const seg = t.segments[t.segments.length - 1];
      if (seg && !seg.endedAt) ms += now - seg.startedAt;
    }
    return ms;
  }
}