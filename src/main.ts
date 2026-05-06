import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, TaskTimerSettings, TaskTimerSettingTab } from "./settings";
import { PluginStore } from "./types/store";
import { LiveTokenIndex, hydrateTokenIndex } from "./domain/hydration";
import { registerCompletionWatcher } from "./domain/completion-watcher";
import { AnalyticsView, ANALYTICS_VIEW_TYPE } from "./ui/analytics-view";
import { registerContextMenu } from "./ui/context-menu";
import { buildInlineDecoratorExtension } from "./ui/inline-decorator";
import { exportAllToCSV } from "./reporting/reporting-service";
import { resolveTokenLocation } from "./domain/resolve-location";

export default class TaskTimerPlugin extends Plugin {
  settings: TaskTimerSettings;
  store: PluginStore;
  tokenIndex: LiveTokenIndex = {};

  async onload(): Promise<void> {
    console.log("[ttimer] onload start");

    // Load settings
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new TaskTimerSettingTab(this.app, this));

    // Load store (separately from settings, or extract it if combined)
    const rawData = await this.loadData();
    this.store = {
      version: rawData?.version ?? 1,
      segments: rawData?.segments ?? {},
      meta: rawData?.meta ?? {},
    };

    // Hydrate index on startup
    this.app.workspace.onLayoutReady(async () => {
        this.tokenIndex = await hydrateTokenIndex(this.app, this.store);
        await this.saveStore();

        // Register watcher
        registerCompletionWatcher(this.app, this.tokenIndex, this.store, this.saveStore.bind(this), this.settings);
    });

    // Views
    this.registerView(
      ANALYTICS_VIEW_TYPE,
      leaf => new AnalyticsView(leaf, this)
    );

    this.addRibbonIcon("clock", "Task timers", () => {
      this.openAnalyticsSidebar();
    });

    // UI
    registerContextMenu(this);
    this.registerEditorExtension(buildInlineDecoratorExtension(this));

    // Commands
    this.addCommand({
      id: "open-task-timer-sidebar",
      name: "Open task timer sidebar",
      callback: () => this.openAnalyticsSidebar(),
    });

    this.addCommand({
      id: "export-timers-csv",
      name: "Export timers to CSV",
      callback: async () => {
        const csv = exportAllToCSV(this.store);
        const fileName = `${this.settings.exportFolder ? this.settings.exportFolder + "/" : ""}ttimer-export-${Date.now()}.csv`;
        try {
          await this.app.vault.create(fileName, csv);
          new Notice(`Exported: ${fileName}`);
        } catch (e) {
          console.error("[ttimer] export failed", e);
          new Notice("Export failed — see console.");
        }
      },
    });

    // File open event to refresh token index for that file if needed.
    this.registerEvent(
      this.app.workspace.on("file-open", async (file) => {
          if (file && file.extension === "md") {
              // Can do partial hydration here if needed.
          }
      })
    );

    console.log("[ttimer] onload complete");
  }

  async onunload(): Promise<void> {
    console.log("[ttimer] onunload");
    await this.saveStore();
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings, ...this.store });
  }

  async saveStore(): Promise<void> {
    await this.saveData({ ...this.settings, ...this.store });
  }

  async openAnalyticsSidebar(): Promise<void> {
    if (this.app.workspace.getLeavesOfType(ANALYTICS_VIEW_TYPE).length === 0) {
      const leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: ANALYTICS_VIEW_TYPE });
    }
    const leaves = this.app.workspace.getLeavesOfType(ANALYTICS_VIEW_TYPE);
    if (leaves.length > 0 && leaves[0]) this.app.workspace.revealLeaf(leaves[0]);
  }

  async navigateToTask(filePath: string, lineNo: number, tokenId: string): Promise<void> {
      const location = await resolveTokenLocation(tokenId, this.app, this.store);
      let targetFile: TFile | null = null;
      let targetLine = lineNo;

      if (location) {
          targetFile = location.file;
          targetLine = location.lineNo;
      } else {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (file instanceof TFile) {
              targetFile = file;
          }
      }

      if (targetFile) {
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(targetFile, { eState: { line: targetLine } });
      }
  }
}