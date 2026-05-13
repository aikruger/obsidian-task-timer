import { App, TFile } from "obsidian";
import { PluginStore } from "../types/store";
import { parseTokenFromLine } from "../types/token";
import { archiveTimer } from "./transitions";
import { LiveTokenIndex } from "./hydration";
import { TaskTimerSettings } from "../settings";

export function isTaskCompleted(line: string): boolean {
  return /^[\s>]*- \[x\]/i.test(line);
}

export function registerCompletionWatcher(
  app: App,
  tokenIndex: LiveTokenIndex,
  store: PluginStore,
  saveStore: () => Promise<void>,
  settings: TaskTimerSettings
): void {
  console.log(`[ttimer] registerCompletionWatcher: registering vault modify listener`);

  app.vault.on("modify", async (abstractFile) => {
    if (!(abstractFile instanceof TFile)) return;
    if (abstractFile.extension !== "md") return;

    console.log(`[ttimer] completionWatcher: file modified path=${abstractFile.path}`);

    const content = await app.vault.cachedRead(abstractFile);
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const token = parseTokenFromLine(lines[i]!);
      if (!token) continue;
      if (token.state === "archived") continue;

      // Check if task is now complete
      const isComplete = isTaskCompleted(lines[i]!);
      if (!isComplete) continue;

      if (!settings.archiveOnComplete) {
        console.log(`[ttimer] completionWatcher: archiveOnComplete=false, skipping id=${token.id}`);
        continue;
      }

      console.log(`[ttimer] completionWatcher: task completed with active timer id=${token.id}, archiving`);
      await archiveTimer(token.id, app, store, saveStore, tokenIndex, "task-completed");

      // Update in-memory index
      if (tokenIndex[token.id]) {
        tokenIndex[token.id] = {
          ...tokenIndex[token.id]!,
          token: { ...token, state: "archived" },
        };
      }
    }
  });
}