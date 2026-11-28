# Публикация Eisenhower Folder Matrix в GitHub и Obsidian

## Статус

Публичный репозиторий: https://github.com/San4ezz28/obsidian-eisenhower-folder-matrix. Автор в `manifest.json` — `San4ezz28`. Лицензия — MIT, файл `LICENSE` в корне. Текущий релиз — [0.2.0](https://github.com/San4ezz28/obsidian-eisenhower-folder-matrix/releases/tag/0.2.0): отдельные `main.js`, `manifest.json` и `styles.css`. Релиз 0.1.4 не перезаписывался.

В каталог Obsidian заявка не отправлена. `isDesktopOnly: false` только разрешает установку на мобильных; Android и iOS ещё не подтверждены.

## Перед заявкой в каталог

1. Репозиторий уже публичный и содержит только исходники плагина. Не добавлять vault, планы, `.obsidian/`, FIT `_fit/` и пользовательские заметки.
2. Автор `San4ezz28` и лицензия MIT уже стоят. `id` плагина — `eisenhower-folder-matrix`.
3. Проверить README, скриншоты и стандарты Obsidian. Английское описание — `README.md`, русское — `README.ru.md`.
4. Проверить копию vault с FIT, отдельными матрицами, задачами callout и мобильным интерфейсом.
5. `npm install`, `npm test`, `npm run build`. В релиз класть `main.js`, собранный из того же коммита, что и тег.

## Следующий релиз на GitHub

Релизы `0.1.4` и `0.2.0` выложены по этим правилам. Для следующей версии повторить то же:

1. В репозитории остаются код `src/`, `tests/`, `README.md`, `manifest.json`, `package.json`, `scripts/`, `styles.css`, `main.js` и `LICENSE`.
2. Тег **строго совпадает** с `manifest.json` → `version`, без префикса `v`.
3. Вложения релиза — три отдельных файла: `main.js`, `manifest.json`, `styles.css`. Не ZIP и не пользовательские заметки.
4. Опубликовать релиз. Уже выпущенные теги не перезаписывать.

## Как поставить тестовый плагин на телефон

1. На телефоне открыть Obsidian → Settings → Community plugins → Browse.
2. Установить **BRAT** (`obsidian42-brat`) из публичного каталога.
3. Settings → BRAT → Add beta plugin либо команда `BRAT: Add a beta plugin for testing`.
4. Вставить URL `https://github.com/San4ezz28/obsidian-eisenhower-folder-matrix`. BRAT поставит последний релиз, сейчас это `0.2.0`.
5. Включить Eisenhower Folder Matrix в Community plugins.
6. Убедиться, что FIT перенёс `.md`-файлы матриц и исходных задач, а затем испытать меню перемещения, чеки, секции, возврат задач на телефонном экране.

BRAT ставит **код плагина** на устройство. FIT отдельно синхронизирует **данные** (Markdown-заметки и матрицы). Синхронизацию кода через FIT не предполагаем.

## Официальный Community Plugins

1. Публичный репозиторий уже содержит `README.md`, `LICENSE` и `manifest.json` с автором `San4ezz28`.
2. Заявка читает последний релиз. Сейчас это `0.2.0` с тремя отдельными файлами.
3. Зайти в https://community.obsidian.md через Obsidian account, подключить GitHub account.
4. Через панель разработчика **Add your plugin** выбрать репозиторий и отправить на автоматическую проверку.
5. Исправить замечания, дождаться принятия. После этого плагин смогут устанавливать из обычного поиска Obsidian без BRAT.

Официальные инструкции:
- https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin
- https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development
- https://docs.obsidian.md/community-directory/submission-requirements-for-plugins
- https://community.obsidian.md/plugins/obsidian42-brat
