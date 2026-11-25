import { MarkdownView, Notice, Plugin, TFile } from "obsidian";
import { decodeMatrix, convertLegacyHelp } from "./core";
import { t } from "./i18n";
import { MatrixFormModal } from "./modals";
import { MatrixStore } from "./store";
import { Task } from "./types";
import { MatrixView } from "./view";

export default class EisenhowerPlugin extends Plugin {
  store!: MatrixStore;

  onload(): void {
    this.store = new MatrixStore(this.app);
    this.registerMarkdownCodeBlockProcessor("eisenhower-matrix", (source, el, ctx) => {
      try {
        const config = decodeMatrix(source);
        const child = new MatrixView(this, el, config.id, ctx.sourcePath);
        ctx.addChild(child);
      } catch (error) {
        el.createDiv({ cls: "em-error", text: t("matrixError", "auto", {error: error instanceof Error ? error.message : String(error)}) });
      }
    });

    this.addCommand({
      id: "create-matrix-note", name: t("createMatrix"),
      callback: () => this.openCreateModal()
    });
    this.addRibbonIcon("layout-grid", t("createMatrix"), () => this.openCreateModal());

    this.addCommand({
      id: "convert-legacy-matrix-help", name: t("updateHelp"),
      callback: () => void this.updateLegacyHelp()
    });

    // Keep source paths valid after a rename performed *within* Obsidian.
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
        void this.store.rewritePathsAfterRename(file, oldPath).catch(error => {
          new Notice(t("renamePathError", "auto", {error: String(error)}), 8000);
        });
      }));
    });
  }

  private openCreateModal(): void {
    new MatrixFormModal(this.app, null, async (config, path) => {
      // Require a real source before creating a matrix to avoid a broken first-run note.
      await this.store.sourceFiles(config.source);
      const f = await this.store.createMatrix(path, config);
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.openFile(f);
      if (leaf.view instanceof MarkdownView) await leaf.setViewState({ type: "markdown", state: { file: f.path, mode: "preview" } });
      new Notice(t("matrixCreated", config.language));
    }).open();
  }


  private async updateLegacyHelp(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new Notice(t("openMatrixNoteFirst")); return;
    }
    try {
      let changed = false;
      await this.app.vault.process(file, current => {
        const updated = convertLegacyHelp(current);
        changed = updated !== current;
        return updated;
      });
      new Notice(t(changed ? "updatedHelp" : "nothingToUpdate"));
    } catch (error) {
      new Notice(t("errorSavingHelp", "auto", {error: String(error)}), 8000);
    }
  }

  async openTask(task: Task): Promise<void> {
    const source = this.app.vault.getAbstractFileByPath(task.path);
    if (!(source instanceof TFile)) throw new Error(t("sourceNotFound"));
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(source);
    if (leaf.view instanceof MarkdownView) {
      const editor = leaf.view.editor;
      const range = editor.lineCount();
      editor.setCursor(Math.min(task.line, Math.max(range - 1, 0)), 0);
      editor.scrollIntoView({from: {line: Math.min(task.line, range - 1), ch: 0}, to: {line: Math.min(task.line, range - 1), ch: 0}}, true);
    }
  }
}
