import {
  App, FuzzySuggestModal, Modal, Notice, Setting,
  TAbstractFile, TFile, TFolder, TextComponent
} from "obsidian";
import { createMatrix, isPathInside, normalizeVaultPath } from "./core";
import { t, type TranslationKey } from "./i18n";
import { MatrixConfig, Source, SubtaskMode, Zone, ZONES, LanguageSetting } from "./types";

function showError(error: unknown): void {
  new Notice(error instanceof Error ? error.message : String(error), 7000);
}

/** A mobile-compatible native Obsidian picker, restricted to existing vault entries. */
class VaultPathPicker extends FuzzySuggestModal<TAbstractFile> {
  constructor(
    app: App,
    private kind: Source["kind"],
    private onPick: (item: TAbstractFile) => void,
    private allowFile?: (file: TFile) => boolean,
    private language: LanguageSetting = "auto"
  ) {
    super(app);
    this.setPlaceholder(t(kind === "folder" ? "findFolder" : "findFile", this.language));
  }

  getItems(): TAbstractFile[] {
    if (this.kind === "folder") {
      return this.app.vault.getAllLoadedFiles()
        .filter((f): f is TFolder => f instanceof TFolder && Boolean(f.path) && f.path !== "/")
        .sort((a, b) => a.path.localeCompare(b.path));
    }
    return this.app.vault.getMarkdownFiles()
      .filter(f => !this.allowFile || this.allowFile(f))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  getItemText(item: TAbstractFile): string { return item.path; }
  onChooseItem(item: TAbstractFile, _evt: MouseEvent | KeyboardEvent): void { this.onPick(item); }
}

function openPicker(
  app: App, kind: Source["kind"], onPick: (item: TAbstractFile) => void,
  filter?: (file: TFile) => boolean, language: LanguageSetting = "auto"
): void {
  const picker = new VaultPathPicker(app, kind, onPick, filter, language);
  if (!picker.getItems().length) {
    new Notice(t(kind === "folder" ? "noFolders" : "noMarkdown", language));
    return;
  }
  picker.open();
}

export class MatrixFormModal extends Modal {
  constructor(
    app: App,
    private existing: MatrixConfig | null,
    private onSubmit: (data: MatrixConfig, filePath: string) => Promise<void>
  ) { super(app); }

