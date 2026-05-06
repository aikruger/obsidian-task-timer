import { App, Modal } from "obsidian";

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private message: string,
    private detail: string,
    private callback: (confirmed: boolean) => void
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h3", { text: "Confirm delete" });
    contentEl.createEl("p", { text: this.message });
    contentEl.createEl("p", {
      text: this.detail,
      cls: "ttimer-confirm-detail"
    });

    const btnRow = contentEl.createDiv({ cls: "ttimer-confirm-buttons" });
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.marginTop = "20px";

    const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.callback(false);
      this.close();
    });

    const confirmBtn = btnRow.createEl("button", {
      text: "Delete",
      cls: "ttimer-btn-danger"
    });
    confirmBtn.addEventListener("click", () => {
      this.callback(true);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
