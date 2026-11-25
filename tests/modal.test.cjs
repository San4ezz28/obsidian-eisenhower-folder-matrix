const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const mock=require('./mock-obsidian.cjs');
mock.install();
require.extensions['.ts']=(mod,name)=>{
  const js=ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  mod._compile(js,name);
};
const {MatrixFormModal,TaskInputModal}=require('../src/modals.ts');
const app={vault:{
  getAllLoadedFiles:()=>[new mock.TFolder('/'),new mock.TFolder('Планы'),new mock.TFile('Планы/Задачи.md'),new mock.TFile('Вне папки.md')],
  getMarkdownFiles:()=>[new mock.TFile('Планы/Задачи.md'),new mock.TFile('Вне папки.md')],
  getAbstractFileByPath:(path)=>app.vault.getAllLoadedFiles().find(f=>f.path===path)||null
}};
(async()=>{
  let saved=null;
  const create=new MatrixFormModal(app,null,async data=>{saved=data;});
  create.onOpen();
  const field=name=>mock.settings.find(s=>s.name===name);
  const kind=field('Источник задач').dropdown;
  assert.equal(field('Включая подпапки').settingEl.style.display,'');
  assert.equal(field('Файл для новых задач (необязательно)').settingEl.style.display,'');
  kind.change('file');
  assert.equal(field('Включая подпапки').settingEl.style.display,'none');
  assert.equal(field('Файл для новых задач (необязательно)').settingEl.style.display,'none');
  const pick=field('Путь к источнику').buttons[0];
  pick.click();
  assert.deepEqual(mock.lastPicker.getItems().map(f=>f.path),['Вне папки.md','Планы/Задачи.md'].sort((a,b)=>a.localeCompare(b)));
  mock.lastPicker.onChooseItem(new mock.TFile('Планы/Задачи.md'));
  const save=mock.settings.find(s=>s.buttons?.some(b=>b.label==='Сохранить')).buttons[0];
  await save.click();
  assert.equal(saved.source.kind,'file');
  assert.equal(saved.source.path,'Планы/Задачи.md');
  assert.equal(saved.source.recursive,false);
  assert.equal(saved.inboxFile,'');
  const again=new MatrixFormModal(app,null,async data=>{saved=data;});
  again.onOpen();
  assert.equal(field('Включая подпапки').settingEl.style.display,'');
  assert.equal(field('Файл для новых задач (необязательно)').settingEl.style.display,'');
  assert.equal(field('Путь к источнику').text.value,'');
  field('Путь к источнику').buttons[0].click();
  assert.deepEqual(mock.lastPicker.getItems().map(f=>f.path),['Планы']);
  mock.lastPicker.onChooseItem(new mock.TFolder('Планы'));
  await mock.settings.find(s=>s.buttons?.some(b=>b.label==='Сохранить')).buttons[0].click();
  assert.equal(saved.source.kind,'folder');
  assert.equal(saved.source.path,'Планы');
  assert.equal(saved.inboxFile,'');

  let submitted=null;
  const task=new TaskInputModal(app,'Добавить','', 'inbox','',async(text,zone,path)=>{submitted={text,zone,path};},saved.source);
  task.onOpen();
  assert.equal(mock.settings.some(s=>s.name==='В какой файл записать'),true);
  const fileRow=field('В какой файл записать');
  fileRow.buttons[0].click();
  assert.deepEqual(mock.lastPicker.getItems().map(f=>f.path),['Планы/Задачи.md']);
  mock.lastPicker.onChooseItem(new mock.TFile('Планы/Задачи.md'));
  assert.equal(fileRow.text.value,'Планы/Задачи.md');
  field('Текст задачи').text.onChanged('Сделать новый пункт');
  await mock.settings.find(s=>s.buttons?.some(b=>b.label==='Сохранить')).buttons[0].click();
  assert.deepEqual(submitted,{text:'Сделать новый пункт',zone:'inbox',path:'Планы/Задачи.md'});
  // English locale selector on both first-run and existing matrices.
  mock.language='en';
  const translated=new MatrixFormModal(app,null,async data=>{saved=data;});
  translated.onOpen();
  assert.equal(mock.settings.some(s=>s.name==='Task source'),true);
  assert.equal(mock.settings.some(s=>s.name==='Interface language'),true);
  const localeRow=mock.settings.find(s=>s.name==='Interface language');
  localeRow.dropdown.change('en');
  mock.settings.find(s=>s.name==='Source path').buttons[0].click();
  mock.lastPicker.onChooseItem(new mock.TFolder('Планы'));
  await mock.settings.find(s=>s.buttons?.some(b=>b.label==='Save')).buttons[0].click();
  assert.equal(saved.language,'en');
  const settings=new MatrixFormModal(app,saved,async data=>{saved=data;});
  settings.onOpen();
  assert.equal(mock.settings.some(s=>s.name==='Matrix settings'),false); // title is not a Setting
  assert.equal(mock.settings.some(s=>s.name==='Interface language'),true);
  assert.equal(mock.settings.find(s=>s.name==='Interface language').dropdown.value,'en');
  mock.language='ru';
  console.log('PASS modal: conditional rows, native folder/file picker, explicit task file, save validation');
})().catch(e=>{console.error(e);process.exitCode=1});
