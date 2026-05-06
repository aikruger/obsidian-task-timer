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
    const match = TOKEN_REGEX.exec(this.rawToken);
    if (!match) return document.createElement("span");

    const id = match[1]!;
    const state = match[2]!;

    const el = document.createElement("span");
    el.className = `ttimer-inline-marker ttimer-inline-marker--${state}`;

    let icon = "⏱";
    if (state === "running") icon = "▶";
    if (state === "paused") icon = "⏸";
    if (state === "stopped") icon = "■";
    if (state === "archived") icon = "📦";

    el.textContent = icon;
    el.title = `Task timer: ${state}`;

    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(`[ttimer:inline-marker] clicked id=${id}`);
      showTimerPopover(this.plugin.app, el, id, this.plugin.tokenIndex, this.plugin.store, this.plugin.saveStore.bind(this.plugin));
    });

    return el;
  }

  ignoreEvent(): boolean { return false; }
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