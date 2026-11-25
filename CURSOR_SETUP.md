# Как развивать Eisenhower Folder Matrix в Cursor

## 1. Открыть проект

1. Распакуй **source ZIP**, не установочный архив, в отдельную папку, например `Documents/Projects/eisenhower-folder-matrix`.
2. В Cursor выбери **File → Open Folder** и укажи эту папку.
3. Убедись, что в корне есть `package.json`, `src/`, `tests/`, `AGENTS.md`.
4. Открой терминал Cursor и выполни:

   ```bash
   npm install
   npm test
   npm run build
   ```

   `npm run build` проверяет TypeScript и собирает `main.js`. Для работы нужен Node.js и npm.

## 2. Проверять изменения в Obsidian

Создай отдельный тестовый vault. Помести в `<test-vault>/.obsidian/plugins/eisenhower-folder-matrix/` три файла из корня проекта:

- `main.js`
- `manifest.json`
- `styles.css`

Перезапусти Obsidian или отключи/включи плагин, после чего проверь матрицу в Reading view.

**Не проверяй новые функции на единственной копии личных планов.** Сначала резервная копия; для задач внутри callout и подзадач используй отдельную тестовую заметку.

## 3. Как попросить Cursor продолжать разработку

В репозитории уже есть `AGENTS.md` с правилами сохранности Markdown и структуры матриц. Cursor поддерживает этот файл как постоянные инструкции проекта. Например, первый запрос к Cursor Agent:

> Изучи AGENTS.md, ARCHITECTURE.md, src/, tests/. Проверь `npm test` и `npm run build`. Не меняй существующий формат матриц и не удаляй пользовательские Markdown-задачи. Предложи план стабилизации мобильного интерфейса и FIT-синхронизации и только затем вноси изменения в отдельной ветке.

## 4. Создать GitHub-репозиторий

GitHub нужен **для исходников и релизов**, FIT — для пользовательских Markdown-данных. Создай отдельный репозиторий проекта; не выкладывай свой vault.

```bash
# выполняется в корне проекта, после создания репозитория на GitHub
git init
git add .
git commit -m "Initial Eisenhower Folder Matrix beta"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

Замени URL своим; для push потребуется GitHub-аутентификация. Если Cursor уже создал локальный репозиторий или remote, не повторяй `git init`/`git remote add` без проверки `git status` и `git remote -v`.

Перед публичным релизом нужно выбрать лицензию и заменить временное поле `author` в `manifest.json`. Публичный GitHub-репозиторий **не означает**, что плагин уже принят в официальный каталог Obsidian.

## 5. Бета-версия на телефоне

Когда появится **GitHub Release** с тегом точно `0.1.4` и прикреплёнными **отдельно** `main.js`, `manifest.json`, `styles.css`, установи в мобильном Obsidian плагин BRAT и добавь URL репозитория. BRAT установит исполняемые файлы плагина, а FIT синхронизирует `.md`-матрицы и задачи (если они включены в синхронизацию). Не забывай проверять версии на ПК и телефоне.

## 6. Выпуск новых версий

- Меняй `src/*.ts`, запускай `npm test` и `npm run build`.
- Повышай версию в `manifest.json` и `package.json`, обновляй CHANGELOG.
- Коммить исходники, публикуй GitHub Release с тегом **без `v`**.
- Прикладывай `main.js`, `manifest.json`, `styles.css` отдельно.
- Проверь новую версию на ПК, Android и iOS/iPadOS (по доступности устройств) прежде чем отправлять в Community Plugins.

См. также [PUBLISHING.md](PUBLISHING.md).
