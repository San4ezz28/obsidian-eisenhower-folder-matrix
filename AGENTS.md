# Engineering instructions for Cursor / AI agents

This is a **mobile-compatible Obsidian plugin**. Work in the source files under `src/`, not in generated `main.js`. Preserve data compatibility and users' Markdown data.

## Invariants

1. A matrix is a movable Markdown note containing a fenced `eisenhower-matrix` JSON block. Preserve its `id`, `version: 1`, existing fields, assignments and task ordering. Older notes may lack the `language` field; default to `auto` rather than migrating destructively.
2. A matrix scans **one configured folder (with optional recursion) or one configured Markdown file**. Never expand the source scope to the whole vault without explicit user choice. Skip a `_fit` segment (any case) and a dot-segment only when they sit below the source root. If the user selected that folder as the source, scan it.
3. Users write plain `- [ ]` and `- [x]` tasks, including in Obsidian callouts (`> - [ ]`) and nested lists. No forced tags, task priorities, or dates.
4. New tasks appear in **Inbox**, not Eliminate. Completed tasks remain in their original Markdown sources and appear in Completed, which is collapsed by default. Reopening restores their old quadrant.
5. Subtask display has three per-matrix modes: separate, nested, hidden; completed subtasks remain visible in Completed.
6. For source edits use Obsidian's Vault.process or equivalent conflict-aware API, change **only the targeted task line**, preserve original line endings and surrounding Markdown, and abort on ambiguity. Do not auto-create `Входящие.md`/`Inbox.md` or edit unrelated notes.
7. Keep locale strings in `src/i18n.ts`. Maintain identical EN/RU translation keys and `{placeholder}` tokens, and keep English as the fallback. Use official `getLanguage()` and per-matrix `language` override (`auto`, `ru`, `en`). Never translate user-authored note content.
8. All runtime functionality must work offline on Obsidian desktop and mobile. No Electron-only or Node-only runtime APIs in `src`. Use Obsidian native controls and touch-friendly menus.
9. FIT (File gIT) syncs ordinary Markdown; put portable matrix state in the matrix note, not only `.obsidian/plugins/*/data.json`. Do not claim conflict-free multi-device merges; test concurrent edits explicitly.
10. Never publish or commit a user's vault, personal notes, access tokens or `.obsidian/` secrets. GitHub repository contains only plugin source, tests and documentation.
11. A single `^em-` token anywhere on a task line is the stable id. A foreign block id counts only as the last token, is kept as written, and is keyed in the matrix as `path#^id`. Do not append a second id. Abort when a line has two `^em-` tokens, when new text introduces a block token the line did not already show, or when two identical unanchored lines match. A mid-line `^word` is not an anchor. Unknown JSON fields on the matrix and on `source` survive writes. Do not overwrite a matrix block that fails to parse.

## Development workflow

- Change `src/*.ts` and `styles.css` as needed; update user-facing docs and `CHANGELOG.md` on feature changes.
- Run `npm test` and `npm run build` after installing dependencies (`npm install`). Build is `main.js` in project root.
- Add tests for parser changes, especially callouts, nested checkboxes, duplicate lines/IDs, stable IDs, EOL preservation and notes containing Dataview code.
- Add RU and EN strings for *every* new visible UI message. Keep all locale files bundled in `main.js`.
- Do not automatically rewrite existing matrix notes merely to change help text or language; use explicit user commands for source changes.
- Update `manifest.json` and `package.json` versions together; GitHub release tag must match without `v` prefix.
- Try changes in a disposable test vault before testing against personal notes. Verify Android and iOS manually before making mobile compatibility claims.

## Project layout

`src/core.ts` parsing and matrix data; `src/store.ts` file operations; `src/view.ts` UI; `src/modals.ts` Obsidian dialogs; `src/i18n.ts` localization; `src/main.ts` registration. Use `tests/` and the mock vault for fast regressions.
