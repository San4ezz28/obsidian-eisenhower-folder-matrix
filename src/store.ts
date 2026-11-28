import { App, TAbstractFile, TFile, TFolder, normalizePath } from "obsidian";
import { MatrixConfig, newId, Source, Task, TaskEdit } from "./types";
import { t } from "./i18n";
import {
  isPathInside, makeMatrixNote, normalizeVaultPath, parseTaskLine,
  readMatrixBlocks, replaceLine, replaceMatrixBlock, rewriteTaskLine, scanMarkdown,
  validSource
} from "./core";

// Parser anchors: a ^em- id, or any other ^word of 4–64 id characters (65–67 only if it is an em- id).
const BLOCK_TOKEN = /(?:^|[ \t])(\^([A-Za-z0-9-]{4,67}))(?=[ \t]|$)/g;
const EM_ANCHOR = /^em-[a-z0-9-]{8,64}$/i;
const FOREIGN_ANCHOR = /^[A-Za-z0-9-]{4,64}$/;

function findBlockToken(text: string): string | null {
  const re = new RegExp(BLOCK_TOKEN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const id = match[2];
    if (EM_ANCHOR.test(id) || FOREIGN_ANCHOR.test(id)) return match[1];
  }
  return null;
}

// True only for segments under the source root. The source folder itself may be _fit or a dotfolder.
function excludedBelowSource(filePath: string, sourcePath: string): boolean {
  const file = normalizeVaultPath(filePath);
  const root = normalizeVaultPath(sourcePath);
  if (!root || file === root || !file.startsWith(root + "/")) return false;
  return file.slice(root.length + 1).split("/").some(segment =>
    segment.toLowerCase() === "_fit" || segment.startsWith(".")
  );
}

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
      const decoded = readMatrixBlocks(content);
      if (decoded.some(b => b.matrix.id === id)) return candidate;
      // Preferred note contains the fence, but this block does not decode
      // (broken JSON or conflict markers). Do not scan the vault or rewrite the file.
      if (this.damagedMatrixFence(content, decoded.length)) throw new Error(t("matrixDamaged"));
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
    const content = await this.app.vault.cachedRead(file);
    const decoded = readMatrixBlocks(content);
    const blocks = decoded.filter(b => b.matrix.id === id);
    if (blocks.length === 1) return blocks[0].matrix;
    // A fence that does not decode is damaged, not a generic missing/corrupt mix. Never write here.
    if (this.damagedMatrixFence(content, decoded.length)) throw new Error(t("matrixDamaged"));
    throw new Error(t("matrixCorrupt"));
  }

  /** True when an eisenhower-matrix opener did not survive readMatrixBlocks (malformed JSON or a conflict). */
  private damagedMatrixFence(content: string, decodedCount: number): boolean {
    if (!content.includes("```eisenhower-matrix")) return false;
    let openings = 0;
    for (const line of content.split(/\r?\n/)) {
      if (/^```eisenhower-matrix[ \t]*$/.test(line)) openings++;
    }
    return openings > decodedCount;
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
    return this.app.vault.getMarkdownFiles().filter(f => {
      if (!isPathInside(f.path, source.path, source.recursive)) return false;
      return !excludedBelowSource(f.path, source.path);
    });
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
        // No anchor: edit only a unique exact line. A repeated raw line is ambiguous
        // even when the recorded line number still matches one of the copies.
        for (let i = 0; i < lines.length; i++) if (lines[i] === task.raw) candidateIndices.push(i);
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
    const blockToken = findBlockToken(normalized);
    if (blockToken) throw new Error(t("blockTokenInText", "auto", {token: blockToken}));
    let path: string;
    if (config.source.kind === "file") path = config.source.path;
    else {
      path = normalizeVaultPath(filePath || config.inboxFile);
      if (!path) throw new Error(t("selectExistingTaskFile"));
      if (!path.endsWith(".md") || !isPathInside(path, config.source.path, config.source.recursive))
        throw new Error(t("taskFileOutside"));
    }
    // Same predicate as sourceFiles: do not append into a note the matrix will never list.
    if (excludedBelowSource(path, config.source.path)) throw new Error(t("taskFileOutside"));
    const id = newId();
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== "md")
      throw new Error(t("existingFileMissing", "auto", {path}));
    await this.app.vault.process(file, current => {
      const eol = current.includes("\r\n") ? "\r\n" : "\n";
      const next = current + (current.length && !current.endsWith("\n") ? eol : "") + `- [ ] ${normalized} ^${id}${eol}`;
      // Throwing here aborts the write, so an invisible task is never appended.
      if (!scanMarkdown(next, path).some(task => task.anchor === id)) throw new Error(t("taskNotVisibleAfterAdd"));
      return next;
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
    let failed = 0;
    const reasons: string[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const txt = await this.app.vault.cachedRead(file);
      if (!txt.includes("```eisenhower-matrix")) continue;
      for (const block of readMatrixBlocks(txt)) {
        const sourcePath = redirect(block.matrix.source.path);
        const inbox = redirect(block.matrix.inboxFile);
        if (sourcePath === block.matrix.source.path && inbox === block.matrix.inboxFile) continue;
        try {
          await this.updateMatrix(file, block.matrix.id, state => ({
            ...state, source: {...state.source, path: redirect(state.source.path)}, inboxFile: redirect(state.inboxFile)
          }));
        } catch (error) {
          // One matrix must not stop the rest. Successful writes above stay on disk.
          failed++;
          reasons.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
    if (failed > 0) throw new Error(t("renamePartial", "auto", {error: `${failed} failed: ${reasons.join("; ")}`}));
  }
}
