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
  hoverTriggerMode: "hover",
  hoverOpenDelayMs: 180,
  hoverCloseDelayMs: 220,
  popoverPersistent: true,
  popoverClickOutsideCloses: true,
  clickAction: "sidebar",
  exportFolder: "",
  providerSelection: "internal",
};
