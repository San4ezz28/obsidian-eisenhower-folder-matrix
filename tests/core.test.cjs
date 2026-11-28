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
 createMatrix, encodeMatrix, makeMatrixNote, parseTaskLine, readMatrixBlocks, replaceMatrixBlock,
 scanMarkdown, rewriteTaskLine, replaceLine, moveAssignment, getTaskZone, isPathInside,
 validSource, validateMatrix
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
assert.equal(changed.includes('\r'), false);
assert.throws(()=>replaceMatrixBlock(note,'em-notfound',x=>x),/Не удалось/);

const line = '- [ ] текст с **Markdown**';
const update = rewriteTaskLine(line,true,'текст с **Markdown**','em-12345678');
assert.equal(update,'- [x] текст с **Markdown** ^em-12345678');
assert.equal(replaceLine('first\r\n'+line+'\r\nlast\r\n',1,update), 'first\r\n'+update+'\r\nlast\r\n');
assert.equal(replaceLine('a\nb\nc',1,null),'a\nc');
assert.deepEqual(emptyOrder().inbox,[]);

const appended = '- [ ] Buy milk ^em-abcdef12345678 today';
const appendedTask = parseTaskLine(appended);
assert.equal(appendedTask.anchor, 'em-abcdef12345678');
assert.equal(appendedTask.text, 'Buy milk today');
assert.equal(parseTaskLine('- [ ] ^EM-ABCDEF12345678 Buy milk').anchor, 'em-abcdef12345678');
assert.equal(parseTaskLine('- [ ] ^EM-ABCDEF12345678 Buy milk').text, 'Buy milk');
assert.equal(
  rewriteTaskLine(appended, true, appendedTask.text, appendedTask.anchor),
  '- [x] Buy milk today ^em-abcdef12345678'
);
const twoEm = '- [ ] A ^em-abcdef12345678 B ^em-1234567890abcdef';
assert.equal(parseTaskLine(twoEm).anchor, null);
assert.equal(parseTaskLine(twoEm).text, 'A ^em-abcdef12345678 B ^em-1234567890abcdef');
assert.throws(() => rewriteTaskLine(twoEm, false, 'A B', 'em-abcdef12345678'), /ID задачи изменился|Task ID changed/);

const foreign = '- [ ] Call home ^call1';
const foreignTask = parseTaskLine(foreign);
assert.equal(foreignTask.anchor, 'call1');
assert.equal(foreignTask.text, 'Call home');
const foreignUpdate = rewriteTaskLine(foreign, true, 'Call later', 'em-12345678abcdef');
assert.equal(foreignUpdate, '- [x] Call later ^call1');
assert.equal(foreignUpdate.includes('^em-'), false);
const mixedCase = '- [ ] Keep ^MyId1';
assert.equal(parseTaskLine(mixedCase).anchor, 'MyId1');
assert.equal(rewriteTaskLine(mixedCase, true, 'Keep', 'em-12345678abcdef'), '- [x] Keep ^MyId1');
const emAndForeign = '- [ ] Both ^em-abcdef12345678 ^call1';
assert.equal(parseTaskLine(emAndForeign).anchor, 'em-abcdef12345678');
assert.equal(parseTaskLine(emAndForeign).text, 'Both ^call1');
assert.equal(
  rewriteTaskLine(emAndForeign, false, 'Both', 'em-abcdef12345678'),
  '- [ ] Both ^em-abcdef12345678'
);
assert.throws(
  () => rewriteTaskLine(emAndForeign, false, 'Both', 'call1'),
  /ID задачи изменился|Task ID changed/
);
const foreignThenEm = '- [ ] X ^call1 ^em-abcdef12345678';
assert.equal(parseTaskLine(foreignThenEm).anchor, 'em-abcdef12345678');
assert.equal(parseTaskLine(foreignThenEm).text, 'X ^call1');
assert.equal(
  rewriteTaskLine(foreignThenEm, true, 'X', 'em-abcdef12345678'),
  '- [x] X ^em-abcdef12345678'
);

