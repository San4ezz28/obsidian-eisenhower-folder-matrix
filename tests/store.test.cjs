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
const { t } = require('../src/i18n.ts');
const {createMatrix, makeMatrixNote, readMatrixBlocks} = require('../src/core.ts');
class MockVault {
  constructor(entries){
    this.files = new Map();
    this.failProcess = new Set();
    this.processCalls = [];
    for (const [path,value] of Object.entries(entries))this.files.set(path,{file:new TFile(path),content:value});
  }
  getMarkdownFiles(){return [...this.files.values()].filter(x=>x.file.extension==='md').map(x=>x.file);}
  getAbstractFileByPath(path){
    if(this.files.has(path))return this.files.get(path).file;
    if([...this.files.keys()].some(x=>x.startsWith(path+'/'))) return new TFolder(path);
    return null;
  }
  async cachedRead(file){return this.files.get(file.path).content;}
  // Apply the modifier only when it returns. A throw leaves the previous bytes in place.
  async process(file, modifier){
    this.processCalls.push(file.path);
    if(this.failProcess.has(file.path)) throw new Error('process failed: '+file.path);
    const before=this.files.get(file.path).content;
    const after=modifier(before);
    this.files.get(file.path).content=after;
    return after;
  }
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

  // A valid preferred note that simply lacks this id still falls through to the vault search.
  const otherPath='Главная/Чужая.md';
  const otherConfig=createMatrix({kind:'file',path:source,recursive:false});
  vault.files.set(otherPath,{file:new TFile(otherPath),content:makeMatrixNote(otherConfig)});
  assert.equal((await store.findMatrix(config.id, otherPath)).path, matrixPath);

  // Broken JSON in the preferred note is damaged: do not scan for another copy and do not rewrite it.
  const damagedId='em-damaged00000001';
  const damagedPath='Главная/Битая.md';
  const broken='```eisenhower-matrix\n<<<<<<< HEAD\n{"id":"'+damagedId+'", broken\n=======\n{}\n>>>>>>> other\n```\n';
  vault.files.set(damagedPath,{file:new TFile(damagedPath),content:broken});
  const brokenBefore=vault.body(damagedPath);
  const decoy=createMatrix({kind:'file',path:source,recursive:false});
  decoy.id=damagedId;
  const decoyPath='Главная/Копия.md';
  vault.files.set(decoyPath,{file:new TFile(decoyPath),content:makeMatrixNote(decoy)});
  await assert.rejects(store.findMatrix(damagedId, damagedPath), err=>{
    assert.equal(err.message, t('matrixDamaged'));
    return true;
  });
  assert.equal(vault.body(damagedPath), brokenBefore);
  const damagedFile=vault.getAbstractFileByPath(damagedPath);
  await assert.rejects(store.loadMatrix(damagedFile, damagedId), err=>{
    assert.equal(err.message, t('matrixDamaged'));
    return true;
  });
  assert.equal(vault.body(damagedPath), brokenBefore);
  assert.equal(vault.body(decoyPath), makeMatrixNote(decoy));

  // One failed matrix write must not discard a successful path update on another note.
  const oldDir='Старые';
  const newDir='Новые';
  const goodNote='Заметки/Хорошая.md';
  const badNote='Заметки/Плохая.md';
  const goodCfg=createMatrix({kind:'folder',path:oldDir,recursive:true});
  const badCfg=createMatrix({kind:'folder',path:oldDir,recursive:true});
  vault.files.set(goodNote,{file:new TFile(goodNote),content:makeMatrixNote(goodCfg)});
  vault.files.set(badNote,{file:new TFile(badNote),content:makeMatrixNote(badCfg)});
  const badBefore=vault.body(badNote);
  vault.failProcess.add(badNote);
  const renameDetail='1 failed: process failed: '+badNote;
  await assert.rejects(store.rewritePathsAfterRename(new TFolder(newDir), oldDir), err=>{
    assert.equal(err.message, t('renamePartial','auto',{error:renameDetail}));
    assert.match(err.message, /1/);
    return true;
  });
  assert.ok(vault.body(goodNote).includes(newDir));
  assert.equal(vault.body(goodNote).includes(oldDir), false);
  assert.equal(vault.body(badNote), badBefore);
  vault.failProcess.delete(badNote);

  // An unclosed fence would hide the appended task, so the file must stay unchanged.
  const fencePath='Планы 2026/Черновик.md';
  const fenceBody='```\n- [ ] уже внутри\n';
  vault.files.set(fencePath,{file:new TFile(fencePath),content:fenceBody});
  await assert.rejects(store.createTask(config, 'Невидимая задача', fencePath), err=>{
    assert.equal(err.message, t('taskNotVisibleAfterAdd'));
    return true;
  });
  assert.equal(vault.body(fencePath), fenceBody);

