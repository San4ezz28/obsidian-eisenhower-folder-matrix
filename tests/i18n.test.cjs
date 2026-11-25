const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, name) => {
  mod._compile(ts.transpileModule(fs.readFileSync(name,'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText,name);
};
const mock = require('./mock-obsidian.cjs');
mock.install();
const { EN, RU, t } = require('../src/i18n.ts');
const {createMatrix, makeMatrixNote, readMatrixBlocks, convertLegacyHelp} = require('../src/core.ts');
assert.deepEqual(Object.keys(EN).sort(), Object.keys(RU).sort());
for (const k of Object.keys(EN)) {
  assert.ok(EN[k].length && RU[k].length, 'missing string '+k);
  assert.deepEqual((EN[k].match(/\{\w+\}/g)||[]).sort(), (RU[k].match(/\{\w+\}/g)||[]).sort(), 'placeholder mismatch '+k);
}
mock.language='ru'; assert.equal(t('newTask'),'Новая задача');
mock.language='en'; assert.equal(t('newTask'),'New task');
assert.equal(t('newTask','ru'),'Новая задача');
assert.equal(t('newTask','en'),'New task');
assert.equal(t('completed','en',{count:3}),'Completed (3)');
assert.equal(t('completed','ru',{count:2}),'Сделанное (2)');
const src={kind:'file',path:'Tasks.md',recursive:false};
const old=createMatrix(src,'nested','');
const legacy=JSON.parse(JSON.stringify(old));
delete legacy.language;
const legacyNote='# Матрица Эйзенхауэра\n\n> Открой заметку в режиме чтения (Reading view). Для изменения настроек нажми ⚙ в самой матрице.\n\n```eisenhower-matrix\n'+JSON.stringify(legacy)+'\n```\n';
const decoded=readMatrixBlocks(legacyNote)[0].matrix;
assert.equal(decoded.language,'auto');
const upgraded=convertLegacyHelp(legacyNote);
assert.ok(upgraded.includes('> [!info]-'));
assert.equal(convertLegacyHelp(upgraded),upgraded,'migration is idempotent');
assert.equal(readMatrixBlocks(upgraded)[0].matrix.id,old.id);
const en=createMatrix(src,'nested','', 'en');
assert.ok(makeMatrixNote(en).includes('> [!info]- How to use the matrix'));
assert.ok(makeMatrixNote(en).includes('# Eisenhower Matrix'));
assert.equal(readMatrixBlocks(makeMatrixNote(en))[0].matrix.language,'en');
console.log('PASS i18n: RU/EN keys, placeholders, Obsidian language, per-matrix override, legacy migration, portable notes.');
