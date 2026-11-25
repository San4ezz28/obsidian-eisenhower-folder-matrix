const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, name) => {
  const js = ts.transpileModule(fs.readFileSync(name, 'utf8'), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText;
  mod._compile(js,name);
};
const {TFile,TFolder,install} = require('./mock-obsidian.cjs');
install();
const {MatrixStore} = require('../src/store.ts');
const {scanMarkdown,createMatrix,makeMatrixNote,moveAssignment,getTaskZone} = require('../src/core.ts');

const sourcePath='Планы 2026/Месяц.md';
const source=[
  '---','tags: [plan]','---',
  '%% AUTOBAR:START %%','> [!success]+ 📊 Прогресс','> 2/3','%% AUTOBAR:END %%',
  '> [!note]- Учёба · ███ 1/3',
  '> - [ ] **Написать отчёт**',
  '>     - [ ] ==Подготовить графики==',
  '>     - [x] Проверить расчёты',
  '>     - [ ] ', // empty placeholder must be ignored
  '> [!note]- Дом · ██ 0/1',
  '> - [ ] Купить продукты: [[Список покупок]]',
  '```dataviewjs',
  'dv.paragraph("- [ ] example inside code, not a task")',
  '```',
  '- [ ] 50% задач → _награда_ ^em-aabbccddeeff1234',
  ''
].join('\n');
let tasks=scanMarkdown(source,sourcePath);
assert.equal(tasks.length,5);
assert.equal(tasks.filter(t=>t.done).length,1);
assert.equal(tasks[1].parentId,tasks[0].id);
assert.equal(tasks[0].group,'Учёба');
assert.equal(tasks[3].group,'Дом');
assert.equal(tasks[4].group,undefined);
assert.equal(tasks[4].anchor,'em-aabbccddeeff1234');

class MockVault {
  constructor(map){this.data=new Map(Object.entries(map).map(([p,t])=>[p,{file:new TFile(p),content:t}]));}
  getMarkdownFiles(){return [...this.data.values()].map(x=>x.file);}
  getAbstractFileByPath(p){return this.data.get(p)?.file || ([...this.data.keys()].some(x=>x.startsWith(p+'/')) ? new TFolder(p):null);}
  async cachedRead(f){return this.data.get(f.path).content;}
  async process(f,transform){const item=this.data.get(f.path);const next=transform(item.content);item.content=next;return next;}
  body(p){return this.data.get(p).content;}
}
(async()=>{
 const state1=createMatrix({kind:'file',path:sourcePath,recursive:false});
 const state2=createMatrix({kind:'file',path:sourcePath,recursive:false});
 const matrix1='Матрицы/Общая.md',matrix2='Матрицы/Вторая.md';
 const vault=new MockVault({[sourcePath]:source,[matrix1]:makeMatrixNote(state1),[matrix2]:makeMatrixNote(state2)});
 const store=new MatrixStore({vault});
 tasks=await store.loadTasks(state1.source);
 const id=await store.editTask(tasks[0],{}); // first move adds block id without damaging callout prefix
 assert.ok(vault.body(sourcePath).includes('> - [ ] **Написать отчёт** ^'+id));
 assert.ok(vault.body(sourcePath).includes('%% AUTOBAR:START %%'));
 assert.ok(vault.body(sourcePath).includes('```dataviewjs'));
 await store.updateMatrix(vault.getAbstractFileByPath(matrix1),state1.id,m=>moveAssignment(m,id,'do'));
 await store.updateMatrix(vault.getAbstractFileByPath(matrix2),state2.id,m=>moveAssignment(m,id,'schedule'));
 const first=await store.loadMatrix(vault.getAbstractFileByPath(matrix1),state1.id);
 const second=await store.loadMatrix(vault.getAbstractFileByPath(matrix2),state2.id);
 assert.equal(first.assignments[id],'do');
 assert.equal(second.assignments[id],'schedule');
 tasks=await store.loadTasks(state1.source);
 assert.equal(getTaskZone(tasks[0],first),'do');
 const child=tasks[1]; const childId=await store.editTask(child,{done:true});
 assert.ok(vault.body(sourcePath).includes('>     - [x] ==Подготовить графики== ^'+childId));
 tasks=await store.loadTasks(state1.source);
 await store.editTask(tasks.find(t=>t.id===childId),{done:false});
 tasks=await store.loadTasks(state1.source);
 assert.equal(tasks.find(t=>t.id===childId).done,false);
 assert.equal(tasks.length,5);
 console.log('PASS regression: callouts, categories, parent subtasks, inline formatting, two matrices, moves, complete/undo, no collateral edits.');
})().catch(e=>{console.error(e);process.exitCode=1});
