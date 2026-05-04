import { App, MarkdownPostProcessorContext } from "obsidian";
import { TimerService } from "../domain/timer-service";
import TaskGeniusTimerPlugin from "../main";

export class InlineMarkerManager {
  constructor(private app: App, private timerService: TimerService, private plugin: TaskGeniusTimerPlugin) {}

  public postProcessor(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const textNodes = Array.from(el.querySelectorAll("li.task-list-item"));

    textNodes.forEach(node => {
       // Look for block reference ID at the end
       const textContent = node.textContent || "";
       const blockIdMatch = textContent.match(/\^([a-zA-Z0-9-]+)$/);

       if (blockIdMatch) {
           const blockId = `^${blockIdMatch[1]}`;
           // Find if we have a timer for this block ID
           const allTimers = [...this.timerService.getActiveTimers(), ...this.timerService.getArchivedTimers()];
           const timer = allTimers.find(t => t.anchor.blockId === blockId);

           if (timer) {
               // Find the ⏱ marker in the HTML and replace it with our interactive span
               this.enhanceMarker(node as HTMLElement, timer);
           }
       }
    });
  }

  private enhanceMarker(node: HTMLElement, timer: unknown) {
      // Very basic approach: search for ⏱ and wrap it.
      // In a robust implementation we'd walk the DOM tree to replace the exact text node.
      if (node.innerHTML.includes("⏱")) {
          const stateClass = `ttimer-inline-marker--${timer.state}`;
          node.innerHTML = node.innerHTML.replace("⏱", `<span class="ttimer-inline-marker ${stateClass}" data-timer-id="${timer.id}">⏱</span>`);

          // Re-attach listeners since we replaced innerHTML (this is naive, should use better DOM manip)
          const markerSpan = node.querySelector(`span[data-timer-id="${timer.id}"]`);
          if (markerSpan) {
              markerSpan.addEventListener("click", (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  this.openSidebarAndFocus(timer.id);
              });

              markerSpan.addEventListener("mouseover", (e: MouseEvent) => {
                  const modKey = this.plugin.dataStore.data.settings.hoverModifierKey;
                  const isModPressed = (modKey === "Alt" && e.altKey) ||
                                       (modKey === "Ctrl" && e.ctrlKey) ||
                                       (modKey === "Shift" && e.shiftKey) ||
                                       (modKey === "Meta" && e.metaKey);

                  if (isModPressed && this.plugin.dataStore.data.settings.hoverPopupEnabled) {
                      this.plugin.popoverManager.showPopover(e.currentTarget as HTMLElement, timer.id);
                  }
              });
          }
      }
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
      // TODO: scroll to card
  }
}
