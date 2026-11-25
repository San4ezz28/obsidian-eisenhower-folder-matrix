import { t } from "./i18n";
import { emptyOrder, MatrixConfig, newId, Quadrant, QUADRANTS, Source, Task, Zone, ZONES } from "./types";

export const FENCE = "eisenhower-matrix";
const TASK_LINE = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)\[([ xX])\]([ \t]+)(.*)$/;
// Obsidian tasks may live inside callouts/Markdown blockquotes: > - [ ] and >     - [ ].
// Keep the exact quote prefix for round-trip source edits.
function splitQuotePrefix(line: string): { prefix: string; body: string } {
  const prefix = /^([ \t]*(?:>[ \t]?)+)/.exec(line)?.[1] || "";
  return { prefix, body: line.slice(prefix.length) };
}
const BLOCK_ID = /\s+\^(em-[a-z0-9-]{8,64})\s*$/i;
const MATRIX_FENCE = /(^|\n)(```eisenhower-matrix[ \t]*\r?\n)([\s\S]*?)(\r?\n```)(?=\r?\n|$)/g;

export function normalizeVaultPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}
export function isPathInside(path: string, folder: string, recursive: boolean): boolean {
  const f = normalizeVaultPath(folder);
  const p = normalizeVaultPath(path);
  return Boolean(f) && p.startsWith(f + "/") && (recursive || !p.slice(f.length + 1).includes("/"));
}
export function validSource(source: Source): boolean {
  return Boolean(source.path && normalizeVaultPath(source.path)) &&
    (source.kind === "folder" || (source.kind === "file" && source.path.toLowerCase().endsWith(".md")));
}
export function createMatrix(source: Source, subtasks: MatrixConfig["subtasks"] = "nested", inboxFile = "", language: MatrixConfig["language"] = "auto"): MatrixConfig {
  return {
    version: 1, id: newId(), source: { ...source, path: normalizeVaultPath(source.path) },
    inboxFile: normalizeVaultPath(inboxFile), subtasks, language, assignments: {}, order: emptyOrder()
  };
}
export function encodeMatrix(matrix: MatrixConfig): string {
  return JSON.stringify(matrix, null, 2);
}
export function makeMatrixNote(matrix: MatrixConfig): string {
  return `# ${t("matrixTitle", matrix.language)}\n\n${matrixHelpCallout(matrix.language)}\n\n\`\`\`${FENCE}\n${encodeMatrix(matrix)}\n\`\`\`\n`;
}
/** A collapsed native Obsidian callout, never inserted inside the matrix JSON fence. */
export function matrixHelpCallout(language: MatrixConfig["language"] = "auto"): string {
  return `> [!info]- ${t("calloutTitle", language)}\n> ${t("calloutBody", language)}`;
}

/** Opt-in migration: only replace the exact historic hint in a matrix note. */
export function convertLegacyHelp(content: string): string {
  if (!content.includes(`\`\`\`${FENCE}`)) return content;
  const blocks = readMatrixBlocks(content);
  if (!blocks.length) return content;
  const existing = /^> \[!info\]- (?:Как пользоваться матрицей|How to use the matrix)\s*$/m;
  if (existing.test(content)) return content;
  const callout = matrixHelpCallout(blocks[0].matrix.language);
  const original = "> Открой заметку в режиме чтения (Reading view). Для изменения настроек нажми ⚙ в самой матрице.";
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  if (content.includes(original)) return content.replace(original, callout.replace(/\n/g, eol));
  // No hint, e.g. a matrix created in v0.1.3: insert only on explicit command.
  const start = content.indexOf(`\`\`\`${FENCE}`);
  const before = content.slice(0, start).replace(/(?:\r?\n)*$/, "");
  return before + eol + eol + callout.replace(/\n/g, eol) + eol + eol + content.slice(start);
}

