# Публикация Eisenhower Folder Matrix в GitHub и Obsidian

## Статус

Версия 0.1.4 — **локальный тестовый прототип**, не опубликована в GitHub и не отправлена в каталог Obsidian. `isDesktopOnly: false` только разрешает установку на мобильных; корректность на Android и iOS нужно подтвердить тестами.

## Перед публикацией

1. Создать отдельный **публичный** репозиторий GitHub только для исходного кода этого плагина. **Не загружать** весь vault, планы, `.obsidian/`, FIT `_fit/` или реальные пользовательские заметки.
2. В `manifest.json` заменить поле `author` (сейчас временное `Independent prototype`) на имя/псевдоним автора; проверить уникальность `id`.
3. Выбрать лицензию и положить её текст в файл `LICENSE` в корне. Плагин намеренно **не снабжён лицензией по умолчанию**, потому что это решение владельца; MIT — распространённый вариант для открытого кода, но необязательный.
4. Проверить README, скриншоты, настройки безопасности и публичные стандарты Obsidian. Английское описание теперь в README.md; проверь полноту переводов и документации.
5. Проверить рабочий vault на копии с FIT, отдельными матрицами, задачами callout и мобильным интерфейсом.
6. `npm install`, `npm run build`, `npm test`. Проверить результат `main.js`.

## Тестовый релиз (GitHub)

1. Опубликовать репозиторий (код `src/`, `tests/`, `README.md`, `manifest.json`, `package.json`, `scripts/`, `styles.css`, `main.js`).
2. Создать GitHub Release с тегом, **строго совпадающим** с `manifest.json` → `version`. Для текущей сборки `0.1.4` (без префикса `v`).
3. В Attachments релиза поместить **три файла отдельно**: `main.js`, `manifest.json`, `styles.css` — не только ZIP. Не загружать пользовательские заметки.
4. Опубликовать релиз. В каждой новой версии менять `manifest.json` и тег выпуска.

## Как поставить тестовый плагин на телефон

1. На телефоне открыть Obsidian → Settings → Community plugins → Browse.
2. Установить **BRAT** (`obsidian42-brat`) из публичного каталога.
3. Settings → BRAT → Add beta plugin либо команда `BRAT: Add a beta plugin for testing`.
4. Вставить URL **вашего будущего GitHub-репозитория**, когда он появится (сейчас URL нет).
5. Включить Eisenhower Folder Matrix в Community plugins.
6. Убедиться, что FIT перенёс `.md`-файлы матриц и исходных задач, а затем испытать меню перемещения, чеки, секции, возврат задач на телефонном экране.

BRAT ставит **код плагина** на устройство. FIT отдельно синхронизирует **данные** (Markdown-заметки и матрицы). Синхронизацию кода через FIT не предполагаем.

## Официальный Community Plugins

1. Подготовить публичный репозиторий с `README.md`, `LICENSE` и правильным `manifest.json`.
2. Создать GitHub Release, тег и три файла релиза, как выше.
3. Зайти в https://community.obsidian.md через Obsidian account, подключить GitHub account.
4. Через панель разработчика **Add your plugin** выбрать репозиторий и отправить на автоматическую проверку.
5. Исправить замечания, дождаться принятия. После этого плагин смогут устанавливать из обычного поиска Obsidian без BRAT.

Официальные инструкции:
- https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin
- https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development
- https://docs.obsidian.md/community-directory/submission-requirements-for-plugins
- https://community.obsidian.md/plugins/obsidian42-brat
