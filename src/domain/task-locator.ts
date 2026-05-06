import { Editor, MarkdownView, TFile, App } from "obsidian";
import { stripInlineTimerSyntax } from "../utils/marker-utils";

export interface TaskLineInfo {
  line: number;
  text: string;
  isTask: boolean;
  isCompleted: boolean;
  blockId?: string;
}

export class TaskLocator {
  constructor(private app: App) {}

  public getTaskAtCursor(editor: Editor): TaskLineInfo | null {
    const cursor = editor.getCursor();
    const lineText = editor.getLine(cursor.line);
    return this.parseTaskLine(lineText, cursor.line);
  }

  public parseTaskLine(lineText: string, lineNumber: number): TaskLineInfo | null {
    const TASK_REGEX = /^(\s*)[-*+]\s*\[([ xX])\]\s*(.*)$/;
    const match = lineText.match(TASK_REGEX);

    if (!match) {
      return null;
    }

    const isCompleted = match[2] === "x" || match[2] === "X";
    let text = match[3] || "";

    const blockIdMatch = text.match(/\s+(\^[a-zA-Z0-9-]+)$/);
    let blockId = undefined;

    if (blockIdMatch) {
      blockId = blockIdMatch[1];
      text = text.replace(blockIdMatch[0], "");
    }

    const strippedText = stripInlineTimerSyntax(text.trim());

    console.debug("[ttimer:taskLocator] parsed task line", {
      line: lineNumber,
      originalText: text,
      strippedText,
      blockId
    });

    return {
      line: lineNumber,
      text: strippedText,
      isTask: true,
      isCompleted,
      blockId,
    };
  }

  public async getTaskByBlockId(file: TFile, blockId: string): Promise<TaskLineInfo | null> {
    const cachedTask = await this.findTaskByBlockIdInCache(file, blockId);
    if (cachedTask) return cachedTask;

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.includes(blockId)) {
        return this.parseTaskLine(line, i);
      }
    }
    return null;
  }

  public async findTaskByBlockIdInCache(
    file: TFile,
    blockId: string
  ): Promise<TaskLineInfo | null> {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache?.listItems) return null;

    // CachedMetadata.listItems gives position and task status but not text content.
    // Read file lines to get text — the cache gives us the line number.
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    for (const item of cache.listItems) {
      if (!item.task) continue; // not a task item
      const lineNum = item.position.start.line;
      const lineText = lines[lineNum] ?? "";
      if (lineText.includes(blockId)) {
        const parsed = this.parseTaskLine(lineText, lineNum);
        if (parsed) return parsed;
      }
    }
    return null;
  }
}