export function validateMatrix(value: unknown): MatrixConfig {
  if (!value || typeof value !== "object") throw new Error(t("jsonMissing"));
  const obj = value as Partial<MatrixConfig>;
  if (obj.version !== 1 || typeof obj.id !== "string" || !/^em-[a-z0-9-]+$/i.test(obj.id))
    throw new Error(t("invalidVersion"));
  if (!obj.source || !validSource(obj.source)) throw new Error(t("invalidSource"));
  if (!["nested", "separate", "hidden"].includes(String(obj.subtasks))) throw new Error(t("invalidSubtasks"));
  if (obj.language !== undefined && !["auto", "ru", "en"].includes(String(obj.language))) throw new Error(t("invalidLanguage"));
  if (!obj.assignments || typeof obj.assignments !== "object" || Array.isArray(obj.assignments))
    throw new Error(t("invalidAssignments"));
  for (const v of Object.values(obj.assignments)) if (!QUADRANTS.includes(v as Quadrant)) throw new Error(t("invalidQuadrant"));
  const order = emptyOrder();
  for (const zone of ZONES) {
    const seq = obj.order?.[zone];
    if (seq !== undefined && (!Array.isArray(seq) || seq.some(x => typeof x !== "string")))
      throw new Error(t("invalidOrder"));
    order[zone] = seq ?? [];
  }
  return {
    version: 1, id: obj.id,
    source: { kind: obj.source.kind, path: normalizeVaultPath(obj.source.path), recursive: Boolean(obj.source.recursive) },
    inboxFile: normalizeVaultPath(String(obj.inboxFile || "")),
    subtasks: obj.subtasks!, language: obj.language ?? "auto", assignments: { ...obj.assignments }, order
  };
}
export function decodeMatrix(text: string): MatrixConfig {
  try { return validateMatrix(JSON.parse(text)); }
  catch (e) { throw new Error(t("configError", "auto", {error: e instanceof Error ? e.message : String(e)})); }
}
export function readMatrixBlocks(content: string): { matrix: MatrixConfig; start: number; end: number }[] {
  const found: { matrix: MatrixConfig; start: number; end: number }[] = [];
  for (const match of content.matchAll(new RegExp(MATRIX_FENCE.source, "g"))) {
    try { found.push({ matrix: decodeMatrix(match[3]), start: match.index!, end: match.index! + match[0].length }); }
    catch { /* malformed blocks handled in UI; never overwrite them */ }
  }
  return found;
}
export function replaceMatrixBlock(content: string, id: string, transform: (current: MatrixConfig) => MatrixConfig): string {
  let matches = 0;
  const replaced = content.replace(new RegExp(MATRIX_FENCE.source, "g"), (full: string, first: string, startFence: string, data: string, endFence: string) => {
    const value = decodeMatrix(data); // refuse to write when any matrix block is malformed
    if (value.id !== id) return full;
    matches++;
    const next = validateMatrix(transform(value));
    if (next.id !== id) throw new Error(t("immutableId"));
    return first + startFence + encodeMatrix(next) + endFence;
  });
  if (matches !== 1) throw new Error(t("notUniqueMatrix"));
  return replaced;
}
function indentOf(whitespace: string): number { return whitespace.replace(/\t/g, "    ").length; }
export function parseTaskLine(line: string): { text: string; done: boolean; indent: number; anchor: string | null } | null {
  const { body } = splitQuotePrefix(line);
  const match = TASK_LINE.exec(body);
  if (!match) return null;
  const end = BLOCK_ID.exec(match[6]);
  return {
    text: (end ? match[6].slice(0, end.index) : match[6]).trim(),
    done: match[4].toLowerCase() === "x",
    indent: indentOf(match[1]), anchor: end ? end[1].toLowerCase() : null
  };
}
export function ephemeralId(path: string, line: number, raw: string): string {
  // Coordinates only identify unclassified tasks until a stable block ID is assigned.
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  return `u:${encodeURIComponent(path)}:${line}:${(hash >>> 0).toString(36)}`;
}
export function scanMarkdown(content: string, path: string): Task[] {
  const lines = content.split(/\r?\n/);
  const tasks: Task[] = [];
  const parents: Task[] = [];
  let fence: { char: string; size: number } | null = null;
  let frontmatter = lines[0]?.trim() === "---";
  let htmlComment = false;
  let calloutGroup: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (frontmatter) {
      if (i !== 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
      continue;
    }
    if (htmlComment) {
      if (line.includes("-->")) htmlComment = false;
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      htmlComment = !line.includes("-->");
      continue;
    }
    // Code fences inside blockquotes must not generate fake tasks.
    const { body } = splitQuotePrefix(line);
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(body);
    if (marker) {
      if (!fence) fence = {char: marker[1][0], size: marker[1].length};
      else if (marker[1][0] === fence.char && marker[1].length >= fence.size && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    // Preserve the category for tasks inside the user's callout sections.
    const callout = /^\s*\[![^\]]+\][+-]?\s*(.*)$/.exec(body);
    if (callout) {
      parents.length = 0;
      calloutGroup = callout[1].split(" · ")[0].trim() || undefined;
    } else if (/^\s*#{1,6}\s/.test(body)) {
      parents.length = 0;
    }
    const parsed = parseTaskLine(line);
    if (!parsed) continue;
    while (parents.length && parents[parents.length - 1].indent >= parsed.indent) parents.pop();
    // Blank checkboxes in templates are placeholders, not actionable tasks.
    if (!parsed.text.trim()) continue;
    const task: Task = {
      id: parsed.anchor || ephemeralId(path, i, line), anchor: parsed.anchor,
      path, line: i, raw: line, text: parsed.text, done: parsed.done,
      group: /^\s*>/.test(line) ? calloutGroup : undefined,
      indent: parsed.indent, parentId: parents.length ? parents[parents.length - 1].id : null
    };
    tasks.push(task);
    parents.push(task);
  }
  return tasks;
}
export function getTaskZone(task: Task, config: MatrixConfig): Zone {
  const q = config.assignments[task.id];
  return q && QUADRANTS.includes(q) ? q : "inbox";
}
export function orderedTasks(items: Task[], zone: Zone, config: MatrixConfig): Task[] {
  const sequence = config.order[zone] || [];
  const lookup = new Map(sequence.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const i = lookup.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const j = lookup.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return i - j || a.path.localeCompare(b.path) || a.line - b.line;
  });
}
export function moveAssignment(state: MatrixConfig, id: string, to: Zone, before?: string): MatrixConfig {
  const next = validateMatrix(state);
  for (const zone of ZONES) next.order[zone] = next.order[zone].filter(x => x !== id);
  if (to === "inbox") delete next.assignments[id];
  else next.assignments[id] = to;
  const index = before ? next.order[to].indexOf(before) : -1;
  if (index < 0) next.order[to].push(id); else next.order[to].splice(index, 0, id);
  return next;
}
// Replace only the target physical line; preserve other text and original EOL bytes.
export function replaceLine(data: string, line: number, replacement: string | null): string {
  const matches = [...data.matchAll(/[^\r\n]*(?:\r?\n|$)/g)].filter(m => m[0].length || m.index! < data.length);
  if (line < 0 || line >= matches.length) throw new Error(t("lineMissing"));
  const m = matches[line];
  const end = m[0].endsWith("\r\n") ? "\r\n" : m[0].endsWith("\n") ? "\n" : "";
  const next = replacement === null ? "" : replacement + end;
  return data.slice(0, m.index!) + next + data.slice(m.index! + m[0].length);
}
export function rewriteTaskLine(raw: string, done: boolean, text: string, id: string): string {
  const { prefix, body } = splitQuotePrefix(raw);
  const match = TASK_LINE.exec(body);
  if (!match) throw new Error(t("lineNotTask"));
  if (!text.trim() || /[\r\n]/.test(text)) throw new Error(t("taskMustOneLine"));
  const oldAnchor = BLOCK_ID.exec(match[6]);
  if (oldAnchor && oldAnchor[1].toLowerCase() !== id) throw new Error(t("taskIdChanged"));
  if (!oldAnchor && /\s+\^[a-z0-9-]{4,64}\s*$/i.test(match[6]))
    throw new Error(t("differentBlockId"));
  return `${prefix}${match[1]}${match[2]}${match[3]}[${done ? "x" : " "}]${match[5]}${text.trim()} ^${id}`;
}
