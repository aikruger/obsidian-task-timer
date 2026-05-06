import { Editor, MarkdownView, Notice, Plugin, TFile } from "obsidian";
import { TaskTimerSettings, DEFAULT_SETTINGS, TaskTimerSettingTab } from "./settings";
import { DataStore } from "./persistence/data-store";
import { TimerService } from "./domain/timer-service";
import { TaskLocator } from "./domain/task-locator";
import { ArchiveWatcher } from "./domain/archive-watcher";
import { ReportingService } from "./domain/reporting-service";
import { registerContextMenu } from "./ui/context-menu";
import { buildInlineDecoratorExtension } from "./ui/inline-decorator";
import { TaskTimerModal } from "./ui/task-timer-modal";
import { AnalyticsView, ANALYTICS_VIEW_TYPE } from "./ui/analytics-view";
import { generateBlockId, stripTimerSyntax } from "./domain/block-id";

export default class TaskTimerPlugin extends Plugin {
  settings: TaskTimerSettings;
  dataStore: DataStore;
  timerService: TimerService;
  taskLocator: TaskLocator;
  archiveWatcher: ArchiveWatcher;
  reportingService: ReportingService;

  async onload(): Promise<void> {
    console.log("[ttimer:main] onload start");

    // ── Settings ───────────────────────────────────────────────
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new TaskTimerSettingTab(this.app, this));

    // ── Services ───────────────────────────────────────────────
    this.dataStore       = new DataStore(this);
    await this.dataStore.load();

    this.timerService    = new TimerService(this.dataStore);
    this.taskLocator     = new TaskLocator(this.app);
    this.archiveWatcher  = new ArchiveWatcher(this.app, this.timerService, this.taskLocator);
    this.reportingService = new ReportingService(() => this.dataStore.timers);

    // ── Sidebar view ───────────────────────────────────────────
    this.registerView(
      ANALYTICS_VIEW_TYPE,
      leaf => new AnalyticsView(leaf, this.timerService, this)
    );

    this.addRibbonIcon("clock", "Task timers", () => {
      console.log("[ttimer:main] ribbon icon clicked");
      this.openAnalyticsSidebar();
    });

    // ── Editor decoration (inline pills) ──────────────────────
    this.registerEditorExtension(buildInlineDecoratorExtension(this));

    // ── Context menu ──────────────────────────────────────────
    registerContextMenu(this);

    // ── Vault event: auto-archive on task complete ─────────────
    this.registerEvent(
      this.app.vault.on("modify", file => {
        if (file instanceof TFile && file.extension === "md" && this.settings.archiveOnComplete) {
          this.archiveWatcher.handleFileModify(file);
        }
      })
    );

    // ── Timer events: refresh sidebar and editor pills ───────
    ["timerCreated", "timerUpdated", "timerDeleted"].forEach(evt => {
      this.timerService.on(evt as any, () => {
        this.refreshAnalyticsView();
        this.app.workspace.updateOptions();
      });
    });

