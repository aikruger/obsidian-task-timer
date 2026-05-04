import { TaskTimerRecord } from "../types/models";
import { TimerProvider } from "./timer-provider";

export class TimekeepCompatProvider implements TimerProvider {
  id = "timekeep";

  async init(): Promise<void> {
    // Stub for future timekeep compatibility
  }

  async createTimer(record: TaskTimerRecord): Promise<void> {
    // Stub
  }

  async updateTimer(record: TaskTimerRecord): Promise<void> {
    // Stub
  }

  async archiveTimer(record: TaskTimerRecord): Promise<void> {
    // Stub
  }

  async deleteTimer(timerId: string): Promise<void> {
    // Stub
  }

  async exportData(format: "json" | "csv" | "md" | "pdf"): Promise<void> {
    // Stub
  }
}
