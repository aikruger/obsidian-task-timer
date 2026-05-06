import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { TimerService } from "../domain/timer-service";
import TaskTimerPlugin from "../main";
import { formatElapsed } from "../domain/time-format";
import { extractBlockId } from "../domain/block-id";

class TimerPillWidget extends WidgetType {
  constructor(
    private timerId: string,
    private service: TimerService,
    private plugin: TaskTimerPlugin,
  ) { super(); }

  eq(other: TimerPillWidget): boolean {
    return other.timerId === this.timerId;
  }

  toDOM(): HTMLElement {
    const timer = this.service.getTimer(this.timerId);
    const el = document.createElement("span");
    el.className = `ttimer-pill ttimer-pill--${timer?.state ?? "stopped"}`;
    el.dataset.timerId = this.timerId;

    const elapsed = this.service.getElapsedMs(this.timerId);
    el.textContent = `⏱ ${formatElapsed(elapsed)}`;
    el.title = `Task timer: ${timer?.anchor.taskTextSnapshot ?? ""}`;

    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("[ttimer:pill] clicked", { timerId: this.timerId });
      this.plugin.openTimerModal(this.timerId);
    });

    console.log("[ttimer:inline-decorator] rendered pill", {
      timerId: this.timerId,
      state: timer?.state,
      elapsed,
    });

    return el;
  }

  ignoreEvent(): boolean { return false; }
}

export function buildInlineDecoratorExtension(plugin: TaskTimerPlugin) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const filePath = plugin.app.workspace.getActiveFile()?.path ?? "";

        console.log("[ttimer:inline-decorator] buildDecorations", { filePath });

        for (let i = 0; i < view.visibleRanges.length; i++) {
          const range = view.visibleRanges[i];
          if (!range) continue;
          const { from, to } = range;
          const text = view.state.sliceDoc(from, to);
          const lines = text.split("\n");
          let pos = from;

          for (const lineText of lines) {
            const blockId = extractBlockId(lineText);
            if (blockId) {
              const timer = plugin.timerService.getTimerByBlockId(blockId);
              if (timer) {
                const lineEnd = pos + lineText.length;
                const deco = Decoration.widget({
                  widget: new TimerPillWidget(timer.id, plugin.timerService, plugin),
                  side: 1,
                });
                // Place pill at end of line before block ID
                const insertAt = Math.min(
                  lineEnd,
                  pos + lineText.indexOf(blockId) - 1
                );
                builder.add(insertAt, insertAt, deco);
                console.log("[ttimer:inline-decorator] added pill at pos", {
                  pos: insertAt, blockId, timerId: timer.id,
                });
              }
            }
            pos += lineText.length + 1; // +1 for newline
          }
        }

        return builder.finish();
      }
    },
    { decorations: v => v.decorations }
  );
}