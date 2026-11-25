import { App, TAbstractFile, TFile, TFolder, normalizePath } from "obsidian";
import { MatrixConfig, newId, Source, Task, TaskEdit } from "./types";
import { t } from "./i18n";
import {
  isPathInside, makeMatrixNote, normalizeVaultPath, parseTaskLine,
  readMatrixBlocks, replaceLine, replaceMatrixBlock, rewriteTaskLine, scanMarkdown,
  validSource
} from "./core";

export class MatrixStore {
  constructor(private app: App) {}

  async createMatrix(path: string, matrix: MatrixConfig): Promise<TFile> {
    const clean = normalizeVaultPath(path);
    if (!clean.endsWith(".md")) throw new Error(t("matrixMustMd"));
    if (this.app.vault.getAbstractFileByPath(clean)) throw new Error(t("matrixExists"));
    await this.ensureFolder(clean);
    return this.app.vault.create(clean, makeMatrixNote(matrix));
  }

  async findMatrix(id: string, preferredPath: string): Promise<TFile> {
    const candidate = this.app.vault.getAbstractFileByPath(preferredPath);
    if (candidate instanceof TFile && candidate.extension === "md") {
      const content = await this.app.vault.cachedRead(candidate);
      if (readMatrixBlocks(content).some(b => b.matrix.id === id)) return candidate;
    }
    const found: TFile[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.path === preferredPath) continue;
      const body = await this.app.vault.cachedRead(file);
      if (!body.includes("```eisenhower-matrix")) continue;
      if (readMatrixBlocks(body).some(b => b.matrix.id === id)) found.push(file);
      if (found.length > 1) break;
    }
    if (found.length !== 1) throw new Error(found.length === 0
      ? t("matrixMissing")
      : t("matrixDuplicate"));
    return found[0];
  }

  async loadMatrix(file: TFile, id: string): Promise<MatrixConfig> {
    const blocks = readMatrixBlocks(await this.app.vault.cachedRead(file)).filter(b => b.matrix.id === id);
    if (blocks.length !== 1) throw new Error(t("matrixCorrupt"));
    return blocks[0].matrix;
  }

  async updateMatrix(file: TFile, id: string, change: (matrix: MatrixConfig) => MatrixConfig): Promise<void> {
    await this.app.vault.process(file, current => replaceMatrixBlock(current, id, change));
  }

  async sourceFiles(source: Source): Promise<TFile[]> {
    if (!validSource(source)) throw new Error(t("sourcePathInvalid"));
    if (source.kind === "file") {
      const f = this.app.vault.getAbstractFileByPath(source.path);
      if (!(f instanceof TFile) || f.extension !== "md") throw new Error(t("fileMissing", "auto", {path: source.path}));
      return [f];
    }
    const folder = this.app.vault.getAbstractFileByPath(source.path);
    if (!(folder instanceof TFolder)) throw new Error(t("folderMissing", "auto", {path: source.path}));
    return this.app.vault.getMarkdownFiles().filter(f => isPathInside(f.path, source.path, source.recursive));
  }

  async loadTasks(source: Source): Promise<Task[]> {
    const files = await this.sourceFiles(source);
    const batches = await Promise.all(files.map(async f => scanMarkdown(await this.app.vault.cachedRead(f), f.path)));
    return batches.flat();
  }

  async editTask(task: Task, edit: TaskEdit): Promise<string> {
    const f = this.app.vault.getAbstractFileByPath(task.path);
    if (!(f instanceof TFile)) throw new Error(t("taskSourceMissing", "auto", {path: task.path}));
    const id = task.anchor ?? newId();
    await this.app.vault.process(f, current => {
      const lines = current.split(/\r?\n/);
      const candidateIndices: number[] = [];
      if (task.anchor) {
        for (let i = 0; i < lines.length; i++) if (parseTaskLine(lines[i])?.anchor === task.anchor) candidateIndices.push(i);
      } else {
        // Prefer exact physical line; when it moved, require a unique exact match.
        if (lines[task.line] === task.raw) candidateIndices.push(task.line);
        else for (let i = 0; i < lines.length; i++) if (lines[i] === task.raw) candidateIndices.push(i);
      }
      if (candidateIndices.length !== 1) throw new Error(t("taskChanged"));
      const lineNo = candidateIndices[0];
      const present = parseTaskLine(lines[lineNo]);
      if (!present) throw new Error(t("lineNotTask"));
      if (task.anchor && present.anchor !== task.anchor) throw new Error(t("taskIdMismatch"));
      if (edit.remove) return replaceLine(current, lineNo, null);
      const nextLine = rewriteTaskLine(lines[lineNo], edit.done ?? present.done, edit.text ?? present.text, id);
      return replaceLine(current, lineNo, nextLine);
    });
    return id;
  }

  async createTask(config: MatrixConfig, text: string, filePath?: string): Promise<string> {
    const normalized = text.trim();
    if (!normalized || /[\r\n]/.test(normalized)) throw new Error(t("singleLineTask"));
    let path: string;
    if (config.source.kind === "file") path = config.source.path;
    else {
      path = normalizeVaultPath(filePath || config.inboxFile);
      if (!path) throw new Error(t("selectExistingTaskFile"));
      if (!path.endsWith(".md") || !isPathInside(path, config.source.path, config.source.recursive))
        throw new Error(t("taskFileOutside"));
    }
    const id = newId();
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== "md")
      throw new Error(t("existingFileMissing", "auto", {path}));
    await this.app.vault.process(file, current => {
      const eol = current.includes("\r\n") ? "\r\n" : "\n";
      return current + (current.length && !current.endsWith("\n") ? eol : "") + `- [ ] ${normalized} ^${id}${eol}`;
    });
    return id;
  }

  private async ensureFolder(filePath: string): Promise<void> {
    const parts = normalizeVaultPath(filePath).split("/").slice(0, -1);
    let current = "";
    for (const segment of parts) {
      current = current ? `${current}/${segment}` : segment;
      const found: TAbstractFile | null = this.app.vault.getAbstractFileByPath(current);
      if (found && !(found instanceof TFolder)) throw new Error(t("cantCreateFolder", "auto", {path: current}));
      if (!found) await this.app.vault.createFolder(normalizePath(current));
    }
  }

  async rewritePathsAfterRename(moved: TAbstractFile, oldPath: string): Promise<void> {
    // In-app rename: keep source paths in sync. Remote FIT renames may arrive as delete/create.
    const newPath = moved.path;
    const redirect = (original: string): string => {
      if (original === oldPath) return newPath;
      if (moved instanceof TFolder && original.startsWith(oldPath + "/")) return newPath + original.slice(oldPath.length);
      return original;
    };
    for (const file of this.app.vault.getMarkdownFiles()) {
      const txt = await this.app.vault.cachedRead(file);
      if (!txt.includes("```eisenhower-matrix")) continue;
      for (const block of readMatrixBlocks(txt)) {
        const sourcePath = redirect(block.matrix.source.path);
        const inbox = redirect(block.matrix.inboxFile);
        if (sourcePath === block.matrix.source.path && inbox === block.matrix.inboxFile) continue;
        await this.updateMatrix(file, block.matrix.id, state => ({
          ...state, source: {...state.source, path: redirect(state.source.path)}, inboxFile: redirect(state.inboxFile)
        }));
      }
    }
  }
}