  // Two identical raw lines and no anchor: do not edit a guessed twin.
  const dupPath='Планы 2026/Дубли.md';
  const dupBody='- [ ] Одинаковая\n- [ ] Одинаковая\n';
  vault.files.set(dupPath,{file:new TFile(dupPath),content:dupBody});
  const twins=await store.loadTasks({kind:'file',path:dupPath,recursive:false});
  assert.equal(twins.length, 2);
  assert.equal(twins[0].anchor, null);
  assert.equal(twins[0].line, 0);
  assert.equal(twins[0].raw, twins[1].raw);
  await assert.rejects(store.editTask(twins[0], {text:'Изменено'}), err=>{
    assert.equal(err.message, t('taskChanged'));
    return true;
  });
  assert.equal(vault.body(dupPath), dupBody);

  // Sync conflict copies and Obsidian internals are not tasks.
  const fitPath='Планы 2026/_fit/conflict.md';
  const dotPath='Планы 2026/.obsidian/cache.md';
  vault.files.set(fitPath,{file:new TFile(fitPath),content:'- [ ] Конфликтная копия\n'});
  vault.files.set(dotPath,{file:new TFile(dotPath),content:'- [ ] Служебное\n'});
  const scoped=await store.loadTasks(config.source);
  assert.equal(scoped.some(task=>task.path===fitPath || task.text==='Конфликтная копия'), false);
  assert.equal(scoped.some(task=>task.path===dotPath || task.text==='Служебное'), false);
  assert.ok(scoped.some(task=>task.path===source));

  // Exclusion is relative to the source root. _fit matches any case; a chosen _fit folder is itself included.
  const workNote='Work/note.md';
  const fitHidden='Work/_fit/hidden.md';
  const fitUpper='Work/_FIT/hidden.md';
  const fitMixed='Work/_Fit/hidden.md';
  const dotSecret='Work/.secret/x.md';
  const fitNote='Work/_fit/note.md';
  vault.files.set(workNote,{file:new TFile(workNote),content:'- [ ] Visible\n'});
  vault.files.set(fitHidden,{file:new TFile(fitHidden),content:'- [ ] Hidden fit\n'});
  vault.files.set(fitUpper,{file:new TFile(fitUpper),content:'- [ ] Hidden FIT\n'});
  vault.files.set(fitMixed,{file:new TFile(fitMixed),content:'- [ ] Hidden Fit\n'});
  vault.files.set(dotSecret,{file:new TFile(dotSecret),content:'- [ ] Hidden dot\n'});
  vault.files.set(fitNote,{file:new TFile(fitNote),content:'- [ ] Inside chosen fit\n'});
  const workSource={kind:'folder',path:'Work',recursive:true};
  const workTasks=await store.loadTasks(workSource);
  assert.ok(workTasks.some(task=>task.path===workNote));
  assert.equal(workTasks.some(task=>task.path===fitHidden), false);
  assert.equal(workTasks.some(task=>task.path===fitUpper), false);
  assert.equal(workTasks.some(task=>task.path===fitMixed), false);
  assert.equal(workTasks.some(task=>task.path===dotSecret), false);
  const fitTasks=await store.loadTasks({kind:'folder',path:'Work/_fit',recursive:true});
  assert.ok(fitTasks.some(task=>task.path===fitNote));
  const dotTasks=await store.loadTasks({kind:'folder',path:'Work/.secret',recursive:true});
  assert.ok(dotTasks.some(task=>task.path===dotSecret));

  const fitTarget='Work/_fit/b.md';
  const fitBody='- [ ] stay\n';
  vault.files.set(fitTarget,{file:new TFile(fitTarget),content:fitBody});
  const workConfig=createMatrix(workSource);
  const callsBeforeExcluded=vault.processCalls.length;
  await assert.rejects(store.createTask(workConfig, 'Не записывать', fitTarget), err=>{
    assert.equal(err.message, t('taskFileOutside'));
    return true;
  });
  assert.equal(vault.processCalls.length, callsBeforeExcluded);
  assert.equal(vault.body(fitTarget), fitBody);

  const noteBefore=vault.body(workNote);
  const callsBeforeToken=vault.processCalls.length;
  await assert.rejects(store.createTask(workConfig, 'see ^call1', workNote), err=>{
    assert.equal(err.message, t('blockTokenInText', 'auto', {token:'^call1'}));
    return true;
  });
  assert.equal(vault.processCalls.length, callsBeforeToken);
  assert.equal(vault.body(workNote), noteBefore);

  console.log('PASS end-to-end mock Vault: scoped scan, create matrix, anchor, quadrant, complete, undo, edit, add, CRLF preservation');
})().catch(e=>{console.error(e);process.exitCode=1});
