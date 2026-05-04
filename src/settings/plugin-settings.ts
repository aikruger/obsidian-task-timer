import { PluginSettings } from "../types/models";

export const DEFAULT_SETTINGS: PluginSettings = {
  blockIdPrefix: "ttimer",
  markerStyle: "icon",
  archiveOnComplete: true,
  stopInsteadOfArchiveOnComplete: false,
  allowMultipleRunningTimers: false,
  defaultSidebarSort: "newest",
  showArchivedTimers: true,
  hoverPopupEnabled: true,
  hoverModifierKey: "Alt",
  exportFolder: "",
  providerSelection: "internal",
};
