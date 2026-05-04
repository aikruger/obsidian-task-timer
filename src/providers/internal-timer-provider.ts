import { TaskTimerRecord } from "../types/models";
import { TimerProvider } from "./timer-provider";

export class InternalTimerProvider implements TimerProvider {
  id = "internal";

  async init(): Promise<void> {
    // Internal provider relies on main plugin persistence
  }

  async createTimer(record: TaskTimerRecord): Promise<void> {
    // No-op, managed by DataStore
  }

  async updateTimer(record: TaskTimerRecord): Promise<void> {
    // No-op, managed by DataStore
  }

  async archiveTimer(record: TaskTimerRecord): Promise<void> {
    // No-op, managed by DataStore
  }

  async deleteTimer(timerId: string): Promise<void> {
    // No-op, managed by DataStore
  }

  async exportData(format: "json" | "csv" | "md" | "pdf"): Promise<void> {
    // Left to reporting service to fulfill
    throw new Error("Internal provider doesn't handle export directly");
  }
}
