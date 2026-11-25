/* Small dependency-free CommonJS bundler (requires the dev dependency TypeScript).
   The 'obsidian' import is intentionally external, supplied by Obsidian itself. */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const modules = fs.readdirSync(path.join(root,'src')).filter(f=>f.endsWith('.ts'));
let out = `/* Eisenhower Folder Matrix 0.1.4 – generated. Do not edit. */\nconst __modules = {\n`;
for (const name of modules) {
  const entry = 'src/' + name;
  const src = fs.readFileSync(path.join(root, entry), 'utf8');
  const result = ts.transpileModule(src, {fileName:entry,compilerOptions:{
    target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true
  }, reportDiagnostics:true});
  const diagnostics = (result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if (diagnostics.length) throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: x=>x, getCurrentDirectory:()=>root, getNewLine:()=>"\n"
  }));
  out += `${JSON.stringify(entry)}: function(module, exports, require) {\n${result.outputText}\n},\n`;
}
out += `};
const __cache = Object.create(null);
function __load(spec) {
  if (spec === 'obsidian') return require('obsidian');
  if (!__modules[spec]) throw Error('Cannot find internal module: '+spec);
  if (__cache[spec]) return __cache[spec].exports;
  const item = {exports:{}}; __cache[spec]=item;
  const localRequire = (part) => {
    if (part === 'obsidian') return require('obsidian');
    const from = spec.split('/').slice(0,-1);
    for(const chunk of part.split('/')) {
      if (chunk === '.' || !chunk) continue;
      if (chunk === '..') from.pop(); else from.push(chunk);
    }
    return __load(from.join('/')+'.ts');
  };
  __modules[spec](item, item.exports, localRequire);
  return item.exports;
}
module.exports = __load('src/main.ts').default;
`;
fs.writeFileSync(path.join(root, 'main.js'), out, 'utf8');
console.log('Built main.js ('+Math.round(Buffer.byteLength(out)/1024)+' KB)');
