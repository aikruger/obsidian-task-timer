import { App, MarkdownPostProcessorContext } from "obsidian";
import { TimerService } from "../domain/timer-service";
import TaskGeniusTimerPlugin from "../main";

export class InlineMarkerManager {
  constructor(private app: App, private timerService: TimerService, private plugin: TaskGeniusTimerPlugin) {}

  public postProcessor(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const textNodes = Array.from(el.querySelectorAll("li.task-list-item"));

    textNodes.forEach(node => {
       const textContent = node.textContent || "";
       const blockIdMatch = textContent.match(/\^([a-zA-Z0-9-]+)$/);

       if (blockIdMatch) {
           const blockId = `^${blockIdMatch[1]}`;
           const allTimers = [...this.timerService.getActiveTimers(), ...this.timerService.getArchivedTimers()];
           const timer = allTimers.find(t => t.anchor.blockId === blockId);

           if (timer) {
               this.enhanceMarker(node as HTMLElement, timer);
           }
       }
    });
  }

  private findTimerMarkerNode(root: Node): Node | null {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.includes("⏱")) {
        return node;
      }
    }
    return null;
  }

  private enhanceMarker(node: HTMLElement, timer: import("../types/models").TaskTimerRecord) {
      const textNode = this.findTimerMarkerNode(node);

      if (textNode && textNode.parentNode) {
          const parent = textNode.parentNode;

          // Split the text node around the marker to replace just the marker
          const nodeValue = textNode.nodeValue || "";
          const markerIndex = nodeValue.indexOf("⏱");

          if (markerIndex !== -1) {
              const beforeText = nodeValue.substring(0, markerIndex);
              const afterText = nodeValue.substring(markerIndex + 1);

              const beforeNode = document.createTextNode(beforeText);
              const afterNode = document.createTextNode(afterText);

              const marker = document.createElement("span");
              marker.className = `ttimer-inline-marker ttimer-inline-marker--${timer.state}`;
              marker.dataset.timerId = timer.id;
              marker.textContent = "⏱";

              parent.insertBefore(beforeNode, textNode);
              parent.insertBefore(marker, textNode);
              parent.insertBefore(afterNode, textNode);
              parent.removeChild(textNode);

              marker.addEventListener("click", (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  this.handleClick(e, timer.id, marker);
              });

              marker.addEventListener("mouseenter", (e) => {
                  this.plugin.popoverManager.pointerInsideMarker = true;
                  if (this.shouldOpenPopoverFromEvent(e)) {
                      this.plugin.popoverManager.scheduleShow(marker, timer.id, e);
                  }
              });

              marker.addEventListener("mouseleave", () => {
                  this.plugin.popoverManager.pointerInsideMarker = false;
                  this.plugin.popoverManager.scheduleHide();
              });
          }
      }
  }

  private handleClick(e: MouseEvent, timerId: string, anchorEl: HTMLElement) {
    const action = this.plugin.dataStore.data.settings.clickAction;
    const mode = this.plugin.dataStore.data.settings.hoverTriggerMode;

    if (mode === "click") {
        // In click mode, the click opens the popover, ignore action setting
        this.plugin.popoverManager.showPopover(anchorEl, timerId);
        return;
    }

    if (action === "sidebar" || action === "both") {
        this.openSidebarAndFocus(timerId);
    }
    if (action === "popover" || action === "both") {
        this.plugin.popoverManager.showPopover(anchorEl, timerId);
    }
  }

  private shouldOpenPopoverFromEvent(evt: MouseEvent): boolean {
    const mode = this.plugin.dataStore.data.settings.hoverTriggerMode;
    if (mode === "none") return false;
    if (mode === "hover") return true;
    if (mode === "click") return false; // Handled by click listener
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
