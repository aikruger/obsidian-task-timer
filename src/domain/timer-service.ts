import { TaskTimerRecord, TimerState } from "../types/models";
import { DataStore } from "../persistence/data-store";
import { TimerProvider } from "../providers/timer-provider";
import { InlineMarkerRemover } from "../editor/inline-marker-remover";
import { tlog, twarn } from "../utils/debug-logger";

export class TimerService {
  private events: Record<string, ((...args: unknown[]) => void)[]> = {};

  constructor(
    private dataStore: DataStore,
    private provider: TimerProvider,
    private markerRemover: InlineMarkerRemover
  ) {}

  public on(event: string, callback: (...args: unknown[]) => void) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
  }

  public emit(event: string, ...args: unknown[]) {
    if (!this.events[event]) return;
    this.events[event].forEach(cb => cb(...args));
  }

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

  public async deleteTimer(
    timerId: string,
    options: { removeBlockId: boolean } = { removeBlockId: false }
  ): Promise<void> {
    tlog("timerService", `deleteTimer called`, { timerId, options });

    const timer = this.getTimer(timerId);
    if (!timer) {
      twarn("timerService", `deleteTimer: timer not found`, { timerId });
      return;
    }

    // 1. Stop any running segment first
    if (timer.state === "running") {
      tlog("timerService", `Auto-stopping running timer before delete`, { timerId });
      this.stop(timerId);
    }

    // 2. Remove the inline marker from the markdown file FIRST
    //    so we still have anchor data available
    const removed = await this.markerRemover.removeMarkerFromFile(timer, options);
    if (!removed) {
      twarn("timerService", `Marker removal from file failed or was skipped. Proceeding with record deletion anyway.`, { timerId });
    }

    // 3. Remove the record from the store
    this.dataStore.deleteTimer(timerId);
    tlog("timerService", `✅ Timer record removed from store`, { timerId });

    // 4. Notify provider if applicable
    await this.provider.deleteTimer(timerId).catch((e: unknown) => {
      twarn("timerService", `Provider deleteTimer failed (non-fatal)`, e);
    });

    // 5. Notify UI
    this.emit("timerDeleted", timerId);
    tlog("timerService", `✅ deleteTimer complete`, { timerId });
  }

  public delete(timerId: string) {
    // Legacy alias to not break other un-refactored callers yet
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
