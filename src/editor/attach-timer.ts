import { Editor, Notice, TFile } from "obsidian";
import { PluginStore } from "../types/store";
import { buildToken, parseTokenFromLine } from "../types/token";
import { generateTokenId } from "../utils/id";
import { isTaskLine } from "../domain/resolve-location";
import { extractTaskText } from "../domain/transitions";
import { LiveTokenIndex } from "../domain/hydration";

export function insertTokenIntoLine(line: string, token: string): string {
  // Detect block ID at end
  const blockIdMatch = /(\s+\^[a-zA-Z0-9-]+)$/.exec(line);
  if (blockIdMatch) {
    const pos = line.length - blockIdMatch[0].length;
    const result = line.slice(0, pos) + " " + token + blockIdMatch[0];
    console.log(`[ttimer] insertTokenIntoLine: inserted before block ID at pos=${pos}`);
    return result;
  }
  // Detect Tasks plugin date fields
  const tasksDateMatch = /(\s+[📅⏳🛫✅][^\n]*)$/.exec(line);
  if (tasksDateMatch) {
    const pos = line.length - tasksDateMatch[0].length;
    const result = line.slice(0, pos) + " " + token + tasksDateMatch[0];
    console.log(`[ttimer] insertTokenIntoLine: inserted before Tasks date fields at pos=${pos}`);
    return result;
  }
  // Default: append
  console.log(`[ttimer] insertTokenIntoLine: appending to end of line`);
  return line + " " + token;
}

export async function attachTimerToCurrentTask(
  editor: Editor,
  file: TFile,
  store: PluginStore,
  saveStore: () => Promise<void>,
  tokenIndex: LiveTokenIndex
): Promise<string | null> {
  const cursor = editor.getCursor();
  const line = editor.getLine(cursor.line);

  console.log(`[ttimer] attachTimerToCurrentTask: file=${file.path} lineNo=${cursor.line} line="${line}"`);

  // Guard: not a task line
  if (!isTaskLine(line)) {
    console.warn(`[ttimer] attachTimerToCurrentTask: line is not a task line, aborting`);
    new Notice("Place cursor on a markdown task line first.");
    return null;
  }

  // Guard: already has a token
  const existing = parseTokenFromLine(line);
  if (existing) {
    console.log(`[ttimer] attachTimerToCurrentTask: token already exists id=${existing.id}, returning existing id`);
    return existing.id;
  }

  const id = generateTokenId();
  const token = buildToken(id, "stopped", 0);

  // Insert token at end of task text, before any trailing block ID
  const newLine = insertTokenIntoLine(line, token);
  editor.setLine(cursor.line, newLine);

  console.log(`[ttimer] attachTimerToCurrentTask: inserted token id=${id} newLine="${newLine}"`);

  // Register in store meta
  store.meta[id] = {
    id,
    filePath: file.path,
    line: cursor.line,
    taskTextSnapshot: extractTaskText(line),
    firstSeenAt: Date.now(),
  };
  store.segments[id] = [];

  tokenIndex[id] = {
      token: {
          id,
          raw: token,
          state: "stopped",
          baseMs: 0
      },
      filePath: file.path,
      lineNo: cursor.line,
      taskText: extractTaskText(line)
  };

  await saveStore();
  console.log(`[ttimer] attachTimerToCurrentTask: store saved for id=${id}`);

  return id;
}