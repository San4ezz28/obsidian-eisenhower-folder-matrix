# Changelog

## 0.2.0 — safer anchors and writes

- A `^em-…` id is recognized anywhere on the task line. A foreign block id counts only as the last token and is preserved. The same foreign id in two files does not share a quadrant (`path#^id`).
- A mid-line caret word is not an anchor. Completing such a task keeps the word and may append one `^em-…` id. A new block id typed into the task text is rejected.
- Unknown JSON fields on the matrix and on `source` survive a write. The matrix block uses the note's line endings.
- A matrix block that does not parse is reported as damaged and is not overwritten.
- Renaming a source updates every matrix it can; one failure does not skip the rest.
- A new task is not written when it would be invisible, when the target is under `_fit` or a dot-folder below the source, or when the text already contains a block id. The source folder itself is still scanned if the user selected it.
- Two identical lines without an id are not edited by guess.
- Matrix actions queue instead of being dropped. Vault events refresh only the matrix note and its source. Completed cards render when the section is opened.
- `obsidian` is pinned to 1.14.4. `npm test` includes `tests/view.test.cjs`.

## 0.1.4 — bilingual UI and native help callout

- Bundled **English and Russian** translations for the UI, settings, commands, task menus, notices and error messages.
- Language setting per matrix: **Auto (Obsidian language) / Русский / English**. Auto uses Obsidian's `getLanguage()` (Obsidian >=1.8.7). Older matrix notes default to Auto.
- New matrices contain a native **collapsed `[!info]-` help callout** above the matrix code fence.
- New explicit command adds/replaces the help callout in existing matrix notes without changing their JSON configuration, tasks, source settings or priorities.
- Added regression checks for locale completeness, placeholder parity, old JSON compatibility and help migration.
- Added English README and a Cursor development guide (`AGENTS.md`, `CURSOR_SETUP.md`).
- No deliberate changes to task parsing, Markdown source editing or data storage semantics.
- Public GitHub repository, MIT license, and author `San4ezz28`. Release tag `0.1.4` attaches `main.js`, `manifest.json`, and `styles.css`.

# История изменений

## 0.1.3
- Убран текст подсказки из новых матриц.
- Добавлена инструкция публикации.

# История версий

## 0.1.2
- Распознавание checkbox-задач внутри Obsidian callout (`>`), в том числе вложенных.
- Игнорирование пустых шаблонных чекбоксов.
- Отображение Markdown-разметки в карточках, короткий источник и подпись категории.
- Компактное меню действий вместо четырёх контролов.
- Более подробная диагностика ошибок при переносе между квадрантами.
- Регрессионные тесты на callout, Dataview-код, выполнение и две матрицы.

## 0.1.1
- Выбор существующих папок и файлов через поиск Obsidian.
- Условные настройки подпапок и файла новых задач.
- Запрет автоматического создания «Входящие.md».
