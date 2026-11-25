const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, name) => {
  const js = ts.transpileModule(fs.readFileSync(name, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  mod._compile(js, name);
};
const obsidianMock = require('./mock-obsidian.cjs');
obsidianMock.install();
const { TFile, TFolder } = obsidianMock;
const { MatrixStore } = require('../src/store.ts');
const {createMatrix, makeMatrixNote, readMatrixBlocks} = require('../src/core.ts');
class MockVault {
  constructor(entries){this.files = new Map();for (const [path,value] of Object.entries(entries))this.files.set(path,{file:new TFile(path),content:value});}
  getMarkdownFiles(){return [...this.files.values()].filter(x=>x.file.extension==='md').map(x=>x.file);}
  getAbstractFileByPath(path){
    if(this.files.has(path))return this.files.get(path).file;
    if([...this.files.keys()].some(x=>x.startsWith(path+'/'))) return new TFolder(path);
    return null;
  }
  async cachedRead(file){return this.files.get(file.path).content;}
  async process(file,modifier){const before=this.files.get(file.path).content;const after=modifier(before);this.files.get(file.path).content=after;return after;}
  async create(path,body){if(this.files.has(path))throw Error('exists');const f=new TFile(path);this.files.set(path,{file:f,content:body});return f;}
  async createFolder(path){return new TFolder(path);}
  body(path){return this.files.get(path).content;}
}
(async()=>{
  const source = 'Планы 2026/Работа.md';
  const matrixPath='Главная/Матрица.md';
  const original='Заметка без изменения!\r\n- [ ] Написать отчёт\r\n- [x] Сделано раньше\r\n';
  const vault=new MockVault({[source]:original,'Другое.md':'- [ ] Чужая задача\n'});
  const store=new MatrixStore({vault});
  const config=createMatrix({kind:'folder',path:'Планы 2026',recursive:true});
  const matrix = await store.createMatrix(matrixPath,config);
  assert.equal(vault.getAbstractFileByPath(matrixPath) instanceof TFile,true);
  assert.equal(readMatrixBlocks(vault.body(matrixPath))[0].matrix.id,config.id);
  let tasks=await store.loadTasks(config.source);
  assert.equal(tasks.length,2);
  assert.equal(tasks.some(x=>x.text==='Чужая задача'),false);
  assert.equal(tasks[1].done,true);
  const id=await store.editTask(tasks[0],{});
  assert.equal(vault.body(source).startsWith('Заметка без изменения!\r\n'),true);
  assert.ok(vault.body(source).includes('Написать отчёт ^'+id+'\r\n'));
  await store.updateMatrix(matrix,config.id,x=>({...x,assignments:{...x.assignments,[id]:'schedule'}}));
  assert.equal((await store.loadMatrix(matrix,config.id)).assignments[id],'schedule');
  tasks=await store.loadTasks(config.source);
  assert.equal(tasks[0].anchor,id);
  await store.editTask(tasks[0],{done:true});
  tasks=await store.loadTasks(config.source);
  assert.equal(tasks[0].done,true);
  assert.equal(tasks[1].done,true);
  assert.equal((await store.loadMatrix(matrix,config.id)).assignments[id],'schedule');
  await store.editTask(tasks[0],{done:false,text:'Написать отчёт и отправить'});
  tasks=await store.loadTasks(config.source);
  assert.equal(tasks[0].text,'Написать отчёт и отправить');
  assert.equal(tasks[0].anchor,id);
  assert.equal(tasks[0].done,false);
  // Adding in folder mode must require an explicitly chosen, existing Markdown note.
  await assert.rejects(store.createTask(config,'Новая задача'),/Выберите существующий Markdown-файл/);
  await assert.rejects(store.createTask(config,'Новая задача','Планы 2026/Входящие.md'),/Выберите существующий Markdown-файл/);
  assert.equal(vault.getAbstractFileByPath('Планы 2026/Входящие.md'),null);
  await store.createTask(config,'Купить ноутбук',source);
  assert.ok((await store.loadTasks(config.source)).some(x=>x.text==='Купить ноутбук'));
  // One-file source always appends to that file without opening a folder/file selector.
  const fileConfig=createMatrix({kind:'file',path:source,recursive:false});
  await store.createTask(fileConfig,'Подготовить встречу');
  assert.ok(vault.body(source).includes('Подготовить встречу'));
  assert.equal(vault.body(source).startsWith('Заметка без изменения!\r\n'),true);
  console.log('PASS end-to-end mock Vault: scoped scan, create matrix, anchor, quadrant, complete, undo, edit, add, CRLF preservation');
})().catch(e=>{console.error(e);process.exitCode=1});
