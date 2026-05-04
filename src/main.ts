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

export default class TaskGeniusTimerPlugin extends Plugin {
  public dataStore: DataStore;
  public timerService: TimerService;
  public taskLocator: TaskLocator;
  public archiveWatcher: TaskArchiveWatcher;
  public popoverManager: TimerPopover;
  public reportingService: ReportingService;
  public provider: InternalTimerProvider;

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

    const inlineMarkerManager = new InlineMarkerManager(this.app, this.timerService, this);
    this.registerMarkdownPostProcessor((el, ctx) => inlineMarkerManager.postProcessor(el, ctx));

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

         let blockId = taskInfo.blockId;
         const lineText = editor.getLine(taskInfo.line);

         if (!blockId) {
             blockId = generateBlockId(this.dataStore.data.settings.blockIdPrefix);
             const marker = this.dataStore.data.settings.markerStyle === "icon" ? " ⏱ " :
                            this.dataStore.data.settings.markerStyle === "text" ? " ⏱ " : " [⏱] ";

             const updatedLine = lineText + marker + blockId;
             editor.setLine(taskInfo.line, updatedLine);
         } else {
             // Check if timer already exists for this block ID
             const allTimers = [...this.timerService.getActiveTimers(), ...this.timerService.getArchivedTimers()];
             const existing = allTimers.find(t => t.anchor.blockId === blockId);
             if (existing) {
                 this.openSidebar();
                 return;
             }
         }

         const newTimer: TaskTimerRecord = {
             id: Math.random().toString(36).substring(2, 9),
             anchor: {
                 filePath: view.file?.path || "",
                 line: taskInfo.line,
                 blockId: blockId,
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
        id: "open-task-timer-sidebar",
        name: "Open task timer sidebar",
        callback: () => this.openSidebar()
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
