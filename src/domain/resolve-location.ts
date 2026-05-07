import { App, TFile } from "obsidian";
import { PluginStore } from "../types/store";
import { parseTokenFromLine } from "../types/token";

export interface TokenLocation {
  file: TFile;
  lineNo: number;
  line: string;
}

export function isTaskLine(line: string): boolean {
  return /^[\s>]*[-*]\s+\[( |x|X)\]/.test(line);
}

export async function resolveTokenLocation(
  id: string,
  app: App,
  store: PluginStore
): Promise<TokenLocation | null> {
  console.log(`[ttimer] resolveTokenLocation: id=${id}`);

  const meta = store.meta[id];
  if (!meta) {
    console.warn(`[ttimer] resolveTokenLocation: no meta for id=${id}`);
    return null;
  }

  const file = app.vault.getAbstractFileByPath(meta.filePath);
  if (!(file instanceof TFile)) {
    console.warn(`[ttimer] resolveTokenLocation: file not found path=${meta.filePath}`);
    return null;
  }

  const content = await app.vault.read(file);
  const lines = content.split("\n");

  // Strategy 1: check stored line number first (fast path)
  const hintLine = lines[meta.line];
  if (hintLine) {
    const parsed = parseTokenFromLine(hintLine);
    if (parsed && parsed.id === id) {
      console.log(`[ttimer] resolveTokenLocation: fast-path hit at line=${meta.line}`);
      return { file, lineNo: meta.line, line: hintLine };
    }
  }

  // Strategy 2: scan whole file for token id
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseTokenFromLine(lines[i]!);
    if (parsed && parsed.id === id) {
      console.log(`[ttimer] resolveTokenLocation: scan found token at line=${i} (was stored at ${meta.line})`);
      // Update meta with new line number
      store.meta[id] = { ...meta, line: i };
      return { file, lineNo: i, line: lines[i]! };
    }
  }

  // Strategy 3: fuzzy match by task text snapshot in same file
  const snapshot = meta.taskTextSnapshot.slice(0, 30);
  for (let i = 0; i < lines.length; i++) {
    if (isTaskLine(lines[i]!) && lines[i]!.includes(snapshot)) {
      console.warn(`[ttimer] resolveTokenLocation: fuzzy match at line=${i}, token may have been removed — line="${lines[i]}"`);
      // Token was removed from line — do not mutate file here, just warn
      return null;
    }
  }

  console.error(`[ttimer] resolveTokenLocation: token id=${id} not found anywhere in file=${meta.filePath}`);
  return null;
}