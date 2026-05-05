import { App, MarkdownPostProcessorContext } from "obsidian";
import { TimerService } from "../domain/timer-service";
import TaskGeniusTimerPlugin from "../main";

export class InlineMarkerManager {
  constructor(private app: App, private timerService: TimerService, private plugin: TaskGeniusTimerPlugin) {}

  public postProcessor(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const textNodes = Array.from(el.querySelectorAll("li.task-list-item"));

    textNodes.forEach(node => {
       const textContent = node.textContent || "";
       const match = textContent.match(/\^([a-zA-Z0-9-]+)/);

       if (match) {
           if (node.querySelector(".ttimer-inline-marker")) return;

           console.debug("[ttimer] postProcessor li", { text: textContent });
           console.debug("[ttimer] matched block id", match[1]);

           const blockId = `^${match[1]}`;
           const allTimers = [...this.timerService.getActiveTimers(), ...this.timerService.getArchivedTimers()];
           const timer = allTimers.find(t => t.anchor.blockId === blockId);

           if (timer) {
               this.enhanceMarker(node as HTMLElement, timer);
           }
       }
    });
  }

  private findTimerMarkerNode(root: Node): Node | null {
    if ((root as HTMLElement).querySelector && (root as HTMLElement).querySelector(".ttimer-inline-marker")) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.includes("⏱")) {
        return node;
      }
    }
    console.debug("[ttimer] no marker text node found", root.textContent);
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
              this.bindMarkerEvents(marker, timer);
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
          this.bindMarkerEvents(fallback, timer);
      }
  }

  private bindMarkerEvents(markerEl: HTMLElement, timer: import("../types/models").TaskTimerRecord) {
    markerEl.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      console.debug("[ttimer] marker click", timer.id);
      this.handleClick(evt, timer.id, markerEl);
    });

    markerEl.addEventListener("mouseenter", (evt) => {
      this.plugin.popoverManager.pointerInsideMarker = true;

      if (!this.plugin.dataStore.data.settings.hoverPopupEnabled) return;
      if (!this.shouldOpenPopoverFromEvent(evt)) return;

      this.plugin.popoverManager.scheduleShow(markerEl, timer.id, evt);
    });

    markerEl.addEventListener("mouseleave", () => {
      this.plugin.popoverManager.pointerInsideMarker = false;
      this.plugin.popoverManager.scheduleHide();
    });
  }

  private handleClick(e: MouseEvent, timerId: string, anchorEl: HTMLElement) {
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

  private shouldOpenPopoverFromEvent(evt: MouseEvent): boolean {
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
