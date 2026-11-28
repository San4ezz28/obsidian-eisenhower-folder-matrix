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
const MATRIX_FENCE = /(^|\n)(```eisenhower-matrix[ \t]*\r?\n)([\s\S]*?)(\r?\n```)(?=\r?\n|$)/g;
const MATRIX_KEYS = ["version", "id", "source", "inboxFile", "subtasks", "language", "assignments", "order"];
const SOURCE_KEYS = ["kind", "path", "recursive"];
// ^em- ids are anchors anywhere on the line. Any other ^token of 4-64 id characters is a
// foreign Obsidian block id only when it is the last token (trailing whitespace allowed).
const BLOCK_TOKEN = /(?:^|[ \t])(\^([A-Za-z0-9-]{4,67}))(?=[ \t]|$)/g;
const EM_ANCHOR = /^em-[a-z0-9-]{8,64}$/i;
const FOREIGN_ANCHOR = /^[A-Za-z0-9-]{4,64}$/;

interface BlockToken { id: string; em: boolean; start: number; end: number }

function blockTokens(text: string): BlockToken[] {
  const tokens: BlockToken[] = [];
  const re = new RegExp(BLOCK_TOKEN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const id = match[2];
    const em = EM_ANCHOR.test(id);
    if (!em && !FOREIGN_ANCHOR.test(id)) continue;
    const start = match.index + match[0].length - match[1].length;
    tokens.push({ id, em, start, end: start + match[1].length });
  }
  return tokens;
}
function textWithoutToken(text: string, token: BlockToken): string {
  const before = text.slice(0, token.start).replace(/[ \t]+$/, "");
  const after = text.slice(token.end).replace(/^[ \t]+/, "");
  return (before && after ? `${before} ${after}` : before || after).trim();
}
// Obsidian treats a block id as a reference only at the end of the line.
function trailingForeign(text: string, tokens: BlockToken[]): BlockToken | null {
  const found = tokens.filter(token => !token.em && /^[ \t]*$/.test(text.slice(token.end)));
  return found.length === 1 ? found[0] : null;
}
function unknownKeys(value: object, known: readonly string[]): string[] {
  return Object.keys(value).filter(key => !known.includes(key)).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}
function assignUnknown(target: Record<string, unknown>, source: object, known: readonly string[]): void {
  const bag = source as Record<string, unknown>;
  for (const key of unknownKeys(source, known)) target[key] = bag[key];
}
// `.` / `..` / empty segments are traversal. A leading dot hides vault metadata such as .obsidian.
// _fit and other scan exclusions are intentionally not rejected here.
function unsafeVaultPath(normalized: string): boolean {
  const segments = normalized.split("/");
  if (segments.some(segment => segment === "" || segment === "." || segment === "..")) return true;
  return segments[0].startsWith(".");
}

