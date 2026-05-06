import { App, MarkdownPostProcessorContext } from "obsidian";
import { TimerService } from "../domain/timer-service";
import TaskGeniusTimerPlugin from "../main";

export class InlineMarkerManager {
  constructor(private app: App, private timerService: TimerService, private plugin: TaskGeniusTimerPlugin) {}

  public postProcessor(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const filePath = ctx.sourcePath;

    const allTimers = [
      ...this.timerService.getActiveTimers(),
      ...this.timerService.getArchivedTimers(),
    ];

    const timersForFile = allTimers.filter(
      (t) => t.anchor.filePath === filePath && t.anchor.blockId
    );

    for (const timer of timersForFile) {
      if (!timer.anchor.blockId) continue;

      const rawId = timer.anchor.blockId.replace(/^\^/, "");

      // Strategy 1: Obsidian renders block IDs as <span id="blockid"> or <span id="^blockid">
      let anchorEl: Element | null =
        el.querySelector(`span#${CSS.escape(rawId)}`) ??
        el.querySelector(`span[id="${rawId}"]`) ??
        el.querySelector(`span[id="^${rawId}"]`);

      // Strategy 2: scan all text nodes for the raw block ID token as fallback
      if (!anchorEl) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
          if (node.nodeValue?.includes(timer.anchor.blockId)) {
            anchorEl = node.parentElement;
            break;
          }
        }
      }

      // Strategy 3: check if the container element itself contains the block ID in its text
      if (!anchorEl && el.textContent?.includes(timer.anchor.blockId)) {
        anchorEl = el;
      }

      if (!anchorEl) {
        console.debug("[ttimer] postProcessor: no anchor found for blockId", timer.anchor.blockId);
        continue;
      }

      const p: Element | null =
        anchorEl.closest("li.task-list-item") ??
        anchorEl.closest("li") ??
        anchorEl.closest("p") ??
        anchorEl;

      if (!p) continue;

      if (p.querySelector(`.ttimer-inline-marker[data-timer-id="${timer.id}"]`)) {
        continue;
      }

      console.debug("[ttimer] postProcessor matched block element", { timerId: timer.id, rawId });
      this.enhanceMarker(p as HTMLElement, timer);
    }
  }

  private findTimerMarkerNode(root: Node): Node | null {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.includes("⏱")) {
        return node;
      }
    }
    console.debug("[ttimer] no marker text node found", root.textContent?.slice(0, 80));
    return null;
  }

  private enhanceMarker(node: HTMLElement, timer: import("../types/models").TaskTimerRecord) {
      if (node.querySelector(`.ttimer-inline-marker[data-timer-id="${timer.id}"]`)) return;

      const textNode = this.findTimerMarkerNode(node);

      if (textNode && textNode.parentNode) {
          const parent = textNode.parentNode;

          // Split the text node around the marker to replace just the marker
          const nodeValue = textNode.nodeValue || "";
          const markerIndex = nodeValue.indexOf("⏱");

          if (markerIndex !== -1) {
              const beforeText = nodeValue.substring(0, markerIndex);
              const afterText = nodeValue.substring(markerIndex + 1);

              if (beforeText) {
                  parent.insertBefore(document.createTextNode(beforeText), textNode);
              }

              const marker = document.createElement("span");
              marker.className = `ttimer-inline-marker ttimer-inline-marker--${timer.state}`;
              marker.dataset.timerId = timer.id;
              marker.textContent = "⏱";
              marker.title = `Task Timer: ${timer.anchor.taskTextSnapshot}`;

              parent.insertBefore(marker, textNode);

              if (afterText) {
                  parent.insertBefore(document.createTextNode(afterText), textNode);
              }

              parent.removeChild(textNode);

              console.debug("[ttimer] enhanced marker", { timerId: timer.id, task: timer.anchor.taskTextSnapshot });
          }
      } else {
          const fallback = document.createElement("span");
          fallback.className = `ttimer-inline-marker ttimer-inline-marker--${timer.state}`;
          fallback.dataset.timerId = timer.id;
          fallback.textContent = "⏱";
          fallback.title = `Task Timer: ${timer.anchor.taskTextSnapshot}`;
          node.appendChild(document.createTextNode(" "));
          node.appendChild(fallback);

          console.debug("[ttimer] enhanced fallback marker", { timerId: timer.id, task: timer.anchor.taskTextSnapshot });
      }
  }

  public handleClick(e: MouseEvent, timerId: string, anchorEl: HTMLElement) {
    const clickAction = this.plugin.dataStore.data.settings.clickAction;
    console.debug("[ttimer] handleClick", { timerId, clickAction });

    if (clickAction === "none") return;

    if (clickAction === "sidebar") {
      this.openSidebarAndFocus(timerId);
      return;
    }

    if (clickAction === "popover") {
      this.plugin.popoverManager.togglePopover(anchorEl, timerId);
      return;
    }

    if (clickAction === "both") {
      this.openSidebarAndFocus(timerId);
      this.plugin.popoverManager.showPopover(anchorEl, timerId);
    }
  }

  public shouldOpenPopoverFromEvent(evt: MouseEvent): boolean {
    const mode = this.plugin.dataStore.data.settings.hoverTriggerMode;
    if (mode === "none") return false;
    if (mode === "hover") return true;
    if (mode === "alt") return evt.altKey;
    if (mode === "ctrl") return evt.ctrlKey;
    if (mode === "shift") return evt.shiftKey;
    if (mode === "meta") return evt.metaKey;
    if (mode === "alt-ctrl") return evt.altKey && evt.ctrlKey;
    if (mode === "alt-shift") return evt.altKey && evt.shiftKey;
    return false;
  }

  private async openSidebarAndFocus(timerId: string) {
      const leaves = this.app.workspace.getLeavesOfType("task-timer-view");
      if (leaves.length === 0) {
          const rightLeaf = this.app.workspace.getRightLeaf(false);
          if (rightLeaf) {
              await rightLeaf.setViewState({ type: "task-timer-view" });
          }
      }
      const newLeaves = this.app.workspace.getLeavesOfType("task-timer-view");
      if (newLeaves.length > 0 && newLeaves[0]) {
          this.app.workspace.revealLeaf(newLeaves[0]);
      }
  }
}
