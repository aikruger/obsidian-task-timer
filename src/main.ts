import { Plugin, WorkspaceLeaf, Notice, TFile, Editor } from "obsidian";
import { PluginData, TaskTimerRecord } from "./types/models";
import { DEFAULT_SETTINGS } from "./settings/plugin-settings";
import { TaskTimerSettingTab } from "./settings/settings-tab";
import { DataStore } from "./persistence/data-store";
import { TimerService } from "./domain/timer-service";
import { TaskLocator } from "./domain/task-locator";
import { TaskArchiveWatcher } from "./domain/task-archive-watcher";
import { TASK_TIMER_VIEW_TYPE, TaskTimerView } from "./views/task-timer-view";
import { InlineMarkerManager } from "./ui/inline-marker-manager";
import { TimerPopover } from "./ui/timer-popover";
import { ReportingService } from "./reporting/reporting-service";
import { generateBlockId } from "./utils/block-id";
import { InternalTimerProvider } from "./providers/internal-timer-provider";
import { StatsModal } from "./views/stats-modal";
import { KeyboardStateTracker } from "./ui/keyboard-state-tracker";
import { tlog, terr, DEBUG } from "./utils/debug-logger";

export default class TaskGeniusTimerPlugin extends Plugin {
  public dataStore: DataStore;
  public timerService: TimerService;
  public taskLocator: TaskLocator;
  public archiveWatcher: TaskArchiveWatcher;
  public popoverManager: TimerPopover;
  public reportingService: ReportingService;
  public provider: InternalTimerProvider;
  public keyboardTracker: KeyboardStateTracker;
  public inlineMarkerManager: InlineMarkerManager;

