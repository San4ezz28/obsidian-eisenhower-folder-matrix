/* Eisenhower Folder Matrix 0.2.0 – generated. Do not edit. */
const __modules = {
"src/core.ts": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FENCE = void 0;
exports.normalizeVaultPath = normalizeVaultPath;
exports.isPathInside = isPathInside;
exports.validSource = validSource;
exports.createMatrix = createMatrix;
exports.encodeMatrix = encodeMatrix;
exports.makeMatrixNote = makeMatrixNote;
exports.matrixHelpCallout = matrixHelpCallout;
exports.convertLegacyHelp = convertLegacyHelp;
exports.validateMatrix = validateMatrix;
exports.decodeMatrix = decodeMatrix;
exports.readMatrixBlocks = readMatrixBlocks;
exports.replaceMatrixBlock = replaceMatrixBlock;
exports.parseTaskLine = parseTaskLine;
exports.ephemeralId = ephemeralId;
exports.scanMarkdown = scanMarkdown;
exports.getTaskZone = getTaskZone;
exports.orderedTasks = orderedTasks;
exports.moveAssignment = moveAssignment;
exports.replaceLine = replaceLine;
exports.rewriteTaskLine = rewriteTaskLine;
const i18n_1 = require("./i18n");
const types_1 = require("./types");
exports.FENCE = "eisenhower-matrix";
const TASK_LINE = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)\[([ xX])\]([ \t]+)(.*)$/;
// Obsidian tasks may live inside callouts/Markdown blockquotes: > - [ ] and >     - [ ].
// Keep the exact quote prefix for round-trip source edits.
function splitQuotePrefix(line) {
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
function blockTokens(text) {
    const tokens = [];
    const re = new RegExp(BLOCK_TOKEN.source, "g");
    let match;
    while ((match = re.exec(text)) !== null) {
        const id = match[2];
        const em = EM_ANCHOR.test(id);
        if (!em && !FOREIGN_ANCHOR.test(id))
            continue;
        const start = match.index + match[0].length - match[1].length;
        tokens.push({ id, em, start, end: start + match[1].length });
    }
    return tokens;
}
function textWithoutToken(text, token) {
    const before = text.slice(0, token.start).replace(/[ \t]+$/, "");
    const after = text.slice(token.end).replace(/^[ \t]+/, "");
    return (before && after ? `${before} ${after}` : before || after).trim();
}
// Obsidian treats a block id as a reference only at the end of the line.
function trailingForeign(text, tokens) {
    const found = tokens.filter(token => !token.em && /^[ \t]*$/.test(text.slice(token.end)));
    return found.length === 1 ? found[0] : null;
}
function unknownKeys(value, known) {
    return Object.keys(value).filter(key => !known.includes(key)).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}
function assignUnknown(target, source, known) {
    const bag = source;
    for (const key of unknownKeys(source, known))
        target[key] = bag[key];
}
// `.` / `..` / empty segments are traversal. A leading dot hides vault metadata such as .obsidian.
// _fit and other scan exclusions are intentionally not rejected here.
function unsafeVaultPath(normalized) {
    const segments = normalized.split("/");
    if (segments.some(segment => segment === "" || segment === "." || segment === ".."))
        return true;
    return segments[0].startsWith(".");
}
function normalizeVaultPath(path) {
    return path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}
function isPathInside(path, folder, recursive) {
    const f = normalizeVaultPath(folder);
    const p = normalizeVaultPath(path);
    return Boolean(f) && p.startsWith(f + "/") && (recursive || !p.slice(f.length + 1).includes("/"));
}
function validSource(source) {
    const path = source?.path ? normalizeVaultPath(source.path) : "";
    if (!path || unsafeVaultPath(path))
        return false;
    return source.kind === "folder" || (source.kind === "file" && source.path.toLowerCase().endsWith(".md"));
}
function orderedSource(source, path, recursive) {
    const ordered = { kind: source.kind, path, recursive };
    assignUnknown(ordered, source, SOURCE_KEYS);
    return ordered;
}
function createMatrix(source, subtasks = "nested", inboxFile = "", language = "auto") {
    const normalized = { ...source, path: normalizeVaultPath(source.path) };
    if (!validSource(normalized))
        throw new Error((0, i18n_1.t)("invalidSource"));
    return {
        version: 1, id: (0, types_1.newId)(), source: normalized,
        inboxFile: normalizeVaultPath(inboxFile), subtasks, language, assignments: {}, order: (0, types_1.emptyOrder)()
    };
}
function encodeMatrix(matrix) {
    const ordered = {
        version: matrix.version, id: matrix.id,
        source: orderedSource(matrix.source, matrix.source.path, matrix.source.recursive),
        inboxFile: matrix.inboxFile, subtasks: matrix.subtasks, language: matrix.language,
        assignments: matrix.assignments, order: matrix.order
    };
    assignUnknown(ordered, matrix, MATRIX_KEYS);
    return JSON.stringify(ordered, null, 2);
}
function makeMatrixNote(matrix) {
    return `# ${(0, i18n_1.t)("matrixTitle", matrix.language)}\n\n${matrixHelpCallout(matrix.language)}\n\n\`\`\`${exports.FENCE}\n${encodeMatrix(matrix)}\n\`\`\`\n`;
}
/** A collapsed native Obsidian callout, never inserted inside the matrix JSON fence. */
function matrixHelpCallout(language = "auto") {
    return `> [!info]- ${(0, i18n_1.t)("calloutTitle", language)}\n> ${(0, i18n_1.t)("calloutBody", language)}`;
}
/** Opt-in migration: only replace the exact historic hint in a matrix note. */
function convertLegacyHelp(content) {
    if (!content.includes(`\`\`\`${exports.FENCE}`))
        return content;
    const blocks = readMatrixBlocks(content);
    if (!blocks.length)
        return content;
    const existing = /^> \[!info\]- (?:Как пользоваться матрицей|How to use the matrix)\s*$/m;
    if (existing.test(content))
        return content;
    const callout = matrixHelpCallout(blocks[0].matrix.language);
    const original = "> Открой заметку в режиме чтения (Reading view). Для изменения настроек нажми ⚙ в самой матрице.";
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    if (content.includes(original))
        return content.replace(original, callout.replace(/\n/g, eol));
    // No hint, e.g. a matrix created in v0.1.3: insert only on explicit command.
    const start = content.indexOf(`\`\`\`${exports.FENCE}`);
    const before = content.slice(0, start).replace(/(?:\r?\n)*$/, "");
    return before + eol + eol + callout.replace(/\n/g, eol) + eol + eol + content.slice(start);
}
function validateMatrix(value) {
    if (!value || typeof value !== "object")
        throw new Error((0, i18n_1.t)("jsonMissing"));
    const obj = value;
    if (obj.version !== 1 || typeof obj.id !== "string" || !/^em-[a-z0-9-]+$/i.test(obj.id))
        throw new Error((0, i18n_1.t)("invalidVersion"));
    if (!obj.source || !validSource(obj.source))
        throw new Error((0, i18n_1.t)("invalidSource"));
    if (!["nested", "separate", "hidden"].includes(String(obj.subtasks)))
        throw new Error((0, i18n_1.t)("invalidSubtasks"));
    if (obj.language !== undefined && !["auto", "ru", "en"].includes(String(obj.language)))
        throw new Error((0, i18n_1.t)("invalidLanguage"));
    if (!obj.assignments || typeof obj.assignments !== "object" || Array.isArray(obj.assignments))
        throw new Error((0, i18n_1.t)("invalidAssignments"));
    for (const v of Object.values(obj.assignments))
        if (!types_1.QUADRANTS.includes(v))
            throw new Error((0, i18n_1.t)("invalidQuadrant"));
    const order = (0, types_1.emptyOrder)();
    for (const zone of types_1.ZONES) {
        const seq = obj.order?.[zone];
        if (seq !== undefined && (!Array.isArray(seq) || seq.some(x => typeof x !== "string")))
            throw new Error((0, i18n_1.t)("invalidOrder"));
        order[zone] = seq ?? [];
    }
    const ordered = {
        version: 1, id: obj.id,
        source: orderedSource(obj.source, normalizeVaultPath(obj.source.path), Boolean(obj.source.recursive)),
        inboxFile: normalizeVaultPath(String(obj.inboxFile || "")),
        subtasks: obj.subtasks, language: obj.language ?? "auto", assignments: { ...obj.assignments }, order
    };
    assignUnknown(ordered, obj, MATRIX_KEYS);
    return ordered;
}
function decodeMatrix(text) {
    try {
        return validateMatrix(JSON.parse(text));
    }
    catch (e) {
        throw new Error((0, i18n_1.t)("configError", "auto", { error: e instanceof Error ? e.message : String(e) }));
    }
}
function readMatrixBlocks(content) {
    const found = [];
    for (const match of content.matchAll(new RegExp(MATRIX_FENCE.source, "g"))) {
        try {
            found.push({ matrix: decodeMatrix(match[3]), start: match.index, end: match.index + match[0].length });
        }
        catch { /* malformed blocks handled in UI; never overwrite them */ }
    }
    return found;
}
function replaceMatrixBlock(content, id, transform) {
    let matches = 0;
    // A note that already uses CRLF keeps CRLF inside the replaced JSON. Bytes outside the fence stay as they were.
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    const replaced = content.replace(new RegExp(MATRIX_FENCE.source, "g"), (full, first, startFence, data, endFence) => {
        const value = decodeMatrix(data); // refuse to write when any matrix block is malformed
        if (value.id !== id)
            return full;
        matches++;
        const next = validateMatrix(transform(value));
        if (next.id !== id)
            throw new Error((0, i18n_1.t)("immutableId"));
        const json = eol === "\n" ? encodeMatrix(next) : encodeMatrix(next).replace(/\n/g, eol);
        return first + startFence + json + endFence;
    });
    if (matches !== 1)
        throw new Error((0, i18n_1.t)("notUniqueMatrix"));
    return replaced;
}
function indentOf(whitespace) { return whitespace.replace(/\t/g, "    ").length; }
function parseTaskLine(line) {
    const { body } = splitQuotePrefix(line);
    const match = TASK_LINE.exec(body);
    if (!match)
        return null;
    const rawText = match[6];
    const tokens = blockTokens(rawText);
    const em = tokens.filter(token => token.em);
    const foreign = trailingForeign(rawText, tokens);
    // Exactly one ^em- is the anchor even beside a foreign token; only that em token leaves the display text.
    // Two or more ^em- tokens are ambiguous, so the raw text stays intact and there is no anchor.
    let text = rawText.trim();
    let anchor = null;
    if (em.length === 1) {
        anchor = em[0].id.toLowerCase();
        text = textWithoutToken(rawText, em[0]);
    }
    else if (em.length === 0 && foreign) {
        anchor = foreign.id;
        text = textWithoutToken(rawText, foreign);
    }
    return {
        text, done: match[4].toLowerCase() === "x",
        indent: indentOf(match[1]), anchor
    };
}
function stableTaskId(path, anchor, line, raw) {
    if (!anchor)
        return ephemeralId(path, line, raw);
    // ^em- ids are unique across the vault. A foreign block id is unique only inside one file.
    if (EM_ANCHOR.test(anchor))
        return anchor;
    return `${path}#^${anchor}`;
}
function ephemeralId(path, line, raw) {
    // Coordinates only identify unclassified tasks until a stable block ID is assigned.
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++)
        hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
    return `u:${encodeURIComponent(path)}:${line}:${(hash >>> 0).toString(36)}`;
}
function hasClosingFrontmatter(lines) {
    if (lines[0]?.trim() !== "---")
        return false;
    for (let i = 1; i < lines.length; i++)
        if (/^(---|\.\.\.)\s*$/.test(lines[i]))
            return true;
    return false;
}
function fenceMarker(body) {
    // Indent is unlimited: a fence nested in a list is often four or more spaces in.
    const marker = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(body);
    if (!marker)
        return null;
    return { char: marker[2][0], size: marker[2].length, rest: marker[3] };
}
function leadingIndent(line) {
    return indentOf(/^([ \t]*)/.exec(line)?.[1] ?? "");
}
function isQuoteLine(line) {
    return /^\s*>/.test(line);
}
// A real paragraph at column 0 ends the open list. Blank lines do not.
function breaksParentStack(line) {
    return line.trim() !== "" && !isQuoteLine(line) && leadingIndent(line) === 0;
}
function closingBacktick(line, open, size) {
    for (let j = open + size; j < line.length; j++) {
        if (line[j] !== "`")
            continue;
        let n = 0;
        while (j + n < line.length && line[j + n] === "`")
            n++;
        if (n === size)
            return j;
        j += n - 1;
    }
    return -1;
}
function maskPercentComments(line, inComment) {
    let visible = "";
    let i = 0;
    while (i < line.length) {
        // %% inside a matched inline code span is not a comment marker.
        if (!inComment && line[i] === "`") {
            let size = 1;
            while (i + size < line.length && line[i + size] === "`")
                size++;
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
        if (!inComment)
            visible += line[i];
        i++;
    }
    return { visible, inComment };
}
function scanMarkdown(content, path) {
    const lines = content.split(/\r?\n/);
    const tasks = [];
    const parents = [];
    let fence = null;
    // A leading --- is frontmatter only when a closing --- or ... exists. Otherwise it is a rule.
    let frontmatter = hasClosingFrontmatter(lines);
    let htmlComment = false;
    let percentComment = false;
    let calloutGroup;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (frontmatter) {
            if (i !== 0 && /^(---|\.\.\.)\s*$/.test(line))
                frontmatter = false;
            continue;
        }
        const { body } = splitQuotePrefix(line);
        if (fence) {
            const marker = fenceMarker(body);
            if (marker && marker.char === fence.char && marker.size >= fence.size && !marker.rest.trim())
                fence = null;
            continue;
        }
        if (htmlComment) {
            if (line.includes("-->"))
                htmlComment = false;
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
        if (hidden)
            continue;
        const marker = fenceMarker(body);
        if (marker) {
            fence = { char: marker.char, size: marker.size };
            if (!isQuoteLine(line))
                calloutGroup = undefined;
            if (breaksParentStack(line))
                parents.length = 0;
            continue;
        }
        // Callout labels apply only inside that blockquote. A later plain line or heading drops the label.
        const callout = /^\s*\[![^\]]+\][+-]?\s*(.*)$/.exec(body);
        if (callout) {
            parents.length = 0;
            calloutGroup = callout[1].split(" · ")[0].trim() || undefined;
        }
        else if (/^\s*#{1,6}\s/.test(body)) {
            parents.length = 0;
            calloutGroup = undefined;
        }
        else if (!isQuoteLine(line)) {
            calloutGroup = undefined;
        }
        const parsed = parseTaskLine(line);
        if (!parsed) {
            if (breaksParentStack(line))
                parents.length = 0;
            continue;
        }
        while (parents.length && parents[parents.length - 1].indent >= parsed.indent)
            parents.pop();
        // Blank checkboxes in templates are placeholders, not actionable tasks.
        if (!parsed.text.trim())
            continue;
        const task = {
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
function getTaskZone(task, config) {
    const q = config.assignments[task.id];
    return q && types_1.QUADRANTS.includes(q) ? q : "inbox";
}
function orderedTasks(items, zone, config) {
    const sequence = config.order[zone] || [];
    const lookup = new Map(sequence.map((id, i) => [id, i]));
    return [...items].sort((a, b) => {
        const i = lookup.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const j = lookup.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return i - j || a.path.localeCompare(b.path) || a.line - b.line;
    });
}
function moveAssignment(state, id, to, before) {
    const next = validateMatrix(state);
    for (const zone of types_1.ZONES)
        next.order[zone] = next.order[zone].filter(x => x !== id);
    if (to === "inbox")
        delete next.assignments[id];
    else
        next.assignments[id] = to;
    const index = before ? next.order[to].indexOf(before) : -1;
    if (index < 0)
        next.order[to].push(id);
    else
        next.order[to].splice(index, 0, id);
    return next;
}
// Replace only the target physical line; preserve other text and original EOL bytes.
function replaceLine(data, line, replacement) {
    const matches = [...data.matchAll(/[^\r\n]*(?:\r?\n|$)/g)].filter(m => m[0].length || m.index < data.length);
    if (line < 0 || line >= matches.length)
        throw new Error((0, i18n_1.t)("lineMissing"));
    const m = matches[line];
    const end = m[0].endsWith("\r\n") ? "\r\n" : m[0].endsWith("\n") ? "\n" : "";
    const next = replacement === null ? "" : replacement + end;
    return data.slice(0, m.index) + next + data.slice(m.index + m[0].length);
}
function formatTaskLine(prefix, match, done, text, anchor) {
    return `${prefix}${match[1]}${match[2]}${match[3]}[${done ? "x" : " "}]${match[5]}${text.trim()} ^${anchor}`;
}
function rewriteTaskLine(raw, done, text, id) {
    const { prefix, body } = splitQuotePrefix(raw);
    const match = TASK_LINE.exec(body);
    if (!match)
        throw new Error((0, i18n_1.t)("lineNotTask"));
    if (!text.trim() || /[\r\n]/.test(text))
        throw new Error((0, i18n_1.t)("taskMustOneLine"));
    // A caret-word already in the display text may stay, and removing one is allowed.
    // A new ^word or ^em- token would sit beside the anchor and drop it, so reject before writing.
    const display = parseTaskLine(raw)?.text ?? "";
    const kept = new Set(blockTokens(display).map(token => token.id));
    if (blockTokens(text).some(token => !kept.has(token.id)))
        throw new Error((0, i18n_1.t)("differentBlockId"));
    const rawText = match[6];
    const tokens = blockTokens(rawText);
    const em = tokens.filter(token => token.em);
    const foreign = trailingForeign(rawText, tokens);
    if (em.length > 1)
        throw new Error((0, i18n_1.t)("taskIdChanged"));
    if (em.length === 1) {
        if (em[0].id.toLowerCase() !== id.toLowerCase())
            throw new Error((0, i18n_1.t)("taskIdChanged"));
        return formatTaskLine(prefix, match, done, text, em[0].id.toLowerCase());
    }
    // A trailing foreign block id is the anchor. Do not append a second ^em- id beside it.
    if (foreign)
        return formatTaskLine(prefix, match, done, text, foreign.id);
    return formatTaskLine(prefix, match, done, text, id);
}

},
"src/i18n.ts": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RU = exports.EN = void 0;
exports.getLocale = getLocale;
exports.t = t;
/** Offline, bundled RU/EN translations. The chosen Obsidian language is provided by getLanguage(). */
const obsidian_1 = require("obsidian");
exports.EN = {
    matrixTitle: "Eisenhower Matrix",
    createMatrix: "Create Eisenhower matrix",
    matrixCreated: "Matrix created. You can move it like any other Markdown note.",
    matrixLoadError: "Couldn't load the matrix",
    matrixError: "Matrix error: {error}",
    retry: "Retry",
    editSource: "Edit source",
    renamePathError: "Couldn't update matrix path: {error}",
    renamePartial: "Couldn't update every matrix path after the rename: {error}",
    sourceNotFound: "Source note not found.",
    configNotLoaded: "Matrix hasn't loaded yet.",
    duplicateId: "Duplicate block ID found. Fix duplicates in the source notes first.",
    duplicatesWarning: "⚠ Duplicate block IDs detected. Editing these cards is disabled until the IDs are fixed.",
    attachTaskError: "Couldn't link task to its source line: {error}",
    writeQuadrantError: "Couldn't save the quadrant to the matrix note: {error}",
    sourceOutOfScope: "The file must be inside the selected source folder.",
    newTask: "New task",
    editTask: "Edit task",
    settings: "Settings",
    addTask: "+ Task",
    addTo: "Add to {zone}",
    dragToZone: "Drag a task here or add a new one",
    moveTo: "Move → {zone}",
    editText: "Edit text",
    openSource: "Open source note",
    deleteTask: "Delete task",
    dragCard: "Drag card",
    markOpen: "Mark as not completed",
    markDone: "Mark as completed",
    actions: "Task actions",
    sourceLine: "{path} · line {line}",
    completed: "Completed ({count})",
    noCompleted: "No completed tasks yet",
    do: "I. Urgent & important",
    schedule: "II. Important, not urgent",
    delegate: "III. Urgent, not important",
    eliminate: "IV. Neither urgent nor important",
    inbox: "Inbox",
    shortDo: "🔴 Urgent & important",
    shortSchedule: "🔵 Important",
    shortDelegate: "🟡 Urgent",
    shortEliminate: "⚪ Other",
    matrixSettings: "Matrix settings",
    newMatrix: "New Eisenhower matrix",
    matrixFile: "Matrix note",
    matrixFileDesc: "Vault-relative path. You can move the matrix later.",
    matrixFilePlaceholder: "Eisenhower Matrix.md",
    sourceType: "Task source",
    folder: "Folder",
    file: "One Markdown file",
    sourcePath: "Source path",
    sourceDesc: "Choose an existing folder or Markdown note, or enter a path.",
    choose: "Choose…",
    findFolder: "Find a folder…",
    findFile: "Find a Markdown note…",
    chooseFolder: "Choose a folder…",
    chooseFile: "Choose a Markdown note…",
    recursive: "Include subfolders",
    recursiveDesc: "Only applies when the source is a folder.",
    subtasks: "Show subtasks",
    nested: "Nested inside their parent",
    separate: "As separate cards",
    hidden: "Hide (except in Completed)",
    language: "Interface language",
    languageDesc: "Auto uses Obsidian's interface language. Changes take effect after saving.",
    auto: "Auto (Obsidian language)",
    english: "English",
    russian: "Русский",
    newTaskFile: "File for new tasks (optional)",
    newTaskFileDesc: "If omitted, choose a file when adding a task. No new note is created automatically.",
    noFile: "Not selected",
    clearFile: "Clear file selection",
    selectFolderFirst: "Choose an existing source folder first.",
    save: "Save",
    cancel: "Cancel",
    noFolders: "No folders found in this vault.",
    noMarkdown: "No matching Markdown notes found.",
    sourceFolderRequired: "Choose an existing folder using Choose…",
    sourceFileRequired: "Choose an existing Markdown file using Choose…",
    targetOutsideSource: "The new-task file must be an existing Markdown note in the selected folder.",
    taskText: "Task text",
    taskZone: "Quadrant",
    taskFile: "Save task in",
    taskFileDesc: "Choose an existing Markdown note in the source folder. No new note is created automatically.",
    emptyTask: "Task text cannot be empty.",
    selectTaskFile: "Choose an existing Markdown file in the source folder.",
    deleteConfirm: "Delete task?",
    deleteDescription: "The line “{text}” will be removed from its source note. Nested lines won't be deleted.",
    deleteLine: "Delete line",
    jsonMissing: "The matrix block must contain a JSON object.",
    invalidVersion: "Invalid matrix version or ID.",
    invalidSource: "Invalid task source.",
    invalidSubtasks: "Unknown subtask display mode.",
    invalidLanguage: "Unknown interface language.",
    invalidAssignments: "Invalid task assignment data.",
    invalidQuadrant: "Invalid task quadrant.",
    invalidOrder: "Invalid task order.",
    configError: "Configuration error: {error}",
    immutableId: "Changing the matrix ID is not allowed.",
    notUniqueMatrix: "Could not uniquely identify the matrix in this note. No changes were made.",
    lineMissing: "The source line no longer exists.",
    lineNotTask: "The source line is no longer a Markdown task.",
    taskMustOneLine: "Task text must be one non-empty line.",
    taskIdChanged: "Task ID changed. Save was cancelled.",
    differentBlockId: "This task already has another Obsidian block ID. It was not changed to protect links.",
    matrixMustMd: "The matrix filename must end with .md.",
    matrixExists: "The matrix note already exists.",
    matrixMissing: "The matrix note was not found. It may have been deleted.",
    matrixDuplicate: "Multiple matrices share the same ID. Rename or create a distinct matrix.",
    matrixCorrupt: "Matrix configuration is missing or corrupted. Check its JSON block.",
    matrixDamaged: "The matrix note is damaged (broken JSON or a sync conflict) and was not changed.",
    sourcePathInvalid: "Enter a valid task source path.",
    fileMissing: "File not found: {path}",
    folderMissing: "Folder not found: {path}",
    taskSourceMissing: "Source file unavailable: {path}",
    taskChanged: "The task has changed or matches multiple lines. Refresh and try again.",
    taskIdMismatch: "Task ID mismatch.",
    singleLineTask: "Write the task text on one line.",
    blockTokenInText: "The task text contains a block ID ({token}) and was not added.",
    taskNotVisibleAfterAdd: "The new task would be hidden inside an unclosed code block or comment, so it was not added.",
    selectExistingTaskFile: "Choose an existing Markdown note for the new task.",
    taskFileOutside: "The task file must be inside the selected source folder.",
    existingFileMissing: "Choose an existing Markdown note: {path}",
    cantCreateFolder: "Cannot create folder: {path}",
    calloutTitle: "How to use the matrix",
    calloutBody: "Open this note in **Reading view** to interact with tasks. Use the ⚙ **Settings** button inside the matrix to change the source and display preferences.",
    updateHelp: "Add or update the matrix tip callout",
    updatedHelp: "The matrix has a collapsible help callout now.",
    nothingToUpdate: "No legacy matrix tip was found in the active note.",
    openMatrixNoteFirst: "Open a matrix Markdown note first.",
    errorSavingHelp: "Couldn't update matrix tip: {error}"
};
exports.RU = {
    matrixTitle: "Матрица Эйзенхауэра",
    createMatrix: "Создать матрицу Эйзенхауэра",
    matrixCreated: "Матрица создана. Её можно перемещать как обычную Markdown-заметку.",
    matrixLoadError: "Матрица не загрузилась",
    matrixError: "Ошибка матрицы: {error}",
    retry: "Повторить",
    editSource: "Изменить источник",
    renamePathError: "Не удалось обновить путь матрицы: {error}",
    renamePartial: "Не удалось обновить пути всех матриц после переименования: {error}",
    sourceNotFound: "Исходный файл не найден.",
    configNotLoaded: "Матрица пока не загружена.",
    duplicateId: "Найден повторяющийся block ID. Сначала исправь дубликаты в исходных заметках.",
    duplicatesWarning: "⚠ Есть повторяющиеся block ID. Редактирование таких карточек отключено до исправления дублей.",
    attachTaskError: "Не удалось привязать задачу к исходной строке: {error}",
    writeQuadrantError: "Не удалось записать квадрант в файл матрицы: {error}",
    sourceOutOfScope: "Файл должен находиться в области сканирования выбранной папки.",
    newTask: "Новая задача",
    editTask: "Изменить задачу",
    settings: "Настройки",
    addTask: "+ Задача",
    addTo: "Добавить в {zone}",
    dragToZone: "Перетащи задачу сюда или добавь новую",
    moveTo: "Переместить → {zone}",
    editText: "Изменить текст",
    openSource: "Открыть исходную заметку",
    deleteTask: "Удалить задачу",
    dragCard: "Перетащить карточку",
    markOpen: "Отметить невыполненной",
    markDone: "Отметить выполненной",
    actions: "Действия с задачей",
    sourceLine: "{path} · строка {line}",
    completed: "Сделанное ({count})",
    noCompleted: "Пока нет выполненных задач",
    do: "I. Срочно и важно",
    schedule: "II. Важно, не срочно",
    delegate: "III. Срочно, не важно",
    eliminate: "IV. Не срочно и не важно",
    inbox: "Входящие",
    shortDo: "🔴 Срочно/важно",
    shortSchedule: "🔵 Важно",
    shortDelegate: "🟡 Срочно",
    shortEliminate: "⚪ Остальное",
    matrixSettings: "Настройки матрицы",
    newMatrix: "Новая матрица Эйзенхауэра",
    matrixFile: "Файл матрицы",
    matrixFileDesc: "Относительный путь внутри vault. Матрицу можно будет перемещать.",
    matrixFilePlaceholder: "Матрица Эйзенхауэра.md",
    sourceType: "Источник задач",
    folder: "Папка",
    file: "Один Markdown-файл",
    sourcePath: "Путь к источнику",
    sourceDesc: "Выберите существующую папку или Markdown-файл. Можно также ввести путь вручную.",
    choose: "Выбрать…",
    findFolder: "Найти папку в хранилище…",
    findFile: "Найти Markdown-файл…",
    chooseFolder: "Выберите папку…",
    chooseFile: "Выберите Markdown-файл…",
    recursive: "Включая подпапки",
    recursiveDesc: "Только для источника «Папка».",
    subtasks: "Отображение подзадач",
    nested: "Внутри родительской задачи",
    separate: "Отдельными карточками",
    hidden: "Не показывать (кроме «Сделанного»)",
    language: "Язык интерфейса",
    languageDesc: "Автоматически — язык Obsidian. Изменения вступят в силу после сохранения.",
    auto: "Автоматически (язык Obsidian)",
    english: "English",
    russian: "Русский",
    newTaskFile: "Файл для новых задач (необязательно)",
    newTaskFileDesc: "Если не выбран, файл будет запрашиваться при добавлении задачи. Новые файлы автоматически не создаются.",
    noFile: "Не выбран",
    clearFile: "Очистить выбор файла",
    selectFolderFirst: "Сначала выберите существующую папку-источник.",
    save: "Сохранить",
    cancel: "Отмена",
    noFolders: "В хранилище пока нет папок.",
    noMarkdown: "Подходящих Markdown-файлов не найдено.",
    sourceFolderRequired: "Выберите существующую папку через кнопку «Выбрать…».",
    sourceFileRequired: "Выберите существующий Markdown-файл через кнопку «Выбрать…».",
    targetOutsideSource: "Файл для новых задач должен существовать внутри выбранной папки.",
    taskText: "Текст задачи",
    taskZone: "Сектор",
    taskFile: "В какой файл записать",
    taskFileDesc: "Выберите существующий Markdown-файл в пределах источника. Новый файл не создаётся автоматически.",
    emptyTask: "Текст задачи пуст.",
    selectTaskFile: "Выберите существующий Markdown-файл внутри выбранной папки.",
    deleteConfirm: "Удалить задачу?",
    deleteDescription: "Будет удалена строка «{text}» из исходной заметки. Вложенные строки не удаляются.",
    deleteLine: "Удалить строку",
    jsonMissing: "В блоке матрицы отсутствует объект JSON.",
    invalidVersion: "Неверная версия или ID матрицы.",
    invalidSource: "Некорректно указан источник задач.",
    invalidSubtasks: "Неизвестный способ показа подзадач.",
    invalidLanguage: "Неизвестный язык интерфейса.",
    invalidAssignments: "Неверный формат распределения задач.",
    invalidQuadrant: "Некорректный сектор задачи.",
    invalidOrder: "Повреждён порядок задач.",
    configError: "Ошибка конфигурации: {error}",
    immutableId: "Запрещено изменять ID матрицы.",
    notUniqueMatrix: "Не удалось однозначно найти матрицу в заметке. Файл не изменён.",
    lineMissing: "Строка больше не существует.",
    lineNotTask: "Строка перестала быть Markdown-задачей.",
    taskMustOneLine: "Текст задачи должен занимать одну непустую строку.",
    taskIdChanged: "ID задачи изменился. Запись отменена.",
    differentBlockId: "У этой задачи уже есть другой Obsidian block ID. Не меняем его автоматически, чтобы не сломать ссылки.",
    matrixMustMd: "Имя матрицы должно заканчиваться на .md.",
    matrixExists: "Файл матрицы уже существует.",
    matrixMissing: "Файл матрицы не найден. Возможно, его удалили.",
    matrixDuplicate: "В vault несколько матриц с одинаковым ID. Переименуй или создай отдельную матрицу.",
    matrixCorrupt: "Конфигурация матрицы отсутствует или повреждена. Проверь JSON в заметке.",
    matrixDamaged: "Заметка матрицы повреждена (битый JSON или конфликт синхронизации) и не была изменена.",
    sourcePathInvalid: "Укажи корректный путь к источнику.",
    fileMissing: "Файл не найден: {path}",
    folderMissing: "Папка не найдена: {path}",
    taskSourceMissing: "Исходный файл недоступен: {path}",
    taskChanged: "Задача изменилась или встречается несколько раз. Обнови матрицу и повтори действие.",
    taskIdMismatch: "ID задачи не совпадает.",
    singleLineTask: "Напиши текст задачи в одну строку.",
    blockTokenInText: "Текст задачи содержит block ID ({token}), поэтому она не добавлена.",
    taskNotVisibleAfterAdd: "Новая задача оказалась бы внутри незакрытого блока кода или комментария, поэтому она не добавлена.",
    selectExistingTaskFile: "Выберите существующий Markdown-файл для сохранения задачи.",
    taskFileOutside: "Файл для задачи должен находиться внутри выбранной папки.",
    existingFileMissing: "Выберите существующий Markdown-файл: {path}",
    cantCreateFolder: "Невозможно создать папку: {path}",
    calloutTitle: "Как пользоваться матрицей",
    calloutBody: "Открой заметку в **режиме чтения (Reading view)**, чтобы управлять задачами. Для изменения источника и отображения нажми ⚙ **Настройки** внутри матрицы.",
    updateHelp: "Добавить или обновить callout-подсказку матрицы",
    updatedHelp: "Добавлена сворачиваемая подсказка для матрицы.",
    nothingToUpdate: "Старая подсказка матрицы в активной заметке не найдена.",
    openMatrixNoteFirst: "Сначала открой Markdown-заметку с матрицей.",
    errorSavingHelp: "Не удалось обновить подсказку матрицы: {error}"
};
function getLocale(setting = "auto") {
    if (setting === "ru" || setting === "en")
        return setting;
    // Official Obsidian API (available since Obsidian 1.8.7).
    const fromObsidian = typeof obsidian_1.getLanguage === "function" ? (0, obsidian_1.getLanguage)() : "en";
    return (typeof fromObsidian === "string" ? fromObsidian : "en").toLowerCase().split(/[-_]/)[0] === "ru" ? "ru" : "en";
}
function t(key, setting = "auto", params = {}) {
    const template = (getLocale(setting) === "ru" ? exports.RU : exports.EN)[key] || exports.EN[key];
    return template.replace(/\{(\w+)\}/g, (whole, k) => params[k] === undefined ? whole : String(params[k]));
}

},
"src/main.ts": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const core_1 = require("./core");
const i18n_1 = require("./i18n");
const modals_1 = require("./modals");
const store_1 = require("./store");
const view_1 = require("./view");
class EisenhowerPlugin extends obsidian_1.Plugin {
    onload() {
        this.store = new store_1.MatrixStore(this.app);
        this.registerMarkdownCodeBlockProcessor("eisenhower-matrix", (source, el, ctx) => {
            try {
                const config = (0, core_1.decodeMatrix)(source);
                const child = new view_1.MatrixView(this, el, config.id, ctx.sourcePath);
                ctx.addChild(child);
            }
            catch (error) {
                el.createDiv({ cls: "em-error", text: (0, i18n_1.t)("matrixError", "auto", { error: error instanceof Error ? error.message : String(error) }) });
            }
        });
        this.addCommand({
            id: "create-matrix-note", name: (0, i18n_1.t)("createMatrix"),
            callback: () => this.openCreateModal()
        });
        this.addRibbonIcon("layout-grid", (0, i18n_1.t)("createMatrix"), () => this.openCreateModal());
        this.addCommand({
            id: "convert-legacy-matrix-help", name: (0, i18n_1.t)("updateHelp"),
            callback: () => void this.updateLegacyHelp()
        });
        // Keep source paths valid after a rename performed *within* Obsidian.
        this.app.workspace.onLayoutReady(() => {
            this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
                void this.store.rewritePathsAfterRename(file, oldPath).catch(error => {
                    new obsidian_1.Notice((0, i18n_1.t)("renamePathError", "auto", { error: String(error) }), 8000);
                });
            }));
        });
    }
    openCreateModal() {
        new modals_1.MatrixFormModal(this.app, null, async (config, path) => {
            // Require a real source before creating a matrix to avoid a broken first-run note.
            await this.store.sourceFiles(config.source);
            const f = await this.store.createMatrix(path, config);
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(f);
            if (leaf.view instanceof obsidian_1.MarkdownView)
                await leaf.setViewState({ type: "markdown", state: { file: f.path, mode: "preview" } });
            new obsidian_1.Notice((0, i18n_1.t)("matrixCreated", config.language));
        }).open();
    }
    async updateLegacyHelp() {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") {
            new obsidian_1.Notice((0, i18n_1.t)("openMatrixNoteFirst"));
            return;
        }
        try {
            let changed = false;
            await this.app.vault.process(file, current => {
                const updated = (0, core_1.convertLegacyHelp)(current);
                changed = updated !== current;
                return updated;
            });
            new obsidian_1.Notice((0, i18n_1.t)(changed ? "updatedHelp" : "nothingToUpdate"));
        }
        catch (error) {
            new obsidian_1.Notice((0, i18n_1.t)("errorSavingHelp", "auto", { error: String(error) }), 8000);
        }
    }
    async openTask(task) {
        const source = this.app.vault.getAbstractFileByPath(task.path);
        if (!(source instanceof obsidian_1.TFile))
            throw new Error((0, i18n_1.t)("sourceNotFound"));
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.openFile(source);
        if (leaf.view instanceof obsidian_1.MarkdownView) {
            const editor = leaf.view.editor;
            const range = editor.lineCount();
            editor.setCursor(Math.min(task.line, Math.max(range - 1, 0)), 0);
            editor.scrollIntoView({ from: { line: Math.min(task.line, range - 1), ch: 0 }, to: { line: Math.min(task.line, range - 1), ch: 0 } }, true);
        }
    }
}
exports.default = EisenhowerPlugin;

},
"src/modals.ts": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfirmDeleteModal = exports.TaskInputModal = exports.MatrixFormModal = void 0;
const obsidian_1 = require("obsidian");
const core_1 = require("./core");
const i18n_1 = require("./i18n");
const types_1 = require("./types");
function showError(error) {
    new obsidian_1.Notice(error instanceof Error ? error.message : String(error), 7000);
}
/** A mobile-compatible native Obsidian picker, restricted to existing vault entries. */
class VaultPathPicker extends obsidian_1.FuzzySuggestModal {
    constructor(app, kind, onPick, allowFile, language = "auto") {
        super(app);
        this.kind = kind;
        this.onPick = onPick;
        this.allowFile = allowFile;
        this.language = language;
        this.setPlaceholder((0, i18n_1.t)(kind === "folder" ? "findFolder" : "findFile", this.language));
    }
    getItems() {
        if (this.kind === "folder") {
            return this.app.vault.getAllLoadedFiles()
                .filter((f) => f instanceof obsidian_1.TFolder && Boolean(f.path) && f.path !== "/")
                .sort((a, b) => a.path.localeCompare(b.path));
        }
        return this.app.vault.getMarkdownFiles()
            .filter(f => !this.allowFile || this.allowFile(f))
            .sort((a, b) => a.path.localeCompare(b.path));
    }
    getItemText(item) { return item.path; }
    onChooseItem(item, _evt) { this.onPick(item); }
}
function openPicker(app, kind, onPick, filter, language = "auto") {
    const picker = new VaultPathPicker(app, kind, onPick, filter, language);
    if (!picker.getItems().length) {
        new obsidian_1.Notice((0, i18n_1.t)(kind === "folder" ? "noFolders" : "noMarkdown", language));
        return;
    }
    picker.open();
}
class MatrixFormModal extends obsidian_1.Modal {
    constructor(app, existing, onSubmit) {
        super(app);
        this.existing = existing;
        this.onSubmit = onSubmit;
    }
    onOpen() {
        const { contentEl } = this;
        const originalLang = this.existing?.language || "auto";
        const tr = (key) => (0, i18n_1.t)(key, originalLang);
        contentEl.empty();
        contentEl.createEl("h2", { text: this.existing ? tr("matrixSettings") : tr("newMatrix") });
        let type = this.existing?.source.kind || "folder";
        let path = this.existing?.source.path || "";
        let recursive = this.existing?.source.recursive ?? true;
        let subtasks = this.existing?.subtasks || "nested";
        let lang = originalLang;
        let taskFile = this.existing?.inboxFile || "";
        let filename = tr("matrixFilePlaceholder");
        let sourceInput;
        let taskFileInput;
        if (!this.existing)
            new obsidian_1.Setting(contentEl).setName(tr("matrixFile"))
                .setDesc(tr("matrixFileDesc"))
                .addText(t => t.setPlaceholder(tr("matrixFilePlaceholder"))
                .setValue(filename).onChange(v => { filename = v; }));
        const sourceRow = new obsidian_1.Setting(contentEl).setName(tr("sourceType"));
        sourceRow.addDropdown(d => d
            .addOption("folder", tr("folder"))
            .addOption("file", tr("file"))
            .setValue(type).onChange(v => {
            type = v;
            // A path selected for another source type must never be reused silently.
            path = "";
            sourceInput.setValue("");
            updateSourceRows();
        }));
        new obsidian_1.Setting(contentEl).setName(tr("sourcePath"))
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
                if (type === "folder" && taskFile && !(0, core_1.isPathInside)(taskFile, path, recursive)) {
                    taskFile = "";
                    taskFileInput.setValue("");
                }
                updateSourceRows();
            }, undefined, originalLang);
        }));
        const recursiveRow = new obsidian_1.Setting(contentEl).setName(tr("recursive"))
            .setDesc(tr("recursiveDesc"))
            .addToggle(t => t.setValue(recursive).onChange(v => { recursive = v; }));
        new obsidian_1.Setting(contentEl).setName(tr("subtasks")).addDropdown(d => d
            .addOption("nested", tr("nested"))
            .addOption("separate", tr("separate"))
            .addOption("hidden", tr("hidden"))
            .setValue(subtasks).onChange(v => { subtasks = v; }));
        new obsidian_1.Setting(contentEl).setName(tr("language")).setDesc(tr("languageDesc"))
            .addDropdown(d => d.addOption("auto", tr("auto"))
            .addOption("ru", tr("russian")).addOption("en", tr("english"))
            .setValue(lang).onChange(value => { lang = value; }));
        const taskFileRow = new obsidian_1.Setting(contentEl).setName(tr("newTaskFile"))
            .setDesc(tr("newTaskFileDesc"))
            .addText(t => {
            taskFileInput = t;
            t.setPlaceholder(tr("noFile")).setValue(taskFile).onChange(v => { taskFile = v; });
        })
            .addButton(b => b.setButtonText(tr("choose")).onClick(() => {
            const folderPath = (0, core_1.normalizeVaultPath)(path);
            const f = this.app.vault.getAbstractFileByPath(folderPath);
            if (!(f instanceof obsidian_1.TFolder)) {
                showError(new Error(tr("selectFolderFirst")));
                return;
            }
            openPicker(this.app, "file", selected => {
                taskFile = selected.path;
                taskFileInput.setValue(taskFile);
            }, candidate => (0, core_1.isPathInside)(candidate.path, folderPath, recursive), originalLang);
        }))
            .addExtraButton(b => b.setIcon("x").setTooltip(tr("clearFile"))
            .onClick(() => { taskFile = ""; taskFileInput.setValue(""); }));
        const updateSourceRows = () => {
            const folderMode = type === "folder";
            recursiveRow.settingEl.toggleClass("em-setting-hidden", !folderMode);
            taskFileRow.settingEl.toggleClass("em-setting-hidden", !folderMode);
            sourceInput.setPlaceholder(folderMode ? tr("chooseFolder") : tr("chooseFile"));
        };
        updateSourceRows();
        new obsidian_1.Setting(contentEl).addButton(b => b.setButtonText(tr("save")).setCta().onClick(async () => {
            try {
                const cleanPath = (0, core_1.normalizeVaultPath)(path);
                const selected = this.app.vault.getAbstractFileByPath(cleanPath);
                if (!cleanPath || (type === "folder" ? !(selected instanceof obsidian_1.TFolder) : !(selected instanceof obsidian_1.TFile && selected.extension === "md"))) {
                    throw new Error(type === "folder"
                        ? tr("sourceFolderRequired")
                        : tr("sourceFileRequired"));
                }
                const source = { kind: type, path: cleanPath, recursive: type === "folder" ? recursive : false };
                const cleanTaskFile = type === "folder" ? (0, core_1.normalizeVaultPath)(taskFile) : "";
                if (cleanTaskFile) {
                    const target = this.app.vault.getAbstractFileByPath(cleanTaskFile);
                    if (!(target instanceof obsidian_1.TFile) || target.extension !== "md" ||
                        !(0, core_1.isPathInside)(target.path, source.path, source.recursive)) {
                        throw new Error(tr("targetOutsideSource"));
                    }
                }
                const next = this.existing
                    ? { ...this.existing, source, subtasks, language: lang, inboxFile: cleanTaskFile }
                    : (0, core_1.createMatrix)(source, subtasks, cleanTaskFile, lang);
                await this.onSubmit(next, (0, core_1.normalizeVaultPath)(filename));
                this.close();
            }
            catch (e) {
                showError(e);
            }
        })).addButton(b => b.setButtonText(tr("cancel")).onClick(() => this.close()));
    }
    onClose() { this.contentEl.empty(); }
}
exports.MatrixFormModal = MatrixFormModal;
class TaskInputModal extends obsidian_1.Modal {
    constructor(app, title, initialText, zone, suggestedFile, callback, source, language = "auto") {
        super(app);
        this.title = title;
        this.initialText = initialText;
        this.zone = zone;
        this.suggestedFile = suggestedFile;
        this.callback = callback;
        this.source = source;
        this.language = language;
    }
    onOpen() {
        const el = this.contentEl;
        const tr = (key) => (0, i18n_1.t)(key, this.language);
        el.empty();
        el.createEl("h2", { text: this.title });
        let text = this.initialText;
        let zone = this.zone;
        let path = this.suggestedFile || "";
        let fileInput = null;
        new obsidian_1.Setting(el).setName(tr("taskText"))
            .addText(t => t.setValue(text).onChange(v => { text = v; }).inputEl.focus());
        if (zone !== null)
            new obsidian_1.Setting(el).setName(tr("taskZone")).addDropdown(d => {
                for (const z of types_1.ZONES)
                    d.addOption(z, (0, i18n_1.t)(z, this.language));
                d.setValue(zone).onChange(v => { zone = v; });
            });
        if (this.suggestedFile !== null)
            new obsidian_1.Setting(el).setName(tr("taskFile"))
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
                    (0, core_1.isPathInside)(file.path, this.source.path, this.source.recursive)), this.language);
            })).setClass("em-new-task-file");
        new obsidian_1.Setting(el).addButton(b => b.setButtonText(tr("save")).setCta().onClick(async () => {
            try {
                if (!text.trim())
                    throw new Error(tr("emptyTask"));
                const target = this.suggestedFile === null ? null : (0, core_1.normalizeVaultPath)(path);
                if (this.suggestedFile !== null) {
                    const file = this.app.vault.getAbstractFileByPath(target);
                    if (!(file instanceof obsidian_1.TFile) || file.extension !== "md" ||
                        (this.source?.kind === "folder" && !(0, core_1.isPathInside)(file.path, this.source.path, this.source.recursive))) {
                        throw new Error(tr("selectTaskFile"));
                    }
                }
                await this.callback(text, zone, target);
                this.close();
            }
            catch (e) {
                showError(e);
            }
        })).addButton(b => b.setButtonText(tr("cancel")).onClick(() => this.close()));
    }
    onClose() { this.contentEl.empty(); }
}
exports.TaskInputModal = TaskInputModal;
class ConfirmDeleteModal extends obsidian_1.Modal {
    constructor(app, taskText, onConfirm, language = "auto", childCount = 0) {
        super(app);
        this.taskText = taskText;
        this.onConfirm = onConfirm;
        this.language = language;
        this.childCount = childCount;
    }
    onOpen() {
        this.contentEl.empty();
        const tr = (key) => (0, i18n_1.t)(key, this.language);
        this.contentEl.createEl("h2", { text: tr("deleteConfirm") });
        const text = this.childCount > 0 ? `${this.taskText} [${this.childCount}]` : this.taskText;
        this.contentEl.createEl("p", { text: (0, i18n_1.t)("deleteDescription", this.language, { text }) });
        if (this.childCount > 0)
            this.contentEl.setAttribute("data-child-count", String(this.childCount));
        new obsidian_1.Setting(this.contentEl).addButton(b => b.setButtonText(tr("deleteLine")).setWarning().onClick(async () => {
            try {
                await this.onConfirm();
                this.close();
            }
            catch (e) {
                showError(e);
            }
        })).addButton(b => b.setButtonText(tr("cancel")).onClick(() => this.close()));
    }
    onClose() { this.contentEl.empty(); }
}
exports.ConfirmDeleteModal = ConfirmDeleteModal;

},
"src/store.ts": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatrixStore = void 0;
const obsidian_1 = require("obsidian");
const types_1 = require("./types");
const i18n_1 = require("./i18n");
const core_1 = require("./core");
// Parser anchors: a ^em- id, or any other ^word of 4–64 id characters (65–67 only if it is an em- id).
const BLOCK_TOKEN = /(?:^|[ \t])(\^([A-Za-z0-9-]{4,67}))(?=[ \t]|$)/g;
const EM_ANCHOR = /^em-[a-z0-9-]{8,64}$/i;
const FOREIGN_ANCHOR = /^[A-Za-z0-9-]{4,64}$/;
function findBlockToken(text) {
    const re = new RegExp(BLOCK_TOKEN.source, "g");
    let match;
    while ((match = re.exec(text)) !== null) {
        const id = match[2];
        if (EM_ANCHOR.test(id) || FOREIGN_ANCHOR.test(id))
            return match[1];
    }
    return null;
}
// True only for segments under the source root. The source folder itself may be _fit or a dotfolder.
function excludedBelowSource(filePath, sourcePath) {
    const file = (0, core_1.normalizeVaultPath)(filePath);
    const root = (0, core_1.normalizeVaultPath)(sourcePath);
    if (!root || file === root || !file.startsWith(root + "/"))
        return false;
    return file.slice(root.length + 1).split("/").some(segment => segment.toLowerCase() === "_fit" || segment.startsWith("."));
}
class MatrixStore {
    constructor(app) {
        this.app = app;
    }
    async createMatrix(path, matrix) {
        const clean = (0, core_1.normalizeVaultPath)(path);
        if (!clean.endsWith(".md"))
            throw new Error((0, i18n_1.t)("matrixMustMd"));
        if (this.app.vault.getAbstractFileByPath(clean))
            throw new Error((0, i18n_1.t)("matrixExists"));
        await this.ensureFolder(clean);
        return this.app.vault.create(clean, (0, core_1.makeMatrixNote)(matrix));
    }
    async findMatrix(id, preferredPath) {
        const candidate = this.app.vault.getAbstractFileByPath(preferredPath);
        if (candidate instanceof obsidian_1.TFile && candidate.extension === "md") {
            const content = await this.app.vault.cachedRead(candidate);
            const decoded = (0, core_1.readMatrixBlocks)(content);
            if (decoded.some(b => b.matrix.id === id))
                return candidate;
            // Preferred note contains the fence, but this block does not decode
            // (broken JSON or conflict markers). Do not scan the vault or rewrite the file.
            if (this.damagedMatrixFence(content, decoded.length))
                throw new Error((0, i18n_1.t)("matrixDamaged"));
        }
        const found = [];
        for (const file of this.app.vault.getMarkdownFiles()) {
            if (file.path === preferredPath)
                continue;
            const body = await this.app.vault.cachedRead(file);
            if (!body.includes("```eisenhower-matrix"))
                continue;
            if ((0, core_1.readMatrixBlocks)(body).some(b => b.matrix.id === id))
                found.push(file);
            if (found.length > 1)
                break;
        }
        if (found.length !== 1)
            throw new Error(found.length === 0
                ? (0, i18n_1.t)("matrixMissing")
                : (0, i18n_1.t)("matrixDuplicate"));
        return found[0];
    }
    async loadMatrix(file, id) {
        const content = await this.app.vault.cachedRead(file);
        const decoded = (0, core_1.readMatrixBlocks)(content);
        const blocks = decoded.filter(b => b.matrix.id === id);
        if (blocks.length === 1)
            return blocks[0].matrix;
        // A fence that does not decode is damaged, not a generic missing/corrupt mix. Never write here.
        if (this.damagedMatrixFence(content, decoded.length))
            throw new Error((0, i18n_1.t)("matrixDamaged"));
        throw new Error((0, i18n_1.t)("matrixCorrupt"));
    }
    /** True when an eisenhower-matrix opener did not survive readMatrixBlocks (malformed JSON or a conflict). */
    damagedMatrixFence(content, decodedCount) {
        if (!content.includes("```eisenhower-matrix"))
            return false;
        let openings = 0;
        for (const line of content.split(/\r?\n/)) {
            if (/^```eisenhower-matrix[ \t]*$/.test(line))
                openings++;
        }
        return openings > decodedCount;
    }
    async updateMatrix(file, id, change) {
        await this.app.vault.process(file, current => (0, core_1.replaceMatrixBlock)(current, id, change));
    }
    async sourceFiles(source) {
        if (!(0, core_1.validSource)(source))
            throw new Error((0, i18n_1.t)("sourcePathInvalid"));
        if (source.kind === "file") {
            const f = this.app.vault.getAbstractFileByPath(source.path);
            if (!(f instanceof obsidian_1.TFile) || f.extension !== "md")
                throw new Error((0, i18n_1.t)("fileMissing", "auto", { path: source.path }));
            return [f];
        }
        const folder = this.app.vault.getAbstractFileByPath(source.path);
        if (!(folder instanceof obsidian_1.TFolder))
            throw new Error((0, i18n_1.t)("folderMissing", "auto", { path: source.path }));
        return this.app.vault.getMarkdownFiles().filter(f => {
            if (!(0, core_1.isPathInside)(f.path, source.path, source.recursive))
                return false;
            return !excludedBelowSource(f.path, source.path);
        });
    }
    async loadTasks(source) {
        const files = await this.sourceFiles(source);
        const batches = await Promise.all(files.map(async (f) => (0, core_1.scanMarkdown)(await this.app.vault.cachedRead(f), f.path)));
        return batches.flat();
    }
    async editTask(task, edit) {
        const f = this.app.vault.getAbstractFileByPath(task.path);
        if (!(f instanceof obsidian_1.TFile))
            throw new Error((0, i18n_1.t)("taskSourceMissing", "auto", { path: task.path }));
        const id = task.anchor ?? (0, types_1.newId)();
        await this.app.vault.process(f, current => {
            const lines = current.split(/\r?\n/);
            const candidateIndices = [];
            if (task.anchor) {
                for (let i = 0; i < lines.length; i++)
                    if ((0, core_1.parseTaskLine)(lines[i])?.anchor === task.anchor)
                        candidateIndices.push(i);
            }
            else {
                // No anchor: edit only a unique exact line. A repeated raw line is ambiguous
                // even when the recorded line number still matches one of the copies.
                for (let i = 0; i < lines.length; i++)
                    if (lines[i] === task.raw)
                        candidateIndices.push(i);
            }
            if (candidateIndices.length !== 1)
                throw new Error((0, i18n_1.t)("taskChanged"));
            const lineNo = candidateIndices[0];
            const present = (0, core_1.parseTaskLine)(lines[lineNo]);
            if (!present)
                throw new Error((0, i18n_1.t)("lineNotTask"));
            if (task.anchor && present.anchor !== task.anchor)
                throw new Error((0, i18n_1.t)("taskIdMismatch"));
            if (edit.remove)
                return (0, core_1.replaceLine)(current, lineNo, null);
            const nextLine = (0, core_1.rewriteTaskLine)(lines[lineNo], edit.done ?? present.done, edit.text ?? present.text, id);
            return (0, core_1.replaceLine)(current, lineNo, nextLine);
        });
        return id;
    }
    async createTask(config, text, filePath) {
        const normalized = text.trim();
        if (!normalized || /[\r\n]/.test(normalized))
            throw new Error((0, i18n_1.t)("singleLineTask"));
        const blockToken = findBlockToken(normalized);
        if (blockToken)
            throw new Error((0, i18n_1.t)("blockTokenInText", "auto", { token: blockToken }));
        let path;
        if (config.source.kind === "file")
            path = config.source.path;
        else {
            path = (0, core_1.normalizeVaultPath)(filePath || config.inboxFile);
            if (!path)
                throw new Error((0, i18n_1.t)("selectExistingTaskFile"));
            if (!path.endsWith(".md") || !(0, core_1.isPathInside)(path, config.source.path, config.source.recursive))
                throw new Error((0, i18n_1.t)("taskFileOutside"));
        }
        // Same predicate as sourceFiles: do not append into a note the matrix will never list.
        if (excludedBelowSource(path, config.source.path))
            throw new Error((0, i18n_1.t)("taskFileOutside"));
        const id = (0, types_1.newId)();
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof obsidian_1.TFile) || file.extension !== "md")
            throw new Error((0, i18n_1.t)("existingFileMissing", "auto", { path }));
        await this.app.vault.process(file, current => {
            const eol = current.includes("\r\n") ? "\r\n" : "\n";
            const next = current + (current.length && !current.endsWith("\n") ? eol : "") + `- [ ] ${normalized} ^${id}${eol}`;
            // Throwing here aborts the write, so an invisible task is never appended.
            if (!(0, core_1.scanMarkdown)(next, path).some(task => task.anchor === id))
                throw new Error((0, i18n_1.t)("taskNotVisibleAfterAdd"));
            return next;
        });
        return id;
    }
    async ensureFolder(filePath) {
        const parts = (0, core_1.normalizeVaultPath)(filePath).split("/").slice(0, -1);
        let current = "";
        for (const segment of parts) {
            current = current ? `${current}/${segment}` : segment;
            const found = this.app.vault.getAbstractFileByPath(current);
            if (found && !(found instanceof obsidian_1.TFolder))
                throw new Error((0, i18n_1.t)("cantCreateFolder", "auto", { path: current }));
            if (!found)
                await this.app.vault.createFolder((0, obsidian_1.normalizePath)(current));
        }
    }
    async rewritePathsAfterRename(moved, oldPath) {
        // In-app rename: keep source paths in sync. Remote FIT renames may arrive as delete/create.
        const newPath = moved.path;
        const redirect = (original) => {
            if (original === oldPath)
                return newPath;
            if (moved instanceof obsidian_1.TFolder && original.startsWith(oldPath + "/"))
                return newPath + original.slice(oldPath.length);
            return original;
        };
        let failed = 0;
        const reasons = [];
        for (const file of this.app.vault.getMarkdownFiles()) {
            const txt = await this.app.vault.cachedRead(file);
            if (!txt.includes("```eisenhower-matrix"))
                continue;
            for (const block of (0, core_1.readMatrixBlocks)(txt)) {
                const sourcePath = redirect(block.matrix.source.path);
                const inbox = redirect(block.matrix.inboxFile);
                if (sourcePath === block.matrix.source.path && inbox === block.matrix.inboxFile)
                    continue;
                try {
                    await this.updateMatrix(file, block.matrix.id, state => ({
                        ...state, source: { ...state.source, path: redirect(state.source.path) }, inboxFile: redirect(state.inboxFile)
                    }));
                }
                catch (error) {
                    // One matrix must not stop the rest. Successful writes above stay on disk.
                    failed++;
                    reasons.push(error instanceof Error ? error.message : String(error));
                }
            }
        }
        if (failed > 0)
            throw new Error((0, i18n_1.t)("renamePartial", "auto", { error: `${failed} failed: ${reasons.join("; ")}` }));
    }
}
exports.MatrixStore = MatrixStore;

},
"src/types.ts": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZONE_NAMES = exports.ZONES = exports.QUADRANTS = void 0;
exports.emptyOrder = emptyOrder;
exports.newId = newId;
exports.QUADRANTS = ["do", "schedule", "delegate", "eliminate"];
exports.ZONES = ["do", "schedule", "delegate", "eliminate", "inbox"];
exports.ZONE_NAMES = {
    do: "I. Срочно и важно",
    schedule: "II. Важно, не срочно",
    delegate: "III. Срочно, не важно",
    eliminate: "IV. Не срочно и не важно",
    inbox: "Входящие"
};
function emptyOrder() {
    return { do: [], schedule: [], delegate: [], eliminate: [], inbox: [] };
}
function newId() {
    // Browser crypto API is supported on desktop and mobile; no Node dependency.
    const random = typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID().replace(/-/g, "")
        : Array.from({ length: 6 }, () => Math.random().toString(36).slice(2, 6)).join("");
    return `em-${random.slice(0, 24)}`;
}

},
"src/view.ts": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatrixView = void 0;
const obsidian_1 = require("obsidian");
const core_1 = require("./core");
const modals_1 = require("./modals");
const types_1 = require("./types");
const i18n_1 = require("./i18n");
class MatrixView extends obsidian_1.MarkdownRenderChild {
    tr(key, params = {}) {
        return (0, i18n_1.t)(key, this.config?.language || "auto", params);
    }
    constructor(host, root, id, preferredPath) {
        super(root);
        this.host = host;
        this.root = root;
        this.id = id;
        this.preferredPath = preferredPath;
        this.tasks = [];
        this.active = "do";
        this.actionTail = Promise.resolve();
        this.actionDepth = 0;
        this.unloaded = false;
        this.completedOpen = false;
        this.serial = 0;
        this.seenDuplicateIds = new Set();
        /** One parent for MarkdownRenderer children of the current draw. Replaced on each render. */
        this.renderComponent = new obsidian_1.Component();
        root.addClass("em-root");
    }
    onload() {
        this.registerEvent(this.host.app.vault.on("modify", file => { this.onVaultFile(file); }));
        this.registerEvent(this.host.app.vault.on("create", file => { this.onVaultFile(file); }));
        this.registerEvent(this.host.app.vault.on("delete", file => { this.onVaultFile(file); }));
        this.registerEvent(this.host.app.vault.on("rename", (file, oldPath) => { this.onVaultFile(file, oldPath); }));
        void this.refresh();
    }
    onunload() {
        this.unloaded = true;
        this.serial++;
        if (this.timer !== undefined)
            window.clearTimeout(this.timer);
        this.timer = undefined;
        this.renderComponent.unload();
    }
    /** Matrix note, configured source, or a still-unloaded config. Rename checks both paths. */
    onVaultFile(file, oldPath) {
        if (this.pathAffectsView(file?.path) || (oldPath !== undefined && this.pathAffectsView(oldPath)))
            this.scheduleRefresh();
    }
    pathAffectsView(path) {
        if (!this.config || path === undefined)
            return true;
        if (path === this.file?.path || path === this.preferredPath)
            return true;
        const source = this.config.source;
        if (source.kind === "file")
            return path === source.path;
        // isPathInside is false for the folder path itself. Creating, deleting, or renaming that folder still refreshes.
        return (0, core_1.normalizeVaultPath)(path) === (0, core_1.normalizeVaultPath)(source.path)
            || (0, core_1.isPathInside)(path, source.path, source.recursive);
    }
    scheduleRefresh(delay = 200) {
        if (this.unloaded)
            return;
        if (this.timer !== undefined)
            window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => {
            this.timer = undefined;
            if (this.unloaded || this.actionDepth > 0)
                return;
            void this.refresh();
        }, delay);
    }
    async refresh() {
        if (this.unloaded)
            return;
        const serial = ++this.serial;
        try {
            const file = await this.host.store.findMatrix(this.id, this.file?.path || this.preferredPath);
            const config = await this.host.store.loadMatrix(file, this.id);
            if (serial !== this.serial || this.unloaded)
                return;
            this.file = file;
            this.config = config; // Allow source settings to be fixed even if the source is missing.
            const tasks = await this.host.store.loadTasks(config.source);
            if (serial !== this.serial || this.unloaded)
                return;
            this.tasks = tasks;
            const count = new Map();
            for (const task of tasks)
                if (task.anchor)
                    count.set(task.anchor, (count.get(task.anchor) || 0) + 1);
            this.seenDuplicateIds = new Set([...count].filter(([, n]) => n > 1).map(([id]) => id));
            this.render();
        }
        catch (e) {
            if (serial !== this.serial || this.unloaded)
                return;
            this.root.empty();
            const error = this.root.createDiv({ cls: "em-error" });
            error.createEl("strong", { text: this.tr("matrixLoadError") });
            error.createEl("p", { text: e instanceof Error ? e.message : String(e) });
            const retry = error.createEl("button", { text: this.tr("retry") });
            this.bind(retry, "click", () => void this.refresh());
            if (this.file && this.config) {
                const settings = error.createEl("button", { text: this.tr("editSource"), cls: "em-action-btn" });
                this.bind(settings, "click", () => this.settings());
            }
        }
    }
    bind(element, event, handler) {
        // Dynamic elements are discarded on redraw; do not retain listeners in Component.
        element.addEventListener(event, handler);
    }
    notify(error) {
        console.error("[Eisenhower Folder Matrix]", error);
        new obsidian_1.Notice(error instanceof Error ? error.message : String(error), 8000);
    }
    action(operation) {
        this.actionDepth++;
        const job = this.actionTail.then(async () => {
            try {
                await operation();
            }
            catch (e) {
                this.notify(e);
            }
            finally {
                this.actionDepth--;
                if (this.actionDepth === 0)
                    this.scheduleRefresh(70);
            }
        });
        this.actionTail = job.then(() => undefined, () => undefined);
        return job;
    }
    requireConfig() {
        if (!this.file || !this.config)
            throw new Error(this.tr("configNotLoaded"));
        return { config: this.config, file: this.file };
    }
    checkId(task) {
        if (task.anchor && this.seenDuplicateIds.has(task.anchor))
            throw new Error(this.tr("duplicateId"));
    }
    async move(task, destination, before) {
        await this.action(async () => {
            this.checkId(task);
            const { file } = this.requireConfig();
            let id;
            try {
                // Anchored lines keep Task.id as the matrix key (path#^id for a foreign anchor).
                // A quadrant move must not rewrite a line that already has its anchor.
                id = task.anchor ? task.id : await this.host.store.editTask(task, {});
            }
            catch (error) {
                throw new Error(this.tr("attachTaskError", { error: error instanceof Error ? error.message : String(error) }));
            }
            try {
                await this.host.store.updateMatrix(file, this.id, current => (0, core_1.moveAssignment)(current, id, destination, before?.id));
            }
            catch (error) {
                throw new Error(this.tr("writeQuadrantError", { error: error instanceof Error ? error.message : String(error) }));
            }
        });
    }
    async changeTask(task, change) {
        await this.action(async () => {
            this.checkId(task);
            const id = await this.host.store.editTask(task, change);
            if (change.remove) {
                const { file } = this.requireConfig();
                const keys = new Set([task.id, id]);
                await this.host.store.updateMatrix(file, this.id, current => {
                    const next = { ...current, assignments: { ...current.assignments }, order: { ...current.order } };
                    for (const key of keys)
                        delete next.assignments[key];
                    for (const zone of types_1.ZONES)
                        next.order[zone] = next.order[zone].filter(x => !keys.has(x));
                    return next;
                });
            }
        });
    }
    newTask(zone) {
        const { config, file } = this.requireConfig();
        const defaultFile = config.source.kind === "file" ? null : config.inboxFile || "";
        new modals_1.TaskInputModal(this.host.app, this.tr("newTask"), "", zone, defaultFile, async (text, target, path) => {
            this.checkSourceFile(path);
            await this.action(async () => {
                const id = await this.host.store.createTask(config, text, path || undefined);
                if (target && target !== "inbox")
                    await this.host.store.updateMatrix(file, this.id, current => (0, core_1.moveAssignment)(current, id, target));
            });
        }, config.source, config.language).open();
    }
    checkSourceFile(path) {
        if (path === null)
            return;
        const cfg = this.requireConfig().config;
        if (cfg.source.kind === "folder" && !(0, core_1.isPathInside)(path, cfg.source.path, cfg.source.recursive))
            throw new Error(this.tr("sourceOutOfScope"));
    }
    editTask(task) {
        new modals_1.TaskInputModal(this.host.app, this.tr("editTask"), task.text, null, null, async (text) => this.changeTask(task, { text }), undefined, this.config?.language).open();
    }
    settings() {
        const { config, file } = this.requireConfig();
        new modals_1.MatrixFormModal(this.host.app, config, async (next) => {
            await this.host.store.sourceFiles(next.source); // validate before writing
            if (next.source.kind === "folder" && next.inboxFile &&
                !(0, core_1.isPathInside)(next.inboxFile, next.source.path, next.source.recursive))
                throw new Error(this.tr("targetOutsideSource"));
            await this.host.store.updateMatrix(file, this.id, current => ({
                ...current, source: next.source, inboxFile: next.inboxFile, subtasks: next.subtasks, language: next.language
            }));
            this.scheduleRefresh(100);
        }).open();
    }
    render() {
        this.renderComponent.unload();
        this.renderComponent = new obsidian_1.Component();
        this.renderComponent.load();
        const config = this.config;
        const root = this.root;
        root.empty();
        const header = root.createDiv({ cls: "em-header" });
        header.createEl("h3", { text: this.tr("matrixTitle") });
        const actions = header.createDiv({ cls: "em-header-actions" });
        const add = actions.createEl("button", { cls: "em-action-btn", text: this.tr("addTask") });
        this.bind(add, "click", () => this.newTask("inbox"));
        const settings = actions.createEl("button", { cls: "em-action-btn", text: "⚙ " + this.tr("settings") });
        this.bind(settings, "click", () => this.settings());
        const tabs = root.createDiv({ cls: "em-mobile-tabs" });
        for (const q of types_1.QUADRANTS) {
            const count = this.visibleRootTasks().filter(t => (0, core_1.getTaskZone)(t, config) === q).length;
            const tab = tabs.createEl("button", { text: `${this.shortName(q)} · ${count}`, cls: `em-tab ${q === this.active ? "em-tab-active" : ""}` });
            this.bind(tab, "click", () => { this.active = q; this.render(); });
        }
        const grid = root.createDiv({ cls: "em-grid" });
        const roots = this.visibleRootTasks();
        for (const q of types_1.QUADRANTS)
            this.makeZone(grid, q, roots.filter(t => (0, core_1.getTaskZone)(t, config) === q));
        this.makeZone(root, "inbox", roots.filter(t => (0, core_1.getTaskZone)(t, config) === "inbox"));
        this.renderCompleted(root);
        if (this.seenDuplicateIds.size)
            root.createDiv({ cls: "em-warning", text: this.tr("duplicatesWarning") });
    }
    shortName(q) {
        return this.tr(({ do: "shortDo", schedule: "shortSchedule", delegate: "shortDelegate", eliminate: "shortEliminate" }[q]));
    }
    visibleRootTasks() {
        const config = this.config;
        const active = this.tasks.filter(t => !t.done);
        if (config.subtasks === "separate")
            return active;
        const byId = new Map(this.tasks.map(t => [t.id, t]));
        if (config.subtasks === "hidden")
            return active.filter(t => !t.parentId);
        // In nested mode child tasks are rendered inside their nearest unfinished ancestor.
        // A child of a completed parent becomes a visible root, so it won't be lost.
        return active.filter(t => !t.parentId || !byId.get(t.parentId) || Boolean(byId.get(t.parentId)?.done));
    }
    makeZone(container, zone, items) {
        const config = this.config;
        const panel = container.createDiv({ cls: `em-zone em-${zone} ${zone === this.active ? "em-active" : ""}` });
        const heading = panel.createDiv({ cls: "em-zone-heading" });
        heading.createEl("strong", { text: this.tr(zone) });
        const toolbar = heading.createDiv({ cls: "em-zone-toolbar" });
        toolbar.createEl("span", { text: String(items.length), cls: "em-count" });
        const plus = toolbar.createEl("button", { cls: "em-plus", text: "+", attr: { "aria-label": this.tr("addTo", { zone: this.tr(zone) }) } });
        this.bind(plus, "click", () => this.newTask(zone));
        const list = panel.createDiv({ cls: "em-zone-list" });
        const sorted = (0, core_1.orderedTasks)(items, zone, config);
        if (!sorted.length)
            list.createDiv({ cls: "em-empty", text: this.tr("dragToZone") });
        for (const item of sorted)
            this.makeCard(list, item, 0, zone);
        this.bind(panel, "dragover", e => { e.preventDefault(); panel.addClass("em-drag-over"); });
        this.bind(panel, "dragleave", e => {
            if (!(e.relatedTarget instanceof Node) || !panel.contains(e.relatedTarget))
                panel.removeClass("em-drag-over");
        });
        this.bind(panel, "drop", e => {
            e.preventDefault();
            panel.removeClass("em-drag-over");
            const id = e.dataTransfer?.getData("text/plain");
            const task = this.tasks.find(t => t.id === id && !t.done);
            if (task)
                void this.move(task, zone);
        });
    }
    openCardMenu(event, task, canMove) {
        const menu = new obsidian_1.Menu();
        if (canMove) {
            for (const zone of types_1.ZONES) {
                menu.addItem(item => item.setTitle(this.tr("moveTo", { zone: this.tr(zone) }))
                    .setIcon("arrow-right").onClick(() => { void this.move(task, zone); }));
            }
            menu.addSeparator();
        }
        menu.addItem(item => item.setTitle(this.tr("editText")).setIcon("pencil")
            .onClick(() => this.editTask(task)));
        menu.addItem(item => item.setTitle(this.tr("openSource")).setIcon("file-text")
            .onClick(() => { void this.host.openTask(task).catch(err => this.notify(err)); }));
        const childCount = this.tasks.filter(t => t.parentId === task.id).length;
        menu.addItem(item => item.setTitle(this.tr("deleteTask")).setIcon("trash-2")
            .onClick(() => new modals_1.ConfirmDeleteModal(this.host.app, task.text, () => this.changeTask(task, { remove: true }), this.config?.language, childCount).open()));
        menu.showAtMouseEvent(event);
    }
    makeCard(holder, task, depth, zone) {
        const config = this.config;
        const card = holder.createDiv({ cls: "em-card" });
        if (depth)
            card.addClass("em-subtask");
        if (task.done)
            card.addClass("em-card-done");
        const canMove = depth === 0 && !task.done;
        const row = card.createDiv({ cls: "em-card-row" });
        if (canMove) {
            card.draggable = true;
            row.createSpan({ text: "⠿", cls: "em-grip", attr: { title: this.tr("dragCard") } });
            this.bind(card, "dragstart", e => {
                e.dataTransfer?.setData("text/plain", task.id);
                if (e.dataTransfer)
                    e.dataTransfer.effectAllowed = "move";
            });
            this.bind(card, "dragover", e => e.preventDefault());
            this.bind(card, "drop", e => {
                e.preventDefault();
                e.stopPropagation();
                const id = e.dataTransfer?.getData("text/plain");
                const moving = this.tasks.find(t => t.id === id && !t.done);
                if (moving && id !== task.id && zone)
                    void this.move(moving, zone, task);
            });
        }
        else
            row.createSpan({ text: "•", cls: "em-grip-muted" });
        const checkbox = row.createEl("input", {
            type: "checkbox",
            attr: { "aria-label": task.done ? this.tr("markOpen") : this.tr("markDone") }
        });
        checkbox.checked = task.done;
        this.bind(checkbox, "change", () => void this.changeTask(task, { done: checkbox.checked }));
        const content = row.createDiv({ cls: "em-card-content" });
        const textEl = content.createDiv({ cls: "em-card-text" });
        // Render links, bold text and Obsidian ==highlights== as Markdown, not raw markers.
        void obsidian_1.MarkdownRenderer.render(this.host.app, task.text, textEl, task.path, this.renderComponent)
            .catch(() => { textEl.setText(task.text); });
        const basename = task.path.split("/").pop() || task.path;
        const sourceLabel = task.group ? `${task.group} · ${basename}` : basename;
        content.createDiv({ text: sourceLabel, cls: "em-card-source",
            attr: { title: this.tr("sourceLine", { path: task.path, line: task.line + 1 }) } });
        const more = row.createEl("button", { text: "⋯", cls: "em-card-menu", attr: {
                title: this.tr("actions"), "aria-label": this.tr("actions")
            } });
        this.bind(more, "click", e => {
            e.preventDefault();
            e.stopPropagation();
            this.openCardMenu(e, task, canMove);
        });
        this.bind(card, "dblclick", e => { if (e.target === card || e.target === textEl)
            this.editTask(task); });
        if (config.subtasks === "nested" && !task.done) {
            const children = this.tasks.filter(t => t.parentId === task.id && !t.done)
                .sort((a, b) => a.line - b.line);
            if (children.length) {
                const childHolder = card.createDiv({ cls: "em-children" });
                for (const child of children)
                    this.makeCard(childHolder, child, depth + 1, zone);
            }
        }
    }
    renderCompleted(root) {
        const done = this.tasks.filter(t => t.done).sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
        const details = root.createEl("details", { cls: "em-completed" });
        const summary = details.createEl("summary");
        summary.createSpan({ text: "✓ " + this.tr("completed", { count: done.length }) });
        let rendered = false;
        const showDone = () => {
            if (rendered)
                return;
            rendered = true;
            if (!done.length) {
                details.createDiv({ text: this.tr("noCompleted"), cls: "em-empty" });
                return;
            }
            const list = details.createDiv({ cls: "em-completed-list" });
            for (const task of done)
                this.makeCard(list, task, 0);
        };
        // Remember the open state, but skip Markdown cards until the section is actually open.
        this.bind(details, "toggle", () => {
            this.completedOpen = details.open;
            if (details.open)
                showDone();
        });
        details.open = this.completedOpen;
        if (details.open)
            showDone();
    }
}
exports.MatrixView = MatrixView;

},
};
const __cache = Object.create(null);
function __load(spec) {
  if (spec === 'obsidian') return require('obsidian');
  if (!__modules[spec]) throw Error('Cannot find internal module: '+spec);
  if (__cache[spec]) return __cache[spec].exports;
  const item = {exports:{}}; __cache[spec]=item;
  const localRequire = (part) => {
    if (part === 'obsidian') return require('obsidian');
    const from = spec.split('/').slice(0,-1);
    for(const chunk of part.split('/')) {
      if (chunk === '.' || !chunk) continue;
      if (chunk === '..') from.pop(); else from.push(chunk);
    }
    return __load(from.join('/')+'.ts');
  };
  __modules[spec](item, item.exports, localRequire);
  return item.exports;
}
module.exports = __load('src/main.ts').default;
