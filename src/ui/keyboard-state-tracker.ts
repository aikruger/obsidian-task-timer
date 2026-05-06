import type TaskGeniusTimerPlugin from "../main";

export class KeyboardStateTracker {
  private altHeld = false;
  private ctrlHeld = false;
  private shiftHeld = false;
  private metaHeld = false;
  private plugin: TaskGeniusTimerPlugin;

  constructor(plugin: TaskGeniusTimerPlugin) {
    this.plugin = plugin;
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp   = this.onKeyUp.bind(this);
  }

  register() {
    document.addEventListener("keydown", this.onKeyDown, true);
    document.addEventListener("keyup",   this.onKeyUp,   true);
  }

  unregister() {
    document.removeEventListener("keydown", this.onKeyDown, true);
    document.removeEventListener("keyup",   this.onKeyUp,   true);
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === "Alt")   this.altHeld   = true;
    if (e.key === "Control") this.ctrlHeld = true;
    if (e.key === "Shift") this.shiftHeld = true;
    if (e.key === "Meta")  this.metaHeld  = true;
    this.onModifierChange(e);
  }

  private onKeyUp(e: KeyboardEvent) {
    if (e.key === "Alt")   this.altHeld   = false;
    if (e.key === "Control") this.ctrlHeld = false;
    if (e.key === "Shift") this.shiftHeld = false;
    if (e.key === "Meta")  this.metaHeld  = false;
  }

  private onModifierChange(e: KeyboardEvent) {
    const settings = this.plugin.dataStore.data.settings;
    if (!settings.hoverPopupEnabled) return;

    // Find a marker currently under the pointer
    const marker = document.querySelector<HTMLElement>(".ttimer-inline-marker:hover");
    if (!marker) return;
    const timerId = marker.dataset.timerId;
    if (!timerId) return;

    const mode = settings.hoverTriggerMode;
    const shouldOpen =
      (mode === "alt"       && e.altKey) ||
      (mode === "ctrl"      && e.ctrlKey) ||
      (mode === "shift"     && e.shiftKey) ||
      (mode === "meta"      && e.metaKey) ||
      (mode === "alt-ctrl"  && e.altKey && e.ctrlKey) ||
      (mode === "alt-shift" && e.altKey && e.shiftKey);

    if (shouldOpen) {
      e.preventDefault(); // prevent browser Alt menu on Windows
      this.plugin.popoverManager.showPopover(marker, timerId);
    }
  }
}
