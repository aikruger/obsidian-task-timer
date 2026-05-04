import { TaskTimerRecord } from "../types/models";

export interface TimerProvider {
  id: string;
  init(): Promise<void>;
  createTimer(record: TaskTimerRecord): Promise<void>;
  updateTimer(record: TaskTimerRecord): Promise<void>;
  archiveTimer(record: TaskTimerRecord): Promise<void>;
  deleteTimer(timerId: string): Promise<void>;
  exportData(format: "json" | "csv" | "md" | "pdf"): Promise<void>;
  importData?(payload: unknown): Promise<void>;
}
