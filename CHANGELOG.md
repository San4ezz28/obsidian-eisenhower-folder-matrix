# Changelog

## 0.1.4 — bilingual UI and native help callout

- Bundled **English and Russian** translations for the UI, settings, commands, task menus, notices and error messages.
- Language setting per matrix: **Auto (Obsidian language) / Русский / English**. Auto uses Obsidian's `getLanguage()` (Obsidian >=1.8.7). Older matrix notes default to Auto.
- New matrices contain a native **collapsed `[!info]-` help callout** above the matrix code fence.
- New explicit command adds/replaces the help callout in existing matrix notes without changing their JSON configuration, tasks, source settings or priorities.
- Added regression checks for locale completeness, placeholder parity, old JSON compatibility and help migration.
- Added English README and a Cursor development guide (`AGENTS.md`, `CURSOR_SETUP.md`).
- No deliberate changes to task parsing, Markdown source editing or data storage semantics.

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
