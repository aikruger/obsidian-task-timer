import { App, MarkdownPostProcessorContext } from "obsidian";
import { TimerService } from "../domain/timer-service";
import TaskGeniusTimerPlugin from "../main";
import { tlog, twarn, terr } from "../utils/debug-logger";

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

    tlog("postProcessor", `Running for file: ${filePath}`, {
      timerCount: timersForFile.length,
      containerTextSnippet: el.textContent?.slice(0, 120)
    });

    if (timersForFile.length === 0) {
      tlog("postProcessor", "No timers with blockIds for this file — skipping");
      return;
    }

    for (const timer of timersForFile) {
      if (!timer.anchor.blockId) continue;

      const rawId = timer.anchor.blockId.replace(/^\^/, "");

      tlog("postProcessor", `Searching DOM for blockId: "${rawId}"`, {
        timerId: timer.id,
        taskText: timer.anchor.taskTextSnapshot
      });

      // Strategy 1: Obsidian renders block IDs as <span id="blockid"> or <span id="^blockid">
      let anchorEl: Element | null =
        el.querySelector(`span#${CSS.escape(rawId)}`) ??
        el.querySelector(`span[id="${rawId}"]`) ??
        el.querySelector(`span[id="^${rawId}"]`);

      if (anchorEl) {
        tlog("postProcessor", `✅ Strategy 1 matched: <span id>`, anchorEl);
      } else {
        twarn("postProcessor", `Strategy 1 failed: no <span id="${rawId}"> found`);
      }

      // Strategy 2: scan all text nodes for the raw block ID token as fallback
      if (!anchorEl) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
          if (node.nodeValue?.includes(timer.anchor.blockId)) {
            anchorEl = node.parentElement;
            tlog("postProcessor", `✅ Strategy 2 matched: text node contains blockId`, {
              nodeValue: node.nodeValue?.slice(0, 80),
              parentTag: anchorEl?.tagName
            });
            break;
          }
        }
        if (!anchorEl) {
          twarn("postProcessor", `Strategy 2 failed: no text node contains blockId "${timer.anchor.blockId}"`);
        }
      }

      // Strategy 3: check if the container element itself contains the block ID in its text
      if (!anchorEl && el.textContent?.includes(timer.anchor.blockId)) {
        anchorEl = el;
        tlog("postProcessor", `✅ Strategy 3 matched: container el contains blockId`);
      } else if (!anchorEl) {
        terr("postProcessor", `All 3 strategies failed for blockId "${rawId}". DOM dump below:`);
        console.debug("[ttimer:postProcessor] Container innerHTML:", el.innerHTML.slice(0, 500));
        continue;
      }

      const p: Element | null =
        anchorEl.closest("li.task-list-item") ??
        anchorEl.closest("li") ??
        anchorEl.closest("p") ??
        anchorEl;

      if (!p) {
        terr("postProcessor", `Could not find parent <li> or <p> for anchor`, anchorEl);
        continue;
      }

      tlog("postProcessor", `Found parent element`, {
        tag: p.tagName,
        classes: p.className,
        textSnippet: p.textContent?.slice(0, 80)
      });

      if (p.querySelector(`.ttimer-inline-marker[data-timer-id="${timer.id}"]`)) {
        tlog("postProcessor", `Marker already enhanced for timer ${timer.id} — skipping`);
        continue;
      }

      tlog("postProcessor", `Calling enhanceMarker`, { timerId: timer.id });
      this.enhanceMarker(p as HTMLElement, timer);
    }
  }

  private findTimerMarkerNode(el: HTMLElement): Text | null {
    tlog("findMarkerNode", "Scanning for ⏱ text node", {
      elTag: el.tagName,
      elText: el.textContent?.slice(0, 80)
    });

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    let nodesScanned = 0;

    while ((node = walker.nextNode() as Text | null)) {
      nodesScanned++;
      if (node.nodeValue?.includes("⏱")) {
        tlog("findMarkerNode", `✅ Found ⏱ in text node after scanning ${nodesScanned} nodes`, {
          nodeValue: node.nodeValue?.slice(0, 80)
        });
        return node;
      }
    }

    twarn("findMarkerNode", `No ⏱ text node found after scanning ${nodesScanned} nodes. Full text:`, el.textContent?.slice(0, 200));
    return null;
  }

  private enhanceMarker(el: HTMLElement, timer: import("../types/models").TaskTimerRecord) {
      tlog("enhanceMarker", `Called for timer ${timer.id}`, {
        task: timer.anchor.taskTextSnapshot,
        elTag: el.tagName,
        elHTML: el.innerHTML.slice(0, 200)
      });

      if (el.querySelector(`.ttimer-inline-marker[data-timer-id="${timer.id}"]`)) {
        tlog("enhanceMarker", `Already enhanced — skipping`);
        return;
      }

      const textNode = this.findTimerMarkerNode(el);

      if (textNode && textNode.parentNode) {
          tlog("enhanceMarker", `Replacing text node with interactive span`);
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

              tlog("enhanceMarker", `✅ Span inserted via text-node replacement`, { timerId: timer.id });
          }
      } else {
          twarn("enhanceMarker", `No ⏱ text node found — using fallback append`, {
            timerId: timer.id,
            elText: el.textContent?.slice(0, 80)
          });

          const fallback = document.createElement("span");
          fallback.className = `ttimer-inline-marker ttimer-inline-marker--${timer.state}`;
          fallback.dataset.timerId = timer.id;
          fallback.textContent = "⏱";
          fallback.title = `Task Timer: ${timer.anchor.taskTextSnapshot}`;
          el.appendChild(document.createTextNode(" "));
          el.appendChild(fallback);

          tlog("enhanceMarker", `✅ Span appended via fallback`, { timerId: timer.id });
      }
  }

  public handleClick(e: MouseEvent, timerId: string, anchorEl: HTMLElement) {
    const clickAction = this.plugin.dataStore.data.settings.clickAction;
    tlog("handleClick", "Handling click", { timerId, clickAction });

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
