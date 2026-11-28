# Eisenhower Folder Matrix for Obsidian

A lightweight, offline-first Eisenhower matrix (2 × 2) for ordinary Markdown tasks, with an Inbox and a collapsible Completed section. Each matrix lives inside a movable Markdown note.

> **Status:** Release [0.2.0](https://github.com/San4ezz28/obsidian-eisenhower-folder-matrix/releases/tag/0.2.0) is on GitHub under the MIT license (author San4ezz28). It is not in the Obsidian Community Plugins directory. Back up your vault and test on a duplicate before using it with important notes.

**Languages:** English and Russian. The UI follows Obsidian's interface language by default; each matrix can override it in ⚙ Settings → Interface language. Untranslated Obsidian locales fall back to English. Translation strings are bundled, with no network calls.

## Features

- Four real quadrants, a separate Inbox for unclassified tasks, and a Completed section (collapsed by default).
- Source can be **one existing Markdown file** or **one folder**, optionally including subfolders. It never scans the whole vault unless you explicitly select it as the source.
- Standard `- [ ]` / `- [x]` tasks with **no mandatory tags, dates, or priorities**. Tasks inside Obsidian callouts and nested task lists are supported.
- Drag-and-drop on desktop and a `⋯ → Move` menu suitable for touchscreens.
- Editing, completion, reopening, deleting (with confirmation), opening source notes, and creating tasks directly from the matrix.
- Three modes per matrix: subtasks nested under parents / separate cards / hidden. Completed subtasks still appear in Completed.
- State (assignments, order, language, source) stored in the **matrix Markdown note** for sync through FIT/File gIT or other Markdown sync.
- A matrix can be moved to another folder without affecting its source setting. Multiple matrices can use different priorities for the same task.
- English/Russian interface; creates a collapsed `[!info]-` callout with usage help.

Release 0.2.0 adds:

- A `^em-…` id is recognized anywhere on the task line. Text typed after it keeps the same quadrant.
- A foreign block id such as `^call1` counts only when it is the last token. The plugin keeps it and does not add a second id. The same foreign id in two notes does not share a quadrant.
- A caret word in the middle of a task (`2 ^1000`) stays ordinary text. Completing the task can still append one `^em-…` id.
- Typing a new block id into a task is rejected. Two identical lines without an id are not edited by guess.
- Notes inside `_fit` or a dot-folder below the source are not tasks. If that folder is the source itself, its files are included.
- A matrix block that does not parse is reported and left unchanged. Extra JSON fields on the matrix are kept. Completed cards are drawn when that section is opened.

## Install a downloaded build

1. **Back up your vault.**
2. Unzip the installation archive and copy the entire `eisenhower-folder-matrix` directory into `<vault>/.obsidian/plugins/`.
3. Make sure the directory contains `main.js`, `manifest.json`, and `styles.css`.
4. Restart Obsidian, then enable **Eisenhower Folder Matrix** in Settings → Community plugins.
5. Run `Create Eisenhower matrix` (or `Создать матрицу Эйзенхауэра`) from the command palette. Choose an existing task source and a destination for the new matrix note.
6. Switch the matrix note to **Reading view** to use the interactive board.

### Update an existing matrix note

Version 0.2.0 opens older matrix files without recreating them. It does **not** rewrite existing notes automatically.

To replace the old plain purple quote with a collapsed native callout—or to insert the hint into a matrix note that has none—open the matrix note and run the command `Add or update the matrix tip callout` (or `Добавить или обновить callout-подсказку матрицы`). It only updates that active note if it contains a recognized matrix code block.

Example of the new help callout:

```markdown
> [!info]- How to use the matrix
> Open this note in **Reading view** to interact with tasks. Use the ⚙ **Settings** button inside the matrix to change the source and display preferences.
```

## Data format and compatibility

A matrix note includes a fenced code block:

````markdown
# Eisenhower Matrix

> [!info]- How to use the matrix
> Open this note in **Reading view** to interact with tasks.

```eisenhower-matrix
{
  "version": 1,
  "id": "em-…",
  "source": { "kind": "folder", "path": "Plans", "recursive": true },
  "inboxFile": "",
  "subtasks": "nested",
  "language": "auto",
  "assignments": {},
  "order": { "do": [], "schedule": [], "delegate": [], "eliminate": [], "inbox": [] }
}
```
````

Older notes that lack `language` are interpreted as `auto` and remain valid.

When you first move, edit, or complete a task that has no block id, the plugin appends `^em-...` to that line. An existing `^em-...` anywhere on the line is reused. A foreign id that is already the last token stays as written. This is automatic; **you do not need to tag tasks**. The parser respects Markdown callout prefixes, code fences (including indented fences), `%%` comments, frontmatter that has a closing marker, and nested checkboxes. Don't manually duplicate block IDs.

**Important:** FIT syncs the matrix/task `.md` files if they are included in your sync scope; it does **not** necessarily install the plugin's compiled files on another device. Install the plugin separately on desktop/mobile or use a GitHub release and BRAT during beta testing. The plugin does not automatically merge conflicting concurrent edits made on different devices.

## Working in Cursor

See [CURSOR_SETUP.md](CURSOR_SETUP.md) and [AGENTS.md](AGENTS.md) for project setup and development rules.

```bash
npm install
npm test
npm run build
```

`npm run build` generates the bundled `main.js` and performs a TypeScript type check against the installed Obsidian API. The release ZIP must contain `main.js`, `manifest.json`, and `styles.css`.

## Project structure

```text
src/
  main.ts     plugin registration and commands
  core.ts     parser, quadrants, JSON state, exact-line edits
  store.ts    Obsidian vault access and synchronization-safe writes
  view.ts     interactive matrix UI
  modals.ts   Obsidian-native dialogs and file picker
  i18n.ts     English/Russian interface strings
  types.ts    shared types and schema
scripts/build.cjs    build script
styles.css           styling with theme variables
manifest.json        plugin metadata
AGENTS.md            guidance for Cursor/AI agents
tests/               offline tests using a mock Obsidian vault
```

## Publishing

GitHub has the source, the MIT `LICENSE`, and release 0.2.0. The Community Plugins submission is still open: test the mobile UI and FIT conflict cases on real devices, then follow [PUBLISHING.md](PUBLISHING.md). For official release policy, see https://docs.obsidian.md/plugins/releasing/submit-plugin.
