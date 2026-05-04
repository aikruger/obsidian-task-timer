import { TaskTimerRecord } from "../../../types/models";

export interface ExternalTaskTimerAdapter {
  canImport(data: unknown): boolean;
  importRecords(data: unknown): Promise<TaskTimerRecord[]>;
  exportRecords(records: TaskTimerRecord[]): Promise<unknown>;
}

export class LegacyTaskTimerAdapter implements ExternalTaskTimerAdapter {
  canImport(data: unknown): boolean {
    return false; // Stub
  }

  async importRecords(data: unknown): Promise<TaskTimerRecord[]> {
    return []; // Stub
  }

  async exportRecords(records: TaskTimerRecord[]): Promise<unknown> {
    return null; // Stub
  }
}
