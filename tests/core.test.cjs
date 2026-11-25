const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require('./mock-obsidian.cjs').install();
require.extensions['.ts'] = (mod, name) => {
  const source = fs.readFileSync(name, 'utf8');
  const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  mod._compile(js, name);
};
const {
 createMatrix, makeMatrixNote, readMatrixBlocks, replaceMatrixBlock, scanMarkdown,
 rewriteTaskLine, replaceLine, moveAssignment, getTaskZone, isPathInside
} = require('../src/core.ts');
const {emptyOrder} = require('../src/types.ts');

const file = 'Планы 2026/Работа.md';
const src = [
  '---', 'aliases: [checklist]', '---',
  '## Дела',
  '- [ ] Сделать отчёт',
  '  - [ ] Собрать данные',
  '  - [x] Проверить данные',
  '```md', '- [ ] пример, НЕ задача', '```',
  '- [x] Старое выполненное',
  '- [ ] Стабильная ^em-abcdef12345678',
  ''
].join('\n');
const tasks = scanMarkdown(src,file);
assert.equal(tasks.length,5);
assert.equal(tasks[1].parentId,tasks[0].id);
assert.equal(tasks[2].done,true);
assert.equal(tasks[3].done,true);
assert.equal(tasks[4].id,'em-abcdef12345678');
assert.equal(tasks[4].text,'Стабильная');
assert.equal(isPathInside(file,'Планы 2026',true),true);
assert.equal(isPathInside(file,'Планы 2026',false),true);
assert.equal(isPathInside('Планы 2026/Работа/План.md','Планы 2026',false),false);
assert.equal(isPathInside(file,'Планы 20',true),false);

const state = createMatrix({kind:'folder',path:'Планы 2026',recursive:true},'nested');
const note = makeMatrixNote(state);
assert.equal(note.includes('> [!info]- Как пользоваться матрицей'),true);
assert.ok(note.includes('```eisenhower-matrix'));
assert.equal(readMatrixBlocks(note).length,1);
const moved = moveAssignment(state,'em-abcdef12345678','do');
assert.equal(getTaskZone(tasks[4],moved),'do');
assert.equal(getTaskZone(tasks[4],state),'inbox');
const movedAgain = moveAssignment(moved,'em-abcdef12345678','schedule');
assert.deepEqual(movedAgain.order.do,[]);
assert.deepEqual(movedAgain.order.schedule,['em-abcdef12345678']);
assert.equal(movedAgain.assignments['em-abcdef12345678'],'schedule');
const changed = replaceMatrixBlock(note,state.id,()=>movedAgain);
assert.equal(readMatrixBlocks(changed)[0].matrix.assignments['em-abcdef12345678'],'schedule');
assert.equal(changed.split('```eisenhower-matrix').length,2);
assert.throws(()=>replaceMatrixBlock(note,'em-notfound',x=>x),/Не удалось/);

const line = '- [ ] текст с **Markdown**';
const update = rewriteTaskLine(line,true,'текст с **Markdown**','em-12345678');
assert.equal(update,'- [x] текст с **Markdown** ^em-12345678');
assert.equal(replaceLine('first\r\n'+line+'\r\nlast\r\n',1,update), 'first\r\n'+update+'\r\nlast\r\n');
assert.equal(replaceLine('a\nb\nc',1,null),'a\nc');
assert.deepEqual(emptyOrder().inbox,[]);
console.log('PASS 20+ core assertions (scan, nested, completed, scopes, matrix state, CRLF, line patch).');