export function normalizeVaultPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}
export function isPathInside(path: string, folder: string, recursive: boolean): boolean {
  const f = normalizeVaultPath(folder);
  const p = normalizeVaultPath(path);
  return Boolean(f) && p.startsWith(f + "/") && (recursive || !p.slice(f.length + 1).includes("/"));
}
export function validSource(source: Source): boolean {
  const path = source?.path ? normalizeVaultPath(source.path) : "";
  if (!path || unsafeVaultPath(path)) return false;
  return source.kind === "folder" || (source.kind === "file" && source.path.toLowerCase().endsWith(".md"));
}
function orderedSource(source: Source, path: string, recursive: boolean): Source {
  const ordered: Record<string, unknown> = { kind: source.kind, path, recursive };
  assignUnknown(ordered, source, SOURCE_KEYS);
  return ordered as unknown as Source;
}
export function createMatrix(source: Source, subtasks: MatrixConfig["subtasks"] = "nested", inboxFile = "", language: MatrixConfig["language"] = "auto"): MatrixConfig {
  const normalized: Source = { ...source, path: normalizeVaultPath(source.path) };
  if (!validSource(normalized)) throw new Error(t("invalidSource"));
  return {
    version: 1, id: newId(), source: normalized,
    inboxFile: normalizeVaultPath(inboxFile), subtasks, language, assignments: {}, order: emptyOrder()
  };
}
export function encodeMatrix(matrix: MatrixConfig): string {
  const ordered: Record<string, unknown> = {
    version: matrix.version, id: matrix.id,
    source: orderedSource(matrix.source, matrix.source.path, matrix.source.recursive),
    inboxFile: matrix.inboxFile, subtasks: matrix.subtasks, language: matrix.language,
    assignments: matrix.assignments, order: matrix.order
  };
  assignUnknown(ordered, matrix, MATRIX_KEYS);
  return JSON.stringify(ordered, null, 2);
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
  const ordered: Record<string, unknown> = {
    version: 1, id: obj.id,
    source: orderedSource(obj.source, normalizeVaultPath(obj.source.path), Boolean(obj.source.recursive)),
    inboxFile: normalizeVaultPath(String(obj.inboxFile || "")),
    subtasks: obj.subtasks!, language: obj.language ?? "auto", assignments: { ...obj.assignments }, order
  };
  assignUnknown(ordered, obj as object, MATRIX_KEYS);
  return ordered as unknown as MatrixConfig;
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
  // A note that already uses CRLF keeps CRLF inside the replaced JSON. Bytes outside the fence stay as they were.
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const replaced = content.replace(new RegExp(MATRIX_FENCE.source, "g"), (full: string, first: string, startFence: string, data: string, endFence: string) => {
    const value = decodeMatrix(data); // refuse to write when any matrix block is malformed
    if (value.id !== id) return full;
    matches++;
    const next = validateMatrix(transform(value));
    if (next.id !== id) throw new Error(t("immutableId"));
    const json = eol === "\n" ? encodeMatrix(next) : encodeMatrix(next).replace(/\n/g, eol);
    return first + startFence + json + endFence;
  });
  if (matches !== 1) throw new Error(t("notUniqueMatrix"));
  return replaced;
}
function indentOf(whitespace: string): number { return whitespace.replace(/\t/g, "    ").length; }
export function parseTaskLine(line: string): { text: string; done: boolean; indent: number; anchor: string | null } | null {
  const { body } = splitQuotePrefix(line);
  const match = TASK_LINE.exec(body);
  if (!match) return null;
  const rawText = match[6];
  const tokens = blockTokens(rawText);
  const em = tokens.filter(token => token.em);
  const foreign = trailingForeign(rawText, tokens);
  // Exactly one ^em- is the anchor even beside a foreign token; only that em token leaves the display text.
  // Two or more ^em- tokens are ambiguous, so the raw text stays intact and there is no anchor.
  let text = rawText.trim();
  let anchor: string | null = null;
  if (em.length === 1) {
    anchor = em[0].id.toLowerCase();
    text = textWithoutToken(rawText, em[0]);
  } else if (em.length === 0 && foreign) {
    anchor = foreign.id;
    text = textWithoutToken(rawText, foreign);
  }
  return {
    text, done: match[4].toLowerCase() === "x",
    indent: indentOf(match[1]), anchor
  };
}
function stableTaskId(path: string, anchor: string | null, line: number, raw: string): string {
  if (!anchor) return ephemeralId(path, line, raw);
  // ^em- ids are unique across the vault. A foreign block id is unique only inside one file.
  if (EM_ANCHOR.test(anchor)) return anchor;
  return `${path}#^${anchor}`;
}
export function ephemeralId(path: string, line: number, raw: string): string {
  // Coordinates only identify unclassified tasks until a stable block ID is assigned.
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  return `u:${encodeURIComponent(path)}:${line}:${(hash >>> 0).toString(36)}`;
}
function hasClosingFrontmatter(lines: string[]): boolean {
  if (lines[0]?.trim() !== "---") return false;
  for (let i = 1; i < lines.length; i++) if (/^(---|\.\.\.)\s*$/.test(lines[i])) return true;
  return false;
}
function fenceMarker(body: string): { char: string; size: number; rest: string } | null {
  // Indent is unlimited: a fence nested in a list is often four or more spaces in.
  const marker = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(body);
  if (!marker) return null;
  return { char: marker[2][0], size: marker[2].length, rest: marker[3] };
}
function leadingIndent(line: string): number {
  return indentOf(/^([ \t]*)/.exec(line)?.[1] ?? "");
}
function isQuoteLine(line: string): boolean {
  return /^\s*>/.test(line);
}
// A real paragraph at column 0 ends the open list. Blank lines do not.
function breaksParentStack(line: string): boolean {
  return line.trim() !== "" && !isQuoteLine(line) && leadingIndent(line) === 0;
}
function closingBacktick(line: string, open: number, size: number): number {
  for (let j = open + size; j < line.length; j++) {
    if (line[j] !== "`") continue;
    let n = 0;
    while (j + n < line.length && line[j + n] === "`") n++;
    if (n === size) return j;
    j += n - 1;
  }
  return -1;
}
function maskPercentComments(line: string, inComment: boolean): { visible: string; inComment: boolean } {
  let visible = "";
  let i = 0;
  while (i < line.length) {
    // %% inside a matched inline code span is not a comment marker.
    if (!inComment && line[i] === "`") {
      let size = 1;
      while (i + size < line.length && line[i + size] === "`") size++;
      const close = closingBacktick(line, i, size);
      if (close >= 0) {
        const end = close + size;
        visible += line.slice(i, end);
        i = end;
        continue;
      }
      visible += "`";
      i++;
      continue;
    }
    if (i + 1 < line.length && line[i] === "%" && line[i + 1] === "%") {
      inComment = !inComment;
      i += 2;
      continue;
    }
    if (!inComment) visible += line[i];
    i++;
  }
  return { visible, inComment };
}
export function scanMarkdown(content: string, path: string): Task[] {
  const lines = content.split(/\r?\n/);
  const tasks: Task[] = [];
  const parents: Task[] = [];
  let fence: { char: string; size: number } | null = null;
  // A leading --- is frontmatter only when a closing --- or ... exists. Otherwise it is a rule.
  let frontmatter = hasClosingFrontmatter(lines);
  let htmlComment = false;
  let percentComment = false;
  let calloutGroup: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (frontmatter) {
      if (i !== 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
      continue;
    }
    const { body } = splitQuotePrefix(line);
    if (fence) {
      const marker = fenceMarker(body);
      if (marker && marker.char === fence.char && marker.size >= fence.size && !marker.rest.trim()) fence = null;
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
    // %% comments, including multiline ones, are not tasks and must not toggle fences.
    const masked = maskPercentComments(line, percentComment);
    const hidden = (percentComment || line.includes("%%")) && masked.visible.trim() === "";
    percentComment = masked.inComment;
    if (hidden) continue;
    const marker = fenceMarker(body);
    if (marker) {
      fence = { char: marker.char, size: marker.size };
      if (!isQuoteLine(line)) calloutGroup = undefined;
      if (breaksParentStack(line)) parents.length = 0;
      continue;
    }
    // Callout labels apply only inside that blockquote. A later plain line or heading drops the label.
    const callout = /^\s*\[![^\]]+\][+-]?\s*(.*)$/.exec(body);
    if (callout) {
      parents.length = 0;
      calloutGroup = callout[1].split(" · ")[0].trim() || undefined;
    } else if (/^\s*#{1,6}\s/.test(body)) {
      parents.length = 0;
      calloutGroup = undefined;
    } else if (!isQuoteLine(line)) {
      calloutGroup = undefined;
    }
    const parsed = parseTaskLine(line);
    if (!parsed) {
      if (breaksParentStack(line)) parents.length = 0;
      continue;
    }
    while (parents.length && parents[parents.length - 1].indent >= parsed.indent) parents.pop();
    // Blank checkboxes in templates are placeholders, not actionable tasks.
    if (!parsed.text.trim()) continue;
    const task: Task = {
      id: stableTaskId(path, parsed.anchor, i, line), anchor: parsed.anchor,
      path, line: i, raw: line, text: parsed.text, done: parsed.done,
      group: isQuoteLine(line) ? calloutGroup : undefined,
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
function formatTaskLine(prefix: string, match: RegExpExecArray, done: boolean, text: string, anchor: string): string {
  return `${prefix}${match[1]}${match[2]}${match[3]}[${done ? "x" : " "}]${match[5]}${text.trim()} ^${anchor}`;
}
export function rewriteTaskLine(raw: string, done: boolean, text: string, id: string): string {
  const { prefix, body } = splitQuotePrefix(raw);
  const match = TASK_LINE.exec(body);
  if (!match) throw new Error(t("lineNotTask"));
  if (!text.trim() || /[\r\n]/.test(text)) throw new Error(t("taskMustOneLine"));
  // A caret-word already in the display text may stay, and removing one is allowed.
  // A new ^word or ^em- token would sit beside the anchor and drop it, so reject before writing.
  const display = parseTaskLine(raw)?.text ?? "";
  const kept = new Set(blockTokens(display).map(token => token.id));
  if (blockTokens(text).some(token => !kept.has(token.id))) throw new Error(t("differentBlockId"));
  const rawText = match[6];
  const tokens = blockTokens(rawText);
  const em = tokens.filter(token => token.em);
  const foreign = trailingForeign(rawText, tokens);
  if (em.length > 1) throw new Error(t("taskIdChanged"));
  if (em.length === 1) {
    if (em[0].id.toLowerCase() !== id.toLowerCase()) throw new Error(t("taskIdChanged"));
    return formatTaskLine(prefix, match, done, text, em[0].id.toLowerCase());
  }
  // A trailing foreign block id is the anchor. Do not append a second ^em- id beside it.
  if (foreign) return formatTaskLine(prefix, match, done, text, foreign.id);
  return formatTaskLine(prefix, match, done, text, id);
}
