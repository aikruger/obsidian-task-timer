import { Editor, Menu, TFile } from "obsidian";
import TaskTimerPlugin from "../main";
import { parseTokenFromLine } from "../types/token";
import { attachTimerToCurrentTask } from "../editor/attach-timer";
import { startTimer, pauseTimer, stopTimer, archiveTimer } from "../domain/transitions";

export function registerContextMenu(plugin: TaskTimerPlugin): void {
  plugin.registerEvent(
    plugin.app.workspace.on(
      "editor-menu",
      (menu: Menu, editor: Editor, view: { file: TFile | null }) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        if (line.trim() === "") {
          console.log(`[ttimer:context-menu] empty line, skipping`);
          return;
        }

        const token = parseTokenFromLine(line);

        menu.addSeparator();

        if (!token) {
          menu.addItem(item =>
            item.setTitle("⏱ Attach task timer")
                .setIcon("timer")
                .onClick(async () => {
                  console.log("[ttimer:context-menu] attach timer clicked");
                  if (view.file) {
                    await attachTimerToCurrentTask(editor, view.file, plugin.store, plugin.saveStore.bind(plugin), plugin.tokenIndex);
                  }
                })
          );
        } else {
          if (token.state !== "running") {
            menu.addItem(item =>
              item.setTitle("▶ Start timer")
                  .setIcon("play")
                  .onClick(async () => {
                    console.log("[ttimer:context-menu] start clicked", token.id);
                    await startTimer(token.id, plugin.app, plugin.store, plugin.saveStore.bind(plugin), plugin.tokenIndex);
                  })
            );
          }

          if (token.state === "running") {
            menu.addItem(item =>
              item.setTitle("⏸ Pause timer")
                  .setIcon("pause")
                  .onClick(async () => {
                    console.log("[ttimer:context-menu] pause clicked", token.id);
                    await pauseTimer(token.id, plugin.app, plugin.store, plugin.saveStore.bind(plugin), plugin.tokenIndex);
                  })
            );
          }

          if (token.state !== "stopped") {
            menu.addItem(item =>
              item.setTitle("⏹ Stop timer")
                  .setIcon("square")
                  .onClick(async () => {
                    console.log("[ttimer:context-menu] stop clicked", token.id);
                    await stopTimer(token.id, plugin.app, plugin.store, plugin.saveStore.bind(plugin), plugin.tokenIndex);
                  })
            );
          }

          if (token.state !== "archived") {
            menu.addItem(item =>
              item.setTitle("📦 Archive timer")
                  .setIcon("archive")
                  .onClick(async () => {
                    console.log("[ttimer:context-menu] archive clicked", token.id);
                    await archiveTimer(token.id, plugin.app, plugin.store, plugin.saveStore.bind(plugin), plugin.tokenIndex);
                  })
            );
          }
        }

        menu.addSeparator();
      }
    )
  );
}