const midLine = '- [ ] compute 2 ^1000 now';
assert.equal(parseTaskLine(midLine).anchor, null);
assert.equal(parseTaskLine(midLine).text, 'compute 2 ^1000 now');
assert.equal(parseTaskLine('- [ ] Plan ^2026 bill').anchor, null);
assert.equal(parseTaskLine('- [ ] Plan ^2026 bill').text, 'Plan ^2026 bill');
assert.equal(parseTaskLine('- [ ] Call home ^call1   ').anchor, 'call1');
assert.equal(parseTaskLine('- [ ] Call home ^call1   ').text, 'Call home');
const toggledMid = rewriteTaskLine(midLine, true, 'compute 2 ^1000 now', 'em-12345678abcdef');
assert.equal(toggledMid, '- [x] compute 2 ^1000 now ^em-12345678abcdef');
assert.equal(parseTaskLine(toggledMid).anchor, 'em-12345678abcdef');
assert.equal(parseTaskLine(toggledMid).text, 'compute 2 ^1000 now');
assert.equal(
  rewriteTaskLine(midLine, true, 'compute 2 now', 'em-12345678abcdef'),
  '- [x] compute 2 now ^em-12345678abcdef'
);
const pay = '- [ ] pay ^1000 now';
const payId = 'em-abcdef12345678';
const payToggled = rewriteTaskLine(pay, true, 'pay ^1000 now', payId);
assert.equal(payToggled, `- [x] pay ^1000 now ^${payId}`);
assert.equal((payToggled.match(/\^em-/g) || []).length, 1);
assert.ok(payToggled.includes('^1000'));
assert.equal(parseTaskLine(payToggled).anchor, payId);
assert.equal(parseTaskLine(payToggled).text, 'pay ^1000 now');
const keepAbcd = '- [ ] a ^em-12345678 ^abcd';
const abcdToggled = rewriteTaskLine(keepAbcd, true, 'a ^abcd', 'em-12345678');
assert.equal(abcdToggled, '- [x] a ^abcd ^em-12345678');
assert.equal(parseTaskLine(abcdToggled).anchor, 'em-12345678');
assert.equal(parseTaskLine(abcdToggled).text, 'a ^abcd');
assert.ok(abcdToggled.includes('^abcd'));
assert.throws(
  () => rewriteTaskLine('- [ ] hello', false, 'hello ^call1', 'em-abcdef12345678'),
  /block ID/
);
const severalForeign = '- [ ] see ^note1 then ^todo1';
assert.equal(parseTaskLine(severalForeign).anchor, 'todo1');
assert.equal(parseTaskLine(severalForeign).text, 'see ^note1 then');
assert.equal(
  rewriteTaskLine(severalForeign, false, 'see then', 'em-12345678abcdef'),
  '- [ ] see then ^todo1'
);

assert.throws(
  () => rewriteTaskLine('- [ ] A ^em-abcdef12345678', false, 'A ^call1', 'em-abcdef12345678'),
  /block ID/
);
assert.throws(
  () => rewriteTaskLine('- [ ] A ^em-abcdef12345678', false, 'A ^em-1234567890abcdef', 'em-abcdef12345678'),
  /block ID/
);
assert.equal(
  rewriteTaskLine('- [ ] A ^em-abcdef12345678', false, 'see ^abc', 'em-abcdef12345678'),
  '- [ ] see ^abc ^em-abcdef12345678'
);

const fileA = scanMarkdown('- [ ] a ^todo1\n  - [ ] child', 'a.md');
const fileB = scanMarkdown('- [ ] b ^todo1', 'b.md');
assert.equal(fileA[0].anchor, 'todo1');
assert.equal(fileB[0].anchor, 'todo1');
assert.equal(fileA[0].id, 'a.md#^todo1');
assert.equal(fileB[0].id, 'b.md#^todo1');
assert.notEqual(fileA[0].id, fileB[0].id);
assert.equal(fileA[1].parentId, 'a.md#^todo1');
assert.equal(scanMarkdown('- [ ] stable ^em-abcdef12345678', 'b.md')[0].id, 'em-abcdef12345678');
assert.ok(scanMarkdown(midLine, 'a.md')[0].id.startsWith('u:'));
let cross = createMatrix({kind:'folder', path:'Notes', recursive:true});
cross = moveAssignment(cross, fileA[0].id, 'do');
cross = moveAssignment(cross, fileB[0].id, 'schedule');
assert.equal(getTaskZone(fileA[0], cross), 'do');
assert.equal(getTaskZone(fileB[0], cross), 'schedule');

const inlinePercent = ['- [ ] doc `%%` syntax', '- [ ] lost?', '- [ ] lost2'].join('\n');
assert.deepEqual(scanMarkdown(inlinePercent, 'a.md').map(t => t.text), ['doc `%%` syntax', 'lost?', 'lost2']);