    // ── Commands ──────────────────────────────────────────────
    this.addCommand({
      id: "attach-timer-to-current-task",
      name: "Attach timer to current task",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        console.log("[ttimer:command] attach-timer-to-current-task");
        this.attachTimerToTask(editor, view.file);
      },
    });

    this.addCommand({
      id: "open-timer-modal-for-current-task",
      name: "Open timer modal for current task",
      editorCallback: (editor: Editor) => {
        console.log("[ttimer:command] open-timer-modal-for-current-task");
        const task = this.taskLocator.getTaskAtCursor(editor);
        if (!task?.blockId) {
          new Notice("No timer-linked task at cursor.");
          return;
        }
        const timer = this.timerService.getTimerByBlockId(task.blockId);
        if (!timer) {
          new Notice("No timer found — use 'Attach timer' first.");
          return;
        }
        this.openTimerModal(timer.id);
      },
    });

    this.addCommand({
      id: "open-task-timer-sidebar",
      name: "Open task timer sidebar",
      callback: () => this.openAnalyticsSidebar(),
    });

    this.addCommand({
      id: "export-timers-csv",
      name: "Export timers to CSV",
      callback: async () => {
        console.log("[ttimer:command] export-timers-csv");
        const csv = this.reportingService.exportCSV();
        const fileName = `${this.settings.exportFolder ? this.settings.exportFolder + "/" : ""}ttimer-export-${Date.now()}.csv`;
        try {
          await this.app.vault.create(fileName, csv);
          new Notice(`Exported: ${fileName}`);
        } catch (e) {
          console.error("[ttimer:command] export failed", e);
          new Notice("Export failed — see console.");
        }
      },
    });

    this.addCommand({
      id: "export-timers-json",
      name: "Export timers to JSON",
      callback: async () => {
        console.log("[ttimer:command] export-timers-json");
        const json = this.reportingService.exportJSON();
        const fileName = `${this.settings.exportFolder ? this.settings.exportFolder + "/" : ""}ttimer-export-${Date.now()}.json`;
        try {
          await this.app.vault.create(fileName, json);
          new Notice(`Exported: ${fileName}`);
        } catch (e) {
          console.error("[ttimer:command] export failed", e);
          new Notice("Export failed — see console.");
        }
      },
    });

    this.addCommand({
      id: "export-timers-markdown",
      name: "Export timers to Markdown report",
      callback: async () => {
        console.log("[ttimer:command] export-timers-markdown");
        const md = this.reportingService.exportMarkdown();
        const fileName = `${this.settings.exportFolder ? this.settings.exportFolder + "/" : ""}ttimer-report-${Date.now()}.md`;
        try {
          await this.app.vault.create(fileName, md);
          new Notice(`Report created: ${fileName}`);
        } catch (e) {
          console.error("[ttimer:command] markdown export failed", e);
          new Notice("Export failed — see console.");
        }
      },
    });

    this.addCommand({
      id: "debug-audit-timers",
      name: "Debug: audit timer state",
      callback: () => {
        const all = [...this.timerService.getActiveTimers(), ...this.timerService.getArchivedTimers()];
        console.group("[ttimer:debug] Full audit");
        console.log("Total timers:", all.length);
        all.forEach(t => {
          console.log({
            id: t.id,
            state: t.state,
            blockId: t.anchor.blockId,
            filePath: t.anchor.filePath,
            taskText: t.anchor.taskTextSnapshot,
            segments: t.segments.length,
            totalMs: t.totalMsCached,
          });
        });
        console.groupEnd();
      },
    });

    console.log("[ttimer:main] onload complete");
  }

  async onunload(): Promise<void> {
    console.log("[ttimer:main] onunload");
    await this.dataStore.saveImmediate();
  }

  // ── Public helpers called from UI modules ──────────────────

  async attachTimerToTask(editor: Editor, file: TFile | null): Promise<void> {
    if (!file) {
      new Notice("Cannot determine current file.");
      return;
    }

    const task = this.taskLocator.getTaskAtCursor(editor);
    if (!task?.isTask) {
      new Notice("Cursor is not on a markdown task line.");
      return;
    }

    const blockId = task.blockId ?? generateBlockId(this.settings.blockIdPrefix);
    const existingTimer = this.timerService.getTimerByBlockId(blockId);
    if (existingTimer) {
      console.log("[ttimer:main] attachTimerToTask: timer already exists, opening modal", existingTimer.id);
      this.openTimerModal(existingTimer.id);
      return;
    }

    const taskText = task.taskText;
    let lineText = editor.getLine(task.line);

    // Append block ID if not already present
    if (!task.blockId) {
      lineText = `${lineText} ${blockId}`;
      editor.setLine(task.line, lineText);
      console.log("[ttimer:main] attachTimerToTask: inserted blockId", { blockId, line: task.line });
    }

    const record = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      anchor: {
        filePath: file.path,
        line: task.line,
        blockId,
        taskTextSnapshot: taskText,
      },
      state: "stopped" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      segments: [],
      totalMsCached: 0,
    };

    this.timerService.createTimer(record);
    new Notice("Timer attached.");
    this.openTimerModal(record.id);

    console.log("[ttimer:main] attachTimerToTask: created timer", { id: record.id, blockId });
  }

  openTimerModal(timerId: string): void {
    console.log("[ttimer:main] openTimerModal", { timerId });
    new TaskTimerModal(this.app, this, timerId).open();
  }

  async openAnalyticsSidebar(): Promise<void> {
    console.log("[ttimer:main] openAnalyticsSidebar");
    if (this.app.workspace.getLeavesOfType(ANALYTICS_VIEW_TYPE).length === 0) {
      const leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: ANALYTICS_VIEW_TYPE });
    }
    const leaves = this.app.workspace.getLeavesOfType(ANALYTICS_VIEW_TYPE);
    if (leaves.length > 0 && leaves[0]) this.app.workspace.revealLeaf(leaves[0]);
  }

  refreshAnalyticsView(): void {
    this.app.workspace.getLeavesOfType(ANALYTICS_VIEW_TYPE).forEach(leaf => {
      if (leaf.view instanceof AnalyticsView) {
        (leaf.view as AnalyticsView).render();
      }
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings, ...this.dataStore.data });
  }
}