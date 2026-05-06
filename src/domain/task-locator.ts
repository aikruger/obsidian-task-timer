import { Editor, App } from "obsidian";
import { extractBlockId, stripTimerSyntax } from "./block-id";

export interface ParsedTask {
  line: number;
  text: string;           // raw line text
  taskText: string;       // stripped task content (no markers)
  isTask: boolean;
  isCompleted: boolean;
  blockId: string | null;
}

export class TaskLocator {
  constructor(private app: App) {}

  getTaskAtCursor(editor: Editor): ParsedTask | null {
    const cursor = editor.getCursor();
    const lineText = editor.getLine(cursor.line);
    const result = this.parseTaskLine(lineText, cursor.line);
    console.log("[ttimer:task-locator] getTaskAtCursor", {
      line: cursor.line,
      lineText: lineText.slice(0, 100),
      result,
    });
    return result;
  }

  parseTaskLine(lineText: string, line: number): ParsedTask | null {
    // Match Obsidian checkbox tasks: "- [ ] text" or "- [x] text"
    const match = lineText.match(/^(\s*[-*]\s+)\[( |x|X)\]\s+(.*)/);
    if (!match) return null;

    const isCompleted = (match[2] ?? "").toLowerCase() === "x";
    const rawContent  = match[3] ?? "";
    const blockId     = extractBlockId(lineText);
    const taskText    = stripTimerSyntax(rawContent);

    console.log("[ttimer:task-locator] parseTaskLine", {
      line, isCompleted, blockId, taskText: taskText.slice(0, 80),
    });

    return { line, text: lineText, taskText, isTask: true, isCompleted, blockId };
  }

  async getTaskByBlockId(filePath: string, blockId: string): Promise<ParsedTask | null> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file) {
      console.warn("[ttimer:task-locator] getTaskByBlockId: file not found", filePath);
      return null;
    }
    // @ts-ignore – TFile
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.includes(blockId)) {
        const parsed = this.parseTaskLine(lines[i] ?? "", i);
        if (parsed) {
          console.log("[ttimer:task-locator] found task by blockId", { blockId, line: i });
          return parsed;
        }
      }
    }
    console.warn("[ttimer:task-locator] blockId not found in file", { blockId, filePath });
    return null;
  }
}