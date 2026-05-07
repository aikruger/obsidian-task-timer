import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType, MatchDecorator } from "@codemirror/view";
import TaskTimerPlugin from "../main";
import { TOKEN_REGEX } from "../types/token";
import { showTimerPopover } from "./timer-popover";

class TimerMarkerWidget extends WidgetType {
  constructor(
    private rawToken: string,
    private plugin: TaskTimerPlugin
  ) { super(); }

  eq(other: TimerMarkerWidget): boolean {
    return other.rawToken === this.rawToken;
  }

  toDOM(): HTMLElement {
    TOKEN_REGEX.lastIndex = 0;
    const match = TOKEN_REGEX.exec(this.rawToken);
    if (!match) return document.createElement("span");

    const id = match[1]!;
    const state = match[2]! as import("../types/token").TimerState;
    const baseMs = parseInt(match[3]!, 10);

    const el = document.createElement("span");
    el.className = `ttimer-inline-marker ttimer-inline-marker--${state}`;

    let icon = "⏱";
    if (state === "running") icon = "▶";
    if (state === "paused")  icon = "⏸";
    if (state === "stopped") icon = "■";
    if (state === "archived") icon = "📦";

    const iconSpan = el.createSpan({ cls: "ttimer-pill-icon", text: icon });
    const timeSpan = el.createSpan({ cls: "ttimer-pill-time", text: formatPillMs(this.computeElapsed(id, baseMs, state)) });

    el.title = `Task timer: ${state}`;

    // Live update for running timers
    if (state === "running") {
      const interval = window.setInterval(() => {
        timeSpan.textContent = formatPillMs(this.computeElapsed(id, baseMs, state));
      }, 1000);
      // Clean up when the element is removed from DOM
      const observer = new MutationObserver(() => {
        if (!document.contains(el)) {
          console.log(`[ttimer:inline-marker] pill removed from DOM, clearing interval id=${id}`);
          clearInterval(interval);
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(`[ttimer:inline-marker] clicked id=${id}`);
      showTimerPopover(
        this.plugin.app,
        el,
        id,
        this.plugin.tokenIndex,
        this.plugin.store,
        this.plugin.saveStore.bind(this.plugin),
        this.plugin
      );
    });

    return el;
  }

  private computeElapsed(id: string, baseMs: number, state: string): number {
    if (state !== "running") return baseMs;
    // Find the open segment start in the store
    const segments = this.plugin.store.segments[id] ?? [];
    const openSeg = [...segments].reverse().find(s => !s.endedAt);
    if (!openSeg) {
      console.warn(`[ttimer:inline-marker] running timer has no open segment id=${id}`);
      return baseMs;
    }
    return baseMs + (Date.now() - openSeg.startedAt);
  }

  ignoreEvent(): boolean { return false; }
}

function formatPillMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

export function buildInlineDecoratorExtension(plugin: TaskTimerPlugin) {
  const matcher = new MatchDecorator({
    regexp: TOKEN_REGEX,
    decoration: (match, view, pos) => {
      return Decoration.replace({
        widget: new TimerMarkerWidget(match[0], plugin),
      });
    }
  });

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = matcher.updateDeco(update, this.decorations);
      }
    },
    { decorations: v => v.decorations }
  );
}