  async onload() {
    await this.loadPluginData();

    this.timerService = new TimerService(this.dataStore);
    this.taskLocator = new TaskLocator(this.app);
    this.archiveWatcher = new TaskArchiveWatcher(this.app, this.timerService, this.taskLocator, this.dataStore.data.settings);
    this.popoverManager = new TimerPopover(this, this.timerService);
    this.reportingService = new ReportingService(() => this.dataStore.timers);
    this.provider = new InternalTimerProvider();

    this.addSettingTab(new TaskTimerSettingTab(this.app, this, this.dataStore.data.settings));

    this.registerView(TASK_TIMER_VIEW_TYPE, (leaf) => new TaskTimerView(leaf, this.timerService, this));

    this.inlineMarkerManager = new InlineMarkerManager(this.app, this.timerService, this);
    this.registerMarkdownPostProcessor((el, ctx) => this.inlineMarkerManager.postProcessor(el, ctx));

    this.keyboardTracker = new KeyboardStateTracker(this);
    this.keyboardTracker.register();

    this.registerDomEvent(document.body, "click", (event: MouseEvent) => {
      const marker = (event.target as Element).closest(".ttimer-inline-marker");

      // Log every click on the document body in debug mode to confirm delegation is running
      if (DEBUG && (event.target as Element).closest(".markdown-preview-view, .cm-editor")) {
        tlog("delegated-click", "Click in editor/preview area", {
          target: (event.target as Element).tagName,
          classes: (event.target as Element).className,
          markerFound: !!marker
        });
      }

      if (!marker) return;

      const timerId = (marker as HTMLElement).dataset.timerId;
      if (!timerId) {
        terr("delegated-click", "Marker span found but has no data-timer-id attribute", marker);
        return;
      }

      tlog("delegated-click", `✅ Marker clicked`, { timerId });
      event.preventDefault();
      event.stopImmediatePropagation();
      this.inlineMarkerManager.handleClick(event, timerId, marker as HTMLElement);
    });

    this.registerDomEvent(document.body, "mouseover", (event: MouseEvent) => {
      const marker = (event.target as Element).closest(".ttimer-inline-marker");
      if (!marker) return;

      const timerId = (marker as HTMLElement).dataset.timerId;
      if (!timerId) {
        terr("delegated-mouseover", "Marker found but no data-timer-id", marker);
        return;
      }

      tlog("delegated-mouseover", `Mouseover marker`, {
        timerId,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        hoverMode: this.dataStore.data.settings.hoverTriggerMode,
        hoverEnabled: this.dataStore.data.settings.hoverPopupEnabled
      });

      // Prevent firing repeatedly on every child element re-entry
      if (event.target !== marker && marker.contains(event.target as Node)) return;
      this.popoverManager.pointerInsideMarker = true;
      const settings = this.dataStore.data.settings;
      if (
        settings.hoverPopupEnabled &&
        this.inlineMarkerManager.shouldOpenPopoverFromEvent(event)
      ) {
        this.popoverManager.scheduleShow(marker as HTMLElement, timerId, event);
      }
    });

    this.registerDomEvent(document.body, "mouseout", (event: MouseEvent) => {
      const marker = (event.target as Element).closest(".ttimer-inline-marker");
      if (!marker) return;
      // Only trigger leave when exiting the marker entirely, not moving between children
      const relatedTarget = event.relatedTarget as Node | null;
      if (relatedTarget && marker.contains(relatedTarget)) return;
      this.popoverManager.pointerInsideMarker = false;
      this.popoverManager.scheduleHide();
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.archiveWatcher.handleFileModify(file);
        }
      })
    );

    this.addCommand({
      id: "attach-timer-to-current-task",
      name: "Attach timer to current task",
      editorCallback: async (editor: Editor, view) => {
         const taskInfo = this.taskLocator.getTaskAtCursor(editor);
         if (!taskInfo || !taskInfo.isTask) {
             new Notice("Cursor is not on a markdown task line.");
             return;
         }

         let existingBlockId = taskInfo.blockId;
         let blockId = existingBlockId;
         const currentLine = editor.getLine(taskInfo.line);

         if (blockId) {
             const existingTimer = [...this.timerService.getActiveTimers(), ...this.timerService.getArchivedTimers()]
                 .find(timer => timer.anchor.blockId === blockId);

             if (existingTimer) {
                 this.openSidebar();
                 return;
             }
         } else {
             blockId = generateBlockId(this.dataStore.data.settings.blockIdPrefix);
             const marker = this.dataStore.data.settings.markerStyle === "token" ? " [⏱] " : " ⏱ ";
             const updatedLine = currentLine + marker + blockId;
             editor.setLine(taskInfo.line, updatedLine);
         }

         const newTimer: TaskTimerRecord = {
             id: Math.random().toString(36).substring(2, 9),
             anchor: {
                 filePath: view.file?.path || "",
                 line: taskInfo.line,
                 blockId: blockId, // Exactly the block ID including leading ^
                 taskTextSnapshot: taskInfo.text
             },
             state: "stopped",
             createdAt: Date.now(),
             updatedAt: Date.now(),
             segments: [],
             totalMsCached: 0,
             iconInserted: true
         };

         this.timerService.createTimer(newTimer);
         new Notice("Timer attached");
         this.openSidebar();
      }
    });

    this.addCommand({
      id: "start-timer-for-current-task",
      name: "Start timer for current task",
      editorCallback: (editor: Editor, view) => {
         const taskInfo = this.taskLocator.getTaskAtCursor(editor);
         if (taskInfo && taskInfo.blockId) {
             const allTimers = [...this.timerService.getActiveTimers(), ...this.timerService.getArchivedTimers()];
             const timer = allTimers.find(t => t.anchor.blockId === taskInfo.blockId);
             if (timer) {
                 this.timerService.start(timer.id);
                 new Notice("Timer started");
             } else {
                 new Notice("No timer found for this task.");
             }
         }
      }
    });

    this.addCommand({
      id: "pause-timer-for-current-task",
      name: "Pause timer for current task",
      editorCallback: (editor: Editor, view) => {
         const taskInfo = this.taskLocator.getTaskAtCursor(editor);
         if (taskInfo && taskInfo.blockId) {
             const allTimers = [...this.timerService.getActiveTimers(), ...this.timerService.getArchivedTimers()];
             const timer = allTimers.find(t => t.anchor.blockId === taskInfo.blockId);
             if (timer) {
                 this.timerService.pause(timer.id);
                 new Notice("Timer paused");
             }
         }
      }
    });

    this.addCommand({
      id: "stop-timer-for-current-task",
      name: "Stop timer for current task",
      editorCallback: (editor: Editor, view) => {
         const taskInfo = this.taskLocator.getTaskAtCursor(editor);
         if (taskInfo && taskInfo.blockId) {
             const allTimers = [...this.timerService.getActiveTimers(), ...this.timerService.getArchivedTimers()];
             const timer = allTimers.find(t => t.anchor.blockId === taskInfo.blockId);
             if (timer) {
                 this.timerService.stop(timer.id);
                 new Notice("Timer stopped");
             }
         }
      }
    });

    this.addCommand({
      id: "archive-timer-for-current-task",
      name: "Archive timer for current task",
      editorCallback: (editor: Editor, view) => {
         const taskInfo = this.taskLocator.getTaskAtCursor(editor);
         if (taskInfo && taskInfo.blockId) {
             const allTimers = [...this.timerService.getActiveTimers(), ...this.timerService.getArchivedTimers()];
             const timer = allTimers.find(t => t.anchor.blockId === taskInfo.blockId);
             if (timer) {
                 this.timerService.archive(timer.id);
                 new Notice("Timer archived");
             }
         }
      }
    });

    this.addCommand({
      id: "delete-timer-for-current-task",
      name: "Delete timer for current task",
      editorCallback: async (editor: Editor) => {
        const task = this.taskLocator.getTaskAtCursor(editor);
        if (!task || !task.blockId) {
          new Notice("No timer-linked task found at cursor.");
          return;
        }

        const timer = [...this.timerService.getActiveTimers(), ...this.timerService.getArchivedTimers()]
          .find(t => t.anchor.blockId === task.blockId);

        if (!timer) {
          new Notice("No timer found for this task.");
          return;
        }

        const confirmed = window.confirm(`Delete timer for "${timer.anchor.taskTextSnapshot}"?`);
        if (!confirmed) return;

        await this.deleteTimerAndMaybeCleanup(timer.id, { removeMarker: false, removeBlockId: false });
        new Notice("Timer deleted.");
      }
    });

    this.addCommand({
      id: "delete-orphaned-timers",
      name: "Delete orphaned timers",
      callback: async () => {
        const allTimers = [...this.timerService.getActiveTimers(), ...this.timerService.getArchivedTimers()];
        const invalidTimers = [];

        for (const timer of allTimers) {
           const file = this.app.vault.getAbstractFileByPath(timer.anchor.filePath);
           if (!file || !(file instanceof TFile)) {
               invalidTimers.push(timer);
               continue;
           }
           if (timer.anchor.blockId) {
               const content = await this.app.vault.read(file);
               if (!content.includes(timer.anchor.blockId)) {
                   invalidTimers.push(timer);
               }
           }
        }

        if (invalidTimers.length === 0) {
            new Notice("No orphaned timers found.");
            return;
        }

        const confirmed = window.confirm(`Found ${invalidTimers.length} orphaned timers. Delete them?`);
        if (confirmed) {
            for (const timer of invalidTimers) {
                this.timerService.delete(timer.id);
            }
            this.refreshTimerViews();
            new Notice(`Deleted ${invalidTimers.length} orphaned timers.`);
        }
      }
    });

    this.addCommand({
        id: "open-task-timer-sidebar",
        name: "Open task timer sidebar",
        callback: () => this.openSidebar()
    });

    this.addCommand({
      id: "debug-audit",
      name: "Debug: Audit timer DOM and data state",
      callback: () => {
        const allTimers = [
          ...this.timerService.getActiveTimers(),
          ...this.timerService.getArchivedTimers()
        ];

        console.group("[ttimer] 🔍 Full Audit");

        console.log("=== STORED TIMERS ===");
        allTimers.forEach(t => {
          console.log({
            id: t.id,
            state: t.state,
            blockId: t.anchor.blockId,
            filePath: t.anchor.filePath,
            taskText: t.anchor.taskTextSnapshot,
            totalMs: this.timerService.getElapsedMs(t.id)
          });
        });

        console.log("=== DOM MARKERS ===");
        const spans = document.querySelectorAll(".ttimer-inline-marker");
        if (spans.length === 0) {
          console.warn("No .ttimer-inline-marker spans found in the DOM");
          console.warn("This means enhanceMarker was never called or the spans were removed");
        } else {
          spans.forEach(span => {
            const s = span as HTMLElement;
            const rect = s.getBoundingClientRect();
            console.log({
              timerId: s.dataset.timerId,
              className: s.className,
              textContent: s.textContent,
              inDOM: document.body.contains(s),
              rect: { top: rect.top, left: rect.left, w: rect.width, h: rect.height },
              computedPointerEvents: window.getComputedStyle(s).pointerEvents,
              computedZIndex: window.getComputedStyle(s).zIndex,
              parentTag: s.parentElement?.tagName,
              parentClasses: s.parentElement?.className
            });
          });
        }

        console.log("=== POPOVER STATE ===");
        console.log({
          popoverElInDOM: this.popoverManager.popoverEl
            ? document.body.contains(this.popoverManager.popoverEl)
            : false,
          currentTimerId: this.popoverManager.currentTimerId,
          pointerInsideMarker: this.popoverManager.pointerInsideMarker,
          pointerInsidePopover: this.popoverManager.pointerInsidePopover,
        });

        console.log("=== SETTINGS ===");
        console.log(this.dataStore.data.settings);

        console.log("=== SIDEBAR LEAVES ===");
        const leaves = this.app.workspace.getLeavesOfType(TASK_TIMER_VIEW_TYPE);
        console.log({ count: leaves.length });

        console.groupEnd();
      }
    });

    this.addCommand({
        id: "show-timer-statistics",
        name: "Show timer statistics",
        callback: () => {
            new StatsModal(this.app, this.timerService).open();
        }
    });

    this.addCommand({
        id: "export-timer-data",
        name: "Export timer data (CSV)",
        callback: async () => {
             const csv = this.reportingService.exportCSV();
             const folderPath = this.dataStore.data.settings.exportFolder;
             const filePath = folderPath ? `${folderPath}/timer-export-${Date.now()}.csv` : `timer-export-${Date.now()}.csv`;

             try {
                 await this.app.vault.create(filePath, csv);
                 new Notice(`Exported to ${filePath}`);
             } catch (e) {
                 new Notice(`Failed to export: ${e}`);
             }
        }
    });
  }

  async onunload() {
    this.popoverManager.hidePopover();
    this.keyboardTracker.unregister();
    // Ensure last state changes are saved immediately
    await this.dataStore.saveImmediate();
  }

  async loadPluginData() {
    const rawData = await this.loadData();
    const data: PluginData = Object.assign(
      { version: 1, timers: [], settings: DEFAULT_SETTINGS },
      rawData
    );
    // basic migration stub
    this.dataStore = new DataStore(this, data);
  }

  async saveSettings() {
    await this.dataStore.save();
  }

  async deleteTimerAndMaybeCleanup(timerId: string, options: { removeMarker?: boolean, removeBlockId?: boolean } = {}) {
    const { removeMarker = false, removeBlockId = false } = options;
    const timer = this.timerService.getTimer(timerId);
    if (!timer) return;

    if (this.popoverManager.currentTimerId === timerId) {
      this.popoverManager.hidePopover();
    }

    this.timerService.delete(timerId);

    if (removeMarker || removeBlockId) {
      await this.cleanupTaskLine(timer, { removeMarker, removeBlockId });
    }

    this.refreshTimerViews();
  }

  async cleanupTaskLine(timer: TaskTimerRecord, options: { removeMarker: boolean, removeBlockId: boolean }) {
    const file = this.app.vault.getAbstractFileByPath(timer.anchor.filePath);
    if (!(file instanceof TFile)) return;

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    let targetIndex = -1;

    if (timer.anchor.blockId) {
      targetIndex = lines.findIndex(line => line.includes(timer.anchor.blockId as string));
    }

    if (targetIndex === -1 && Number.isInteger(timer.anchor.line) && lines[timer.anchor.line]) {
      targetIndex = timer.anchor.line;
    }

    if (targetIndex === -1 || !lines[targetIndex]) return;

    let line = lines[targetIndex] as string;

    if (options.removeMarker) {
      line = line.replace(/\s*\[?⏱\]?\s*/g, " ");
      line = line.replace(/\s{2,}/g, " ").trimEnd();

      const originalLine = lines[targetIndex];
      if (originalLine && /^\s*-\s*\[[ xX]\]/.test(originalLine)) {
        const leading = originalLine.match(/^(\s*-\s*\[[ xX]\]\s*)/);
        if (leading) {
          const rest = line.replace(/^(\s*-\s*\[[ xX]\]\s*)/, "");
          line = leading[1] + rest;
        }
      }
    }

    if (options.removeBlockId && timer.anchor.blockId) {
      line = line.replace(new RegExp(`\\s*\\${timer.anchor.blockId}$`), "");
    }

    lines[targetIndex] = line;
    await this.app.vault.modify(file, lines.join("\n"));
  }

  refreshTimerViews() {
    const leaves = this.app.workspace.getLeavesOfType(TASK_TIMER_VIEW_TYPE);
    for (const leaf of leaves) {
      if (leaf.view instanceof TaskTimerView) {
        leaf.view.render();
      }
    }
  }

  async openSidebar() {
      const leaves = this.app.workspace.getLeavesOfType(TASK_TIMER_VIEW_TYPE);
      if (leaves.length === 0) {
          const rightLeaf = this.app.workspace.getRightLeaf(false);
          if (rightLeaf) {
              await rightLeaf.setViewState({ type: TASK_TIMER_VIEW_TYPE });
          }
      }
      const newLeaves = this.app.workspace.getLeavesOfType(TASK_TIMER_VIEW_TYPE);
      if (newLeaves.length > 0 && newLeaves[0]) {
          this.app.workspace.revealLeaf(newLeaves[0]);
      }
  }
}
