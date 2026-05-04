import { Editor, MarkdownView, TFile, App } from "obsidian";

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
    const taskRegex = /^\s*-\s*\[([ xX])\]\s*(.*)$/;
    const match = lineText.match(taskRegex);

    if (!match) {
      return null;
    }

    const isCompleted = match[1] === "x" || match[1] === "X";
    let text = match[2] || "";

    const blockIdMatch = text.match(/\s+(\^[a-zA-Z0-9-]+)$/);
    let blockId = undefined;

    if (blockIdMatch) {
      blockId = blockIdMatch[1];
      text = text.replace(blockIdMatch[0], "");
    }

    return {
      line: lineNumber,
      text: text.trim(),
      isTask: true,
      isCompleted,
      blockId,
    };
  }

  public getTaskByBlockId(file: TFile, blockId: string): Promise<TaskLineInfo | null> {
    // In a full implementation we'd use Obsidian's metadata cache to find block IDs quickly,
    // or fallback to scanning the file. For now, we do a basic file scan.
    return this.app.vault.read(file).then((content) => {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line && line.includes(blockId)) {
          return this.parseTaskLine(line, i);
        }
      }
      return null;
    });
  }
}