const withExtra = { ...state, extra: 1, alpha: 2, source: { ...state.source, origin: 'desk' } };
const validated = validateMatrix(withExtra);
assert.equal(validated.extra, 1);
assert.equal(validated.alpha, 2);
assert.equal(validated.source.origin, 'desk');
assert.deepEqual(Object.keys(validated), ['version','id','source','inboxFile','subtasks','language','assignments','order','alpha','extra']);
assert.deepEqual(Object.keys(validated.source), ['kind','path','recursive','origin']);
assert.deepEqual(Object.keys(JSON.parse(encodeMatrix(validated))), Object.keys(validated));
const crlfNote = `Заголовок\r\n\r\n\`\`\`eisenhower-matrix\r\n${encodeMatrix(withExtra).replace(/\n/g, '\r\n')}\r\n\`\`\`\r\nХвост\r\n`;
const written = replaceMatrixBlock(crlfNote, state.id, m => moveAssignment(m, 'em-extra', 'do'));
assert.equal(written.startsWith('Заголовок\r\n'), true);
assert.equal(written.endsWith('\r\nХвост\r\n'), true);
assert.equal(written.replace(/\r\n/g, '').includes('\n'), false);
assert.equal(written.replace(/\r\n/g, '').includes('\r'), false);
const roundTrip = readMatrixBlocks(written)[0].matrix;
assert.equal(roundTrip.extra, 1);
assert.equal(roundTrip.alpha, 2);
assert.equal(roundTrip.source.origin, 'desk');
assert.equal(roundTrip.assignments['em-extra'], 'do');
assert.ok(written.indexOf('"order"') < written.indexOf('"alpha"') && written.indexOf('"alpha"') < written.indexOf('"extra"'));

const comments = [
  '%% - [ ] hidden %%',
  '- [ ] shown',
  '%%',
  '- [ ] hidden multiline',
  '- [ ] still hidden',
  '%%',
  '- [ ] shown again'
].join('\n');
assert.deepEqual(scanMarkdown(comments, 'a.md').map(t => t.text), ['shown', 'shown again']);

const fenced = [
  '- [ ] real',
  '    ```js',
  '    - [ ] fake',
  '    ```',
  '- [ ] also real'
].join('\n');
assert.deepEqual(scanMarkdown(fenced, 'a.md').map(t => t.text), ['real', 'also real']);

const unclosed = ['---', 'title: nope', '- [ ] survives'].join('\n');
assert.deepEqual(scanMarkdown(unclosed, 'a.md').map(t => t.text), ['survives']);
const closedFm = ['---', '- [ ] hidden fm', '---', '- [ ] shown fm'].join('\n');
assert.deepEqual(scanMarkdown(closedFm, 'a.md').map(t => t.text), ['shown fm']);

const paragraph = ['- [ ] first', 'A paragraph sits here.', '- [ ] second'].join('\n');
const paragraphTasks = scanMarkdown(paragraph, 'a.md');
assert.equal(paragraphTasks[1].parentId, null);
const indentedAfterParagraph = ['- [ ] first', 'A paragraph sits here.', '  - [ ] not a child'].join('\n');
assert.equal(scanMarkdown(indentedAfterParagraph, 'a.md')[1].parentId, null);
const blankKeepsParent = ['- [ ] first', '', '  - [ ] child'].join('\n');
const blankTasks = scanMarkdown(blankKeepsParent, 'a.md');
assert.equal(blankTasks[1].parentId, blankTasks[0].id);

const callouts = [
  '> [!note]- Later',
  '> - [ ] inside',
  'after the callout',
  '- [ ] outside',
  '> - [ ] quoted later'
].join('\n');
const calloutTasks = scanMarkdown(callouts, 'a.md');
assert.equal(calloutTasks.find(t => t.text === 'inside').group, 'Later');
assert.equal(calloutTasks.find(t => t.text === 'outside').group, undefined);
assert.equal(calloutTasks.find(t => t.text === 'quoted later').group, undefined);
const headed = ['> [!warning]- Box', '> - [ ] inside box', '# Heading', '> - [ ] after heading'].join('\n');
const headedTasks = scanMarkdown(headed, 'a.md');
assert.equal(headedTasks.find(t => t.text === 'inside box').group, 'Box');
assert.equal(headedTasks.find(t => t.text === 'after heading').group, undefined);
assert.equal(headedTasks.find(t => t.text === 'after heading').parentId, null);

assert.equal(validSource({kind:'file', path:'../Secret.md', recursive:false}), false);
assert.equal(validSource({kind:'file', path:'.obsidian/plugins/x.md', recursive:false}), false);
assert.equal(validSource({kind:'file', path:'Notes/../Secret.md', recursive:false}), false);
assert.equal(validSource({kind:'folder', path:'_fit', recursive:true}), true);
assert.equal(validSource({kind:'file', path:'Notes/Plan.md', recursive:false}), true);
assert.throws(() => createMatrix({kind:'file', path:'../Secret.md', recursive:false}), /Некорректно указан источник задач|Invalid task source/);
assert.throws(() => validateMatrix({...state, source:{kind:'file', path:'.obsidian/plugins/x.md', recursive:false}}), /Некорректно указан источник задач|Invalid task source/);

console.log('PASS 20+ core assertions (scan, nested, completed, scopes, matrix state, CRLF, line patch).');
console.log('PASS anchors, foreign ids, unknown JSON, CRLF fence, comments, fences, frontmatter, parents, callouts, paths.');
console.log('PASS foreign position, em precedence, replacement tokens, cross-file ids, inline percent.');