  onOpen(): void {
    const { contentEl } = this;
    const originalLang = this.existing?.language || "auto";
    const tr = (key: TranslationKey) => t(key, originalLang);
    contentEl.empty();
    contentEl.createEl("h2", { text: this.existing ? tr("matrixSettings") : tr("newMatrix") });
    let type: Source["kind"] = this.existing?.source.kind || "folder";
    let path = this.existing?.source.path || "";
    let recursive = this.existing?.source.recursive ?? true;
    let subtasks: SubtaskMode = this.existing?.subtasks || "nested";
    let lang: LanguageSetting = originalLang;
    let taskFile = this.existing?.inboxFile || "";
    let filename = tr("matrixFilePlaceholder");
    let sourceInput: TextComponent;
    let taskFileInput: TextComponent;

    if (!this.existing) new Setting(contentEl).setName(tr("matrixFile"))
      .setDesc(tr("matrixFileDesc"))
      .addText(t => t.setPlaceholder(tr("matrixFilePlaceholder"))
        .setValue(filename).onChange(v => { filename = v; }));

    const sourceRow = new Setting(contentEl).setName(tr("sourceType"));
    sourceRow.addDropdown(d => d
      .addOption("folder", tr("folder"))
      .addOption("file", tr("file"))
      .setValue(type).onChange(v => {
        type = v as Source["kind"];
        // A path selected for another source type must never be reused silently.
        path = "";
        sourceInput.setValue("");
        updateSourceRows();
      }));

    new Setting(contentEl).setName(tr("sourcePath"))
      .setDesc(tr("sourceDesc"))
      .addText(t => {
        sourceInput = t;
        t.setPlaceholder(type === "folder" ? tr("chooseFolder") : tr("chooseFile"))
          .setValue(path).onChange(v => { path = v; });
      })
      .addButton(b => b.setButtonText(tr("choose")).onClick(() => {
        openPicker(this.app, type, selected => {
          path = selected.path;
          sourceInput.setValue(path);
          if (type === "folder" && taskFile && !isPathInside(taskFile, path, recursive)) {
            taskFile = "";
            taskFileInput.setValue("");
          }
          updateSourceRows();
        }, undefined, originalLang);
      }));

    const recursiveRow = new Setting(contentEl).setName(tr("recursive"))
      .setDesc(tr("recursiveDesc"))
      .addToggle(t => t.setValue(recursive).onChange(v => { recursive = v; }));

    new Setting(contentEl).setName(tr("subtasks")).addDropdown(d => d
      .addOption("nested", tr("nested"))
      .addOption("separate", tr("separate"))
      .addOption("hidden", tr("hidden"))
      .setValue(subtasks).onChange(v => { subtasks = v as SubtaskMode; }));

    new Setting(contentEl).setName(tr("language")).setDesc(tr("languageDesc"))
      .addDropdown(d => d.addOption("auto", tr("auto"))
        .addOption("ru", tr("russian")).addOption("en", tr("english"))
        .setValue(lang).onChange(value => { lang = value as LanguageSetting; }));

    const taskFileRow = new Setting(contentEl).setName(tr("newTaskFile"))
      .setDesc(tr("newTaskFileDesc"))
      .addText(t => {
        taskFileInput = t;
        t.setPlaceholder(tr("noFile")).setValue(taskFile).onChange(v => { taskFile = v; });
      })
      .addButton(b => b.setButtonText(tr("choose")).onClick(() => {
        const folderPath = normalizeVaultPath(path);
        const f = this.app.vault.getAbstractFileByPath(folderPath);
        if (!(f instanceof TFolder)) {
          showError(new Error(tr("selectFolderFirst")));
          return;
        }
        openPicker(this.app, "file", selected => {
          taskFile = selected.path;
          taskFileInput.setValue(taskFile);
        }, candidate => isPathInside(candidate.path, folderPath, recursive), originalLang);
      }))
      .addExtraButton(b => b.setIcon("x").setTooltip(tr("clearFile"))
        .onClick(() => { taskFile = ""; taskFileInput.setValue(""); }));

    const updateSourceRows = (): void => {
      const folderMode = type === "folder";
      recursiveRow.settingEl.toggleClass("em-setting-hidden", !folderMode);
      taskFileRow.settingEl.toggleClass("em-setting-hidden", !folderMode);
      sourceInput.setPlaceholder(folderMode ? tr("chooseFolder") : tr("chooseFile"));
    };
    updateSourceRows();

    new Setting(contentEl).addButton(b => b.setButtonText(tr("save")).setCta().onClick(async () => {
      try {
        const cleanPath = normalizeVaultPath(path);
        const selected = this.app.vault.getAbstractFileByPath(cleanPath);
        if (!cleanPath || (type === "folder" ? !(selected instanceof TFolder) : !(selected instanceof TFile && selected.extension === "md"))) {
          throw new Error(type === "folder"
            ? tr("sourceFolderRequired")
            : tr("sourceFileRequired"));
        }
        const source: Source = { kind: type, path: cleanPath, recursive: type === "folder" ? recursive : false };
        const cleanTaskFile = type === "folder" ? normalizeVaultPath(taskFile) : "";
        if (cleanTaskFile) {
          const target = this.app.vault.getAbstractFileByPath(cleanTaskFile);
          if (!(target instanceof TFile) || target.extension !== "md" ||
              !isPathInside(target.path, source.path, source.recursive)) {
            throw new Error(tr("targetOutsideSource"));
          }
        }
        const next = this.existing
          ? { ...this.existing, source, subtasks, language: lang, inboxFile: cleanTaskFile }
          : createMatrix(source, subtasks, cleanTaskFile, lang);
        await this.onSubmit(next, normalizeVaultPath(filename));
        this.close();
      } catch (e) { showError(e); }
    })).addButton(b => b.setButtonText(tr("cancel")).onClick(() => this.close()));
  }
  onClose(): void { this.contentEl.empty(); }
}

export class TaskInputModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private initialText: string,
    private zone: Zone | null,
    private suggestedFile: string | null,
    private callback: (text: string, zone: Zone | null, file: string | null) => Promise<void>,
    private source?: Source,
    private language: LanguageSetting = "auto"
  ) { super(app); }
  onOpen(): void {
    const el = this.contentEl;
    const tr = (key: TranslationKey) => t(key, this.language);
    el.empty();
    el.createEl("h2", { text: this.title });
    let text = this.initialText;
    let zone = this.zone;
    let path = this.suggestedFile || "";
    let fileInput: TextComponent | null = null;
    new Setting(el).setName(tr("taskText"))
      .addText(t => t.setValue(text).onChange(v => { text = v; }).inputEl.focus());
    if (zone !== null) new Setting(el).setName(tr("taskZone")).addDropdown(d => {
      for (const z of ZONES) d.addOption(z, t(z, this.language));
      d.setValue(zone!).onChange(v => { zone = v as Zone; });
    });
    if (this.suggestedFile !== null) new Setting(el).setName(tr("taskFile"))
      .setDesc(tr("taskFileDesc"))
      .addText(t => {
        fileInput = t;
        t.setPlaceholder(tr("chooseFile")).setValue(path)
          .onChange(v => { path = v; });
      })
      .addButton(b => b.setButtonText(tr("choose")).onClick(() => {
        openPicker(this.app, "file", item => {
          path = item.path;
          fileInput?.setValue(path);
        }, file => Boolean(this.source?.kind === "folder" &&
          isPathInside(file.path, this.source.path, this.source.recursive)), this.language);
      })).setClass("em-new-task-file");
    new Setting(el).addButton(b => b.setButtonText(tr("save")).setCta().onClick(async () => {
      try {
        if (!text.trim()) throw new Error(tr("emptyTask"));
        const target = this.suggestedFile === null ? null : normalizeVaultPath(path);
        if (this.suggestedFile !== null) {
          const file = this.app.vault.getAbstractFileByPath(target!);
          if (!(file instanceof TFile) || file.extension !== "md" ||
              (this.source?.kind === "folder" && !isPathInside(file.path, this.source.path, this.source.recursive))) {
            throw new Error(tr("selectTaskFile"));
          }
        }
        await this.callback(text, zone, target);
        this.close();
      } catch (e) { showError(e); }
    })).addButton(b => b.setButtonText(tr("cancel")).onClick(() => this.close()));
  }
  onClose(): void { this.contentEl.empty(); }
}

export class ConfirmDeleteModal extends Modal {
  constructor(
    app: App,
    private taskText: string,
    private onConfirm: () => Promise<void>,
    private language: LanguageSetting = "auto",
    private childCount = 0
  ) { super(app); }
  onOpen(): void {
    this.contentEl.empty();
    const tr = (key: TranslationKey) => t(key, this.language);
    this.contentEl.createEl("h2", { text: tr("deleteConfirm") });
    const text = this.childCount > 0 ? `${this.taskText} [${this.childCount}]` : this.taskText;
    this.contentEl.createEl("p", { text: t("deleteDescription", this.language, {text}) });
    if (this.childCount > 0) this.contentEl.setAttribute("data-child-count", String(this.childCount));
    new Setting(this.contentEl).addButton(b => b.setButtonText(tr("deleteLine")).setWarning().onClick(async () => {
      try { await this.onConfirm(); this.close(); } catch (e) { showError(e); }
    })).addButton(b => b.setButtonText(tr("cancel")).onClick(() => this.close()));
  }
  onClose(): void { this.contentEl.empty(); }
}
