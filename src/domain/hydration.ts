import { App } from "obsidian";
import { PluginStore } from "../types/store";
import { ParsedToken, parseTokenFromLine } from "../types/token";
import { extractTaskText } from "./transitions";

export interface LiveTokenIndex {
  [id: string]: {
    token: ParsedToken;
    filePath: string;
    lineNo: number;
    taskText: string;
  };
}

export async function hydrateTokenIndex(
  app: App,
  store: PluginStore
): Promise<LiveTokenIndex> {
  console.log(`[ttimer] hydrateTokenIndex: starting vault scan`);
  const index: LiveTokenIndex = {};

  const files = app.vault.getMarkdownFiles();
  console.log(`[ttimer] hydrateTokenIndex: scanning ${files.length} markdown files`);

  for (const file of files) {
    const content = await app.vault.cachedRead(file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const token = parseTokenFromLine(lines[i]!);
      if (token) {
        index[token.id] = {
          token,
          filePath: file.path,
          lineNo: i,
          taskText: extractTaskText(lines[i]!),
        };
        console.log(`[ttimer] hydrateTokenIndex: found token id=${token.id} state=${token.state} file=${file.path} line=${i}`);
      }
    }
  }

  // Reconcile: if store has open segment but token says stopped/paused,
  // close the open segment defensively (crash recovery)
  for (const id of Object.keys(store.segments)) {
    const segments = store.segments[id];
    if (!segments) continue;
    const openSeg = [...segments].reverse().find(s => !s.endedAt);
    if (!openSeg) continue;

    const liveEntry = index[id];
    if (!liveEntry) {
      console.warn(`[ttimer] hydrateTokenIndex: store has open segment for id=${id} but token not found in vault — closing segment defensively`);
      const idx = segments.indexOf(openSeg);
      store.segments[id]![idx] = { ...openSeg, endedAt: Date.now() };
      continue;
    }

    if (liveEntry.token.state !== "running") {
      console.warn(`[ttimer] hydrateTokenIndex: store has open segment for id=${id} but token state=${liveEntry.token.state} — closing segment defensively`);
      const segIdx = segments.indexOf(openSeg);
      store.segments[id]![segIdx] = { ...openSeg, endedAt: Date.now() };
    }
  }

  console.log(`[ttimer] hydrateTokenIndex: complete. found ${Object.keys(index).length} tokens`);
  return index;
}