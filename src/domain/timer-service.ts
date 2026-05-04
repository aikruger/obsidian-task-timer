import { TaskTimerRecord, TimerState } from "../types/models";
import { DataStore } from "../persistence/data-store";

export class TimerService {
  constructor(private dataStore: DataStore) {}

  public getTimer(id: string): TaskTimerRecord | undefined {
    return this.dataStore.timers.find((t) => t.id === id);
  }

  public getActiveTimers(): TaskTimerRecord[] {
    return this.dataStore.timers.filter((t) => t.state !== "archived");
  }

  public getArchivedTimers(): TaskTimerRecord[] {
    return this.dataStore.timers.filter((t) => t.state === "archived");
  }

  public createTimer(timer: TaskTimerRecord) {
    this.dataStore.addTimer(timer);
  }

  public start(timerId: string) {
    const timer = this.getTimer(timerId);
    if (!timer) return;

    if (timer.state === "running") return;

    if (this.dataStore.data.settings.allowMultipleRunningTimers === false) {
      const runningTimers = this.getActiveTimers().filter(
        (t) => t.state === "running" && t.id !== timerId
      );
      for (const rt of runningTimers) {
        this.pause(rt.id);
      }
    }

    timer.state = "running";
    timer.updatedAt = Date.now();
    timer.segments.push({ startedAt: Date.now() });
    this.dataStore.updateTimer(timer);
  }

  public pause(timerId: string) {
    const timer = this.getTimer(timerId);
    if (!timer || timer.state !== "running") return;

    timer.state = "paused";
    timer.updatedAt = Date.now();
    const openSegment = timer.segments[timer.segments.length - 1];
    if (openSegment && !openSegment.endedAt) {
      openSegment.endedAt = Date.now();
      timer.totalMsCached += openSegment.endedAt - openSegment.startedAt;
    }
    this.dataStore.updateTimer(timer);
  }

  public stop(timerId: string) {
    const timer = this.getTimer(timerId);
    if (!timer || timer.state === "stopped" || timer.state === "archived") return;

    if (timer.state === "running") {
      const openSegment = timer.segments[timer.segments.length - 1];
      if (openSegment && !openSegment.endedAt) {
        openSegment.endedAt = Date.now();
        timer.totalMsCached += openSegment.endedAt - openSegment.startedAt;
      }
    }

    timer.state = "stopped";
    timer.updatedAt = Date.now();
    this.dataStore.updateTimer(timer);
  }

  public archive(timerId: string) {
    const timer = this.getTimer(timerId);
    if (!timer || timer.state === "archived") return;

    if (timer.state === "running") {
      this.pause(timerId);
    }

    timer.state = "archived";
    timer.updatedAt = Date.now();
    timer.archivedAt = Date.now();
    this.dataStore.updateTimer(timer);
  }

  public delete(timerId: string) {
    this.dataStore.deleteTimer(timerId);
  }

  public getElapsedMs(timerId: string, now: number = Date.now()): number {
    const timer = this.getTimer(timerId);
    if (!timer) return 0;

    let total = timer.totalMsCached;
    if (timer.state === "running" && timer.segments.length > 0) {
      const openSegment = timer.segments[timer.segments.length - 1];
      if (openSegment && !openSegment.endedAt) {
        total += now - openSegment.startedAt;
      }
    }
    return total;
  }
}
