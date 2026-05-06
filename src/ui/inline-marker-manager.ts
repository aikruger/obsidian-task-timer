import { App, MarkdownPostProcessorContext } from "obsidian";
import { TimerService } from "../domain/timer-service";
import TaskGeniusTimerPlugin from "../main";
import { tlog, twarn, terr } from "../utils/debug-logger";
import { TaskTimerControlModal } from "./task-timer-control-modal";
import { extractStructuredTimerMarker, stripInlineTimerSyntax } from "../utils/marker-utils";

function normalizeTaskText(text: string): string {
  return stripInlineTimerSyntax(text)
    .replace(/^\s*[-*]\s+\[[ xX]\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export class InlineMarkerManager {
  constructor(private app: App, private timerService: TimerService, private plugin: TaskGeniusTimerPlugin) {}

  public postProcessor(container: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const sourcePath = ctx.sourcePath;

    const timers = [
      ...this.timerService.getActiveTimers(),
      ...this.timerService.getArchivedTimers(),
    ].filter(t => t.anchor.filePath === sourcePath);

    console.debug("[ttimer:postProcessor] start", {
      sourcePath,
      timerCount: timers.length,
    });

    if (!timers.length) return;

    const matchedTimerIds = new Set<string>();
    const candidates = Array.from(
      container.querySelectorAll("li.task-list-item, li, p")
    );

    console.debug("[ttimer:postProcessor] candidate count", candidates.length);

    for (const candidate of candidates) {
      const rawText = candidate.textContent ?? "";
      if (!rawText.includes("⏱")) continue;

      console.debug("[ttimer:postProcessor] candidate", {
        candidateText: rawText.slice(0, 160)
      });

      const structured = extractStructuredTimerMarker(rawText);
      console.debug("[ttimer:postProcessor] structured marker parse", {
        candidateText: rawText.slice(0, 160),
        parsedBlockId: structured?.blockId ?? null
      });

      let timer = null;

      if (structured) {
          timer = timers.find(t => t.anchor.blockId === structured.blockId);
          console.debug("[ttimer:postProcessor] structured match result", {
            parsedBlockId: structured.blockId,
            timerId: timer?.id ?? null
          });
      }

      if (!timer) {
          console.warn("[ttimer:postProcessor] legacy fallback match path", {
            candidateText: rawText.slice(0, 160)
          });
          const normalizedCandidate = normalizeTaskText(rawText);

          timer = timers.find(t => {
            if (matchedTimerIds.has(t.id)) return false;
            return normalizeTaskText(t.anchor.taskTextSnapshot) === normalizedCandidate;
          });
      }

      if (!timer) {
        console.warn("[ttimer:postProcessor] no timer match for candidate", {
          candidateText: rawText.slice(0, 160)
        });
        continue;
      }

      matchedTimerIds.add(timer.id);

      console.debug("[ttimer:postProcessor] matched candidate to timer", {
        timerId: timer.id,
        filePath: timer.anchor.filePath,
        taskText: timer.anchor.taskTextSnapshot
      });

      if (candidate.querySelector(`.ttimer-inline-marker[data-timer-id="${timer.id}"]`)) {
        console.debug("[ttimer:postProcessor] already enhanced", { timerId: timer.id });
        continue;
      }

      console.debug("[ttimer:postProcessor] enhancing marker", {
        timerId: timer.id,
        candidateText: rawText.slice(0, 200),
      });

      this.enhanceMarker(candidate as HTMLElement, timer);
    }
  }

  private findTimerMarkerNode(el: HTMLElement): { node: Text, token: string } | null {
    tlog("findMarkerNode", "Scanning for ⏱ text node", {
      elTag: el.tagName,
      elText: el.textContent?.slice(0, 80)
    });

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    let nodesScanned = 0;

    let fallbackNode: Text | null = null;
    let fallbackToken: string | null = null;

    while ((node = walker.nextNode() as Text | null)) {
      nodesScanned++;
      const raw = node.nodeValue ?? "";

      const structured = extractStructuredTimerMarker(raw);
      if (structured) {
        console.debug("[ttimer:findMarkerNode] found structured token", {
          token: structured.raw,
          nodeValue: raw.slice(0, 80)
        });
        return { node, token: structured.raw };
      }

      if (raw.includes("[⏱]")) {
        console.debug("[ttimer:findMarkerNode] found structured token", {
          token: "[⏱]",
          nodeValue: raw.slice(0, 80)
        });
        return { node, token: "[⏱]" };
      }
      if (raw.includes("⏱") && !fallbackNode) {
         fallbackNode = node;
         fallbackToken = "⏱";
      }
    }

    if (fallbackNode && fallbackToken) {
       console.debug("[ttimer:findMarkerNode] found structured token", {
          token: fallbackToken,
          nodeValue: fallbackNode.nodeValue?.slice(0, 80)
       });
       return { node: fallbackNode, token: fallbackToken };
    }

    console.warn("[ttimer:findMarkerNode] no timer token found", {
      text: el.textContent
    });
    return null;
  }

  private enhanceMarker(el: HTMLElement, timer: import("../types/models").TaskTimerRecord, explicitToken?: string) {
      tlog("enhanceMarker", `Called for timer ${timer.id}`, {
        task: timer.anchor.taskTextSnapshot,
        elTag: el.tagName,
        elHTML: el.innerHTML.slice(0, 200)
      });

      if (el.querySelector(`.ttimer-inline-marker[data-timer-id="${timer.id}"]`)) {
        tlog("enhanceMarker", `Already enhanced — skipping`);
        return;
      }

      const match = this.findTimerMarkerNode(el);

      if (match && match.node.parentNode) {
          tlog("enhanceMarker", `Replacing text node with interactive span`);
          const textNode = match.node;
          const token = match.token;
          const parent = textNode.parentNode;

          // Split the text node around the marker to replace just the marker
          const nodeValue = textNode.nodeValue || "";
          const markerIndex = nodeValue.indexOf(token);

          if (markerIndex !== -1 && parent) {
              const beforeText = nodeValue.substring(0, markerIndex);
              const afterText = nodeValue.substring(markerIndex + token.length);

              if (beforeText) {
                  parent.insertBefore(document.createTextNode(beforeText), textNode);
              }

              const marker = document.createElement("span");
              marker.className = `ttimer-inline-marker ttimer-inline-marker--${timer.state}`;
              marker.dataset.timerId = timer.id;
              marker.dataset.blockId = timer.anchor.blockId ?? "";
              marker.textContent = "⏱";
              marker.title = `Task Timer: ${timer.anchor.taskTextSnapshot}`;

              marker.addEventListener("click", (evt) => {
                console.debug("[ttimer:inline] direct marker click", {
                  timerId: timer.id,
                  blockId: timer.anchor.blockId,
                  clickAction: this.plugin.dataStore.data.settings.clickAction
                });
                evt.preventDefault();
                evt.stopPropagation();
                evt.stopImmediatePropagation();
                this.handleClick(evt, timer.id, marker);
              });
              marker.addEventListener("mouseenter", () => console.debug("[ttimer:inline] mouseenter", { timerId: timer.id }));

              parent.insertBefore(marker, textNode);

              if (afterText) {
                  parent.insertBefore(document.createTextNode(afterText), textNode);
              }

              parent.removeChild(textNode);

              console.debug("[ttimer:enhanceMarker] inserted interactive marker", {
                timerId: timer.id,
                blockId: timer.anchor.blockId,
                tokenUsed: explicitToken ?? token
              });
          }
      } else {
          twarn("enhanceMarker", `No ⏱ text node found — using fallback append`, {
            timerId: timer.id,
            elText: el.textContent?.slice(0, 80)
          });

          const fallback = document.createElement("span");
          fallback.className = `ttimer-inline-marker ttimer-inline-marker--${timer.state}`;
          fallback.dataset.timerId = timer.id;
          fallback.dataset.blockId = timer.anchor.blockId ?? "";
          fallback.textContent = "⏱";
          fallback.title = `Task Timer: ${timer.anchor.taskTextSnapshot}`;

          fallback.addEventListener("click", (evt) => {
            console.debug("[ttimer:inline] direct marker click", {
              timerId: timer.id,
              blockId: timer.anchor.blockId,
              clickAction: this.plugin.dataStore.data.settings.clickAction
            });
            evt.preventDefault();
            evt.stopPropagation();
            evt.stopImmediatePropagation();
            this.handleClick(evt, timer.id, fallback);
          });
          fallback.addEventListener("mouseenter", () => console.debug("[ttimer:inline] mouseenter", { timerId: timer.id }));

          el.appendChild(document.createTextNode(" "));
          el.appendChild(fallback);

          console.debug("[ttimer:enhanceMarker] inserted interactive marker", {
            timerId: timer.id,
            blockId: timer.anchor.blockId,
            tokenUsed: explicitToken ?? "fallback"
          });
      }
  }

  public handleClick(e: MouseEvent, timerId: string, anchorEl: HTMLElement) {
    const clickAction = this.plugin.dataStore.data.settings.clickAction;
    console.debug("[ttimer:handleClick] invoked", {
      timerId,
      clickAction
    });

    if (clickAction === "none") return;

    if (clickAction === "sidebar") {
      console.debug("[ttimer:handleClick] opening sidebar", { timerId });
      this.openSidebarAndFocus(timerId).catch((err) => terr("handleClick", "Error opening sidebar", err));
      return;
    }

    if (clickAction === "popover" || clickAction === "both") {
      console.debug("[ttimer:handleClick] opening modal", { timerId });
      new TaskTimerControlModal(this.app, this.plugin, timerId).open();
      if (clickAction === "both") {
        console.debug("[ttimer:handleClick] opening sidebar", { timerId });
        this.openSidebarAndFocus(timerId).catch((err) => terr("handleClick", "Error opening sidebar", err));
      }
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
