import { Editor, Menu, TFile } from "obsidian";
import { TimerService } from "../domain/timer-service";
import { TaskLocator } from "../domain/task-locator";
import TaskTimerPlugin from "../main";

export function registerContextMenu(plugin: TaskTimerPlugin): void {
  plugin.registerEvent(
    plugin.app.workspace.on(
      "editor-menu",
      (menu: Menu, editor: Editor, view: { file: TFile | null }) => {
        const task = plugin.taskLocator.getTaskAtCursor(editor);
        if (!task?.isTask) {
          console.log("[ttimer:context-menu] not a task line — skipping");
          return;
        }

        const filePath = view.file?.path ?? "";
        const timer = task.blockId
          ? plugin.timerService.getTimerByBlockId(task.blockId)
          : undefined;

        console.log("[ttimer:context-menu] building menu", {
          filePath,
          line: task.line,
          blockId: task.blockId,
          timerId: timer?.id ?? null,
          state: timer?.state ?? null,
        });

        menu.addSeparator();

        if (!timer) {
          menu.addItem(item =>
            item.setTitle("⏱ Attach task timer")
                .setIcon("timer")
                .onClick(() => {
                  console.log("[ttimer:context-menu] attach timer clicked");
                  plugin.attachTimerToTask(editor, view.file);
                })
          );
        } else {
          if (timer.state !== "running") {
            menu.addItem(item =>
              item.setTitle("▶ Start timer")
                  .setIcon("play")
                  .onClick(() => {
                    console.log("[ttimer:context-menu] start clicked", timer.id);
                    plugin.timerService.start(timer.id);
                  })
            );
          }

          if (timer.state === "running") {
            menu.addItem(item =>
              item.setTitle("⏸ Pause timer")
                  .setIcon("pause")
                  .onClick(() => {
                    console.log("[ttimer:context-menu] pause clicked", timer.id);
                    plugin.timerService.pause(timer.id);
                  })
            );
          }

          if (timer.state !== "stopped") {
            menu.addItem(item =>
              item.setTitle("⏹ Stop timer")
                  .setIcon("square")
                  .onClick(() => {
                    console.log("[ttimer:context-menu] stop clicked", timer.id);
                    plugin.timerService.stop(timer.id);
                  })
            );
          }

          if (timer.state !== "archived") {
            menu.addItem(item =>
              item.setTitle("📦 Archive timer")
                  .setIcon("archive")
                  .onClick(() => {
                    console.log("[ttimer:context-menu] archive clicked", timer.id);
                    plugin.timerService.archive(timer.id);
                  })
            );
          }

          menu.addItem(item =>
            item.setTitle("🗑 Delete timer")
                .setIcon("trash")
                .onClick(() => {
                  console.log("[ttimer:context-menu] delete clicked", timer.id);
                  plugin.timerService.deleteTimer(timer.id);
                })
          );

          menu.addItem(item =>
            item.setTitle("⏱ Open timer modal")
                .setIcon("clock")
                .onClick(() => {
                  console.log("[ttimer:context-menu] open modal clicked", timer.id);
                  plugin.openTimerModal(timer.id);
                })
          );
        }

        menu.addSeparator();
      }
    )
  );
}