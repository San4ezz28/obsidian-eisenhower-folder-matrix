import { execFileSync } from "node:child_process";

const CODE = /^(src\/|tests\/|scripts\/|styles\.css$|manifest\.json$|package\.json$|versions\.json$)/;
const DOCS = /^(README\.md|README\.ru\.md|CHANGELOG\.md|ARCHITECTURE\.md|PUBLISHING\.md|CURSOR_SETUP\.md|AGENTS\.md)$/;

function finish(payload) {
  process.stdout.write(JSON.stringify(payload));
}

function changedPaths() {
  const raw = execFileSync("git", ["status", "--porcelain", "-z"], { encoding: "utf8" });
  const parts = raw.split("\0").filter(Boolean);
  const paths = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    const status = entry.slice(0, 2);
    const path = entry.slice(3).replaceAll("\\", "/");
    if (status.startsWith("R") || status.startsWith("C")) {
      paths.push(parts[++i].replaceAll("\\", "/"));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

try {
  const input = JSON.parse(await new Response(process.stdin).text() || "{}");
  if (input.status !== "completed" || Number(input.loop_count ?? 0) > 0) {
    finish({});
    process.exit(0);
  }
  const paths = changedPaths();
  const code = paths.filter(path => CODE.test(path));
  const docs = paths.filter(path => DOCS.test(path));
  if (code.length === 0 || docs.length > 0) {
    finish({});
    process.exit(0);
  }
  finish({
    followup_message: [
      "Код плагина изменён, а документация в этом рабочем дереве нет. Приведи документы в соответствие с фактическим diff. Не описывай поведение, которого нет в коде.",
      "Обнови только файлы, которые этот diff сделал неверными: README.md и README.ru.md (если изменилось поведение для пользователя), CHANGELOG.md (без новой версии, если manifest.json её не менял), ARCHITECTURE.md (если изменились данные, запись или события), PUBLISHING.md и CURSOR_SETUP.md (если устарели шаги), AGENTS.md (только при изменении инварианта).",
      "Не меняй исходный код и не создавай коммит. Если документы и так совпадают с diff, ничего не редактируй."
    ].join("\n")
  });
} catch {
  finish({});
}
