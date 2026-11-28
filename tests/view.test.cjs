const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mock = require('./mock-obsidian.cjs');
mock.install();
require.extensions['.ts'] = (mod, name) => {
  const js = ts.transpileModule(fs.readFileSync(name, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}
  }).outputText;
  mod._compile(js, name);
};
const {MatrixView} = require('../src/view.ts');
const {ConfirmDeleteModal} = require('../src/modals.ts');

const timers = new Map();
let timerSeq = 1;
global.window = {
  setTimeout(fn) {
    const id = timerSeq++;
    timers.set(id, fn);
    return id;
  },
  clearTimeout(id) { timers.delete(id); }
};
global.document = {
  createElement() { throw new Error('view must not use document.createElement'); }
};
function flushTimers() {
  const fns = [...timers.values()];
  timers.clear();
  for (const fn of fns) fn();
}
async function ticks() {
  for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve));
}

class FakeEl {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.classes = new Set();
    this.attrs = {};
    this.listeners = {};
    this.textContent = '';
    this.open = false;
    this.checked = false;
    this.draggable = false;
    this.type = '';
  }
  addClass(...names) {
    for (const name of names.join(' ').split(/\s+/)) if (name) this.classes.add(name);
  }
  removeClass(...names) {
    for (const name of names.join(' ').split(/\s+/)) this.classes.delete(name);
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  empty() { this.children = []; }
  setText(text) { this.textContent = String(text); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  createDiv(opts) { return this.createEl('div', opts); }
  createSpan(opts) { return this.createEl('span', opts); }
  createEl(tag, opts = {}) {
    const child = new FakeEl(tag);
    if (opts.cls) child.addClass(opts.cls);
    if (opts.text != null) child.textContent = String(opts.text);
    if (opts.type) child.type = opts.type;
    if (opts.attr) for (const [key, value] of Object.entries(opts.attr)) child.setAttribute(key, value);
    this.children.push(child);
    return child;
  }
}
function walk(el, visit) {
  visit(el);
  for (const child of el.children || []) walk(child, visit);
}
function findAll(root, cls) {
  const found = [];
  walk(root, el => { if (el.classes && el.classes.has(cls)) found.push(el); });
  return found;
}
function textOf(el) {
  return [el.textContent || '', ...(el.children || []).map(textOf)].join(' ');
}
function orderMap() {
  return {do: [], schedule: [], delegate: [], eliminate: [], inbox: []};
}

function bareTask(fields) {
  return Object.assign({
    id: 'task', anchor: null, path: 'Notes/Tasks.md', line: 1,
    raw: '- [ ] Task', text: 'Task', done: false, indent: 0, parentId: null
  }, fields);
}
function boot(source, tasks = []) {
  const loads = {n: 0};
  const edits = [];
  const writes = [];
  const io = {editResult: undefined};
  const handlers = {};
  let loadGate = null;
  const config = {
    version: 1, id: 'matrix-1', source, inboxFile: '', subtasks: 'nested', language: 'en',
    assignments: {}, order: orderMap()
  };
  const vault = {
    on(name, cb) {
      (handlers[name] ||= []).push(cb);
      return {name};
    },
    emit(name, ...args) {
      for (const cb of handlers[name] || []) cb(...args);
    }
  };
  const store = {
    async findMatrix() { return new mock.TFile('Matrices/Board.md'); },
    loadMatrix() {
      if (loadGate) return loadGate;
      return Promise.resolve(config);
    },
    async loadTasks() { loads.n++; return tasks; },
    async editTask(task, change) {
      edits.push({id: task.id, anchor: task.anchor, change});
      return io.editResult !== undefined ? io.editResult : 'id';
    },
    async updateMatrix(_file, matrixId, change) {
      const current = {
        version: 1, id: 'em-matrix-1', source: config.source, inboxFile: config.inboxFile,
        subtasks: config.subtasks, language: config.language,
        assignments: {...config.assignments},
        order: {
          do: [...config.order.do], schedule: [...config.order.schedule],
          delegate: [...config.order.delegate], eliminate: [...config.order.eliminate],
          inbox: [...config.order.inbox]
        }
      };
      const next = await change(current);
      writes.push({
        matrixId,
        assignments: {...next.assignments},
        order: {
          do: [...next.order.do], schedule: [...next.order.schedule],
          delegate: [...next.order.delegate], eliminate: [...next.order.eliminate],
          inbox: [...next.order.inbox]
        }
      });
    },
    async createTask() { return 'id'; },
    async sourceFiles() { return []; }
  };
  const root = new FakeEl('div');
  const view = new MatrixView(
    {app: {vault}, store, async openTask() {}},
    root, 'matrix-1', 'Matrices/Board.md'
  );
  return {
    view, root, vault, loads, config, edits, writes, io,
    holdLoad() { let release; loadGate = new Promise(resolve => { release = () => resolve(config); }); return release; }
  };
}

const fileSource = {kind: 'file', path: 'Notes/Tasks.md', recursive: false};
const renders = [];
const originalRender = mock.MarkdownRenderer.render;
mock.MarkdownRenderer.render = async function(...args) {
  renders.push(args);
  return originalRender.apply(this, args);
};

(async () => {
  // 1. Two actions queue in order. A vault refresh during the first does not run until both finish.
  const queued = boot(fileSource);
  queued.view.onload();
  await ticks();
  assert.equal(findAll(queued.root, 'em-error').length, 0, textOf(queued.root));
  assert.equal(queued.loads.n, 1);
  const order = [];
  let releaseFirst;
  const gate = new Promise(resolve => { releaseFirst = resolve; });
  const first = queued.view.action(async () => {
    order.push('a');
    await gate;
    order.push('a-done');
  });
  const second = queued.view.action(async () => { order.push('b'); });
  await ticks();
  assert.deepEqual(order, ['a']);
  queued.vault.emit('modify', {path: fileSource.path});
  flushTimers();
  await ticks();
  assert.equal(queued.loads.n, 1);
  assert.deepEqual(order, ['a']);
  releaseFirst();
  await first;
  await second;
  assert.deepEqual(order, ['a', 'a-done', 'b']);
  flushTimers();
  await ticks();
  assert.equal(queued.loads.n, 2);
  queued.view.onunload();

  // A thrown queued operation still notifies, and the next queued operation still runs.
  const broken = boot(fileSource);
  broken.view.onload();
  await ticks();
  assert.equal(broken.loads.n, 1);
  const ran = [];
  const noticeAt = mock.notices.length;
  const recorded = [];
  const originalError = console.error;
  console.error = (...args) => { recorded.push(args); };
  try {
    const failed = broken.view.action(async () => { throw new Error('queue-broke'); });
    const next = broken.view.action(async () => { ran.push('second'); });
    await failed;
    await next;
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(ran, ['second']);
  const notified = mock.notices.slice(noticeAt).includes('queue-broke')
    || recorded.some(args => args.map(part => String(part)).join(' ').includes('queue-broke'));
  assert.equal(notified, true);
  flushTimers();
  await ticks();
  assert.equal(broken.loads.n, 2);
  broken.view.onunload();

  // 2. Vault events refresh only for the matrix note, the source, or a config that is not loaded yet.
  const events = boot(fileSource);
  const releaseLoad = events.holdLoad();
  events.view.onload();
  await ticks();
  assert.equal(events.loads.n, 0);
  events.vault.emit('modify', {path: 'Diary/Today.md'});
  assert.ok(timers.size >= 1);
  releaseLoad();
  await ticks();
  assert.equal(events.loads.n, 1);
  flushTimers();
  await ticks();
  assert.equal(events.loads.n, 2);

  const idle = boot(fileSource);
  idle.view.onload();
  await ticks();
  assert.equal(idle.loads.n, 1);
  idle.vault.emit('modify', {path: 'Diary/Today.md'});
  idle.vault.emit('create', {path: 'Diary/New.md'});
  idle.vault.emit('delete', {path: 'Diary/Old.md'});
  idle.vault.emit('rename', {path: 'Diary/Tomorrow.md'}, 'Diary/Today.md');
  flushTimers();
  await ticks();
  assert.equal(idle.loads.n, 1);
  idle.vault.emit('modify', {path: 'Notes/Tasks.md'});
  flushTimers();
  await ticks();
  assert.equal(idle.loads.n, 2);
  idle.vault.emit('modify', {path: 'Matrices/Board.md'});
  flushTimers();
  await ticks();
  assert.equal(idle.loads.n, 3);
  idle.vault.emit('rename', {path: 'Archive/Tasks.md'}, 'Notes/Tasks.md');
  flushTimers();
  await ticks();
  assert.equal(idle.loads.n, 4);
  idle.view.onunload();

  const folder = boot({kind: 'folder', path: 'Notes', recursive: true});
  folder.view.onload();
  await ticks();
  assert.equal(folder.loads.n, 1);
  folder.vault.emit('modify', {path: 'Other/A.md'});
  folder.vault.emit('modify', {path: 'NotesExtra/A.md'});
  flushTimers();
  await ticks();
  assert.equal(folder.loads.n, 1);
  folder.vault.emit('modify', {path: 'Notes/Sub/A.md'});
  flushTimers();
  await ticks();
  assert.equal(folder.loads.n, 2);
  folder.vault.emit('create', {path: 'Notes'});
  flushTimers();
  await ticks();
  assert.equal(folder.loads.n, 3);
  folder.vault.emit('delete', {path: 'Notes'});
  flushTimers();
  await ticks();
  assert.equal(folder.loads.n, 4);
  folder.vault.emit('rename', {path: 'Archive'}, 'Notes');
  flushTimers();
  await ticks();
  assert.equal(folder.loads.n, 5);
  folder.vault.emit('create', {path: 'Notes/'});
  flushTimers();
  await ticks();
  assert.equal(folder.loads.n, 6);
  const shallow = boot({kind: 'folder', path: 'Notes', recursive: false});
  shallow.view.onload();
  await ticks();
  shallow.vault.emit('modify', {path: 'Notes/Sub/A.md'});
  flushTimers();
  await ticks();
  assert.equal(shallow.loads.n, 1);
  shallow.vault.emit('modify', {path: 'Notes/A.md'});
  flushTimers();
  await ticks();
  assert.equal(shallow.loads.n, 2);
  shallow.vault.emit('delete', {path: 'Notes'});
  flushTimers();
  await ticks();
  assert.equal(shallow.loads.n, 3);

  // 3. A completed action after onunload must not refresh.
  const stopped = boot(fileSource);
  stopped.view.onload();
  await ticks();
  const baseline = stopped.loads.n;
  let releaseStopped;
  const stoppedGate = new Promise(resolve => { releaseStopped = resolve; });
  const pending = stopped.view.action(async () => { await stoppedGate; });
  await ticks();
  stopped.view.onunload();
  releaseStopped();
  await pending;
  flushTimers();
  await ticks();
  assert.equal(stopped.loads.n, baseline);
  assert.equal(timers.size, 0);

  // Completed cards stay unbuilt until the details element opens. Markdown children use a render component.
  renders.length = 0;
  const doneTask = {
    id: 'done-1', anchor: null, path: 'Notes/Tasks.md', line: 3,
    raw: '- [x] Done thing', text: 'Done thing', done: true, indent: 0, parentId: null
  };
  const completed = boot(fileSource, [doneTask]);
  completed.view.onload();
  await ticks();
  assert.equal(findAll(completed.root, 'em-card').length, 0);
  assert.equal(findAll(completed.root, 'em-completed-list').length, 0);
  assert.equal(renders.length, 0);
  assert.match(textOf(completed.root), /Completed \(1\)/);
  const details = findAll(completed.root, 'em-completed')[0];
  details.open = true;
  for (const fn of details.listeners.toggle) fn();
  assert.equal(completed.view.completedOpen, true);
  assert.equal(findAll(completed.root, 'em-card').length, 1);
  assert.equal(renders.length, 1);
  assert.notEqual(renders[0][4], completed.view);
  const host = renders[0][4];
  const checkbox = [];
  walk(completed.root, el => { if (el.tag === 'input') checkbox.push(el); });
  assert.equal(checkbox.length, 1);
  assert.equal(checkbox[0].type, 'checkbox');
  assert.equal(checkbox[0].checked, true);
  assert.equal(checkbox[0].attrs['aria-label'] != null, true);
  completed.vault.emit('modify', {path: fileSource.path});
  flushTimers();
  await ticks();
  assert.ok(host.unloadCount >= 1);

  const withChildren = new ConfirmDeleteModal({vault: {}}, 'Parent task', async () => {}, 'en', 2);
  withChildren.onOpen();
  assert.equal(withChildren.contentEl.getAttribute('data-child-count'), '2');
  assert.match(withChildren.contentEl.nodes.find(node => node.tag === 'p').textContent, /Parent task \[2\]/);
  const solo = new ConfirmDeleteModal({vault: {}}, 'Solo', async () => {}, 'en', 0);
  solo.onOpen();
  assert.equal(solo.contentEl.getAttribute('data-child-count'), null);
  assert.doesNotMatch(solo.contentEl.nodes.find(node => node.tag === 'p').textContent, /\[0\]/);

  // Anchored moves key the matrix by Task.id and do not rewrite the line.
  const ids = boot(fileSource);
  ids.view.onload();
  await ticks();
  const foreignA = bareTask({id: 'Notes/A.md#^abcd', anchor: 'abcd', path: 'Notes/A.md'});
  const foreignB = bareTask({id: 'Notes/B.md#^abcd', anchor: 'abcd', path: 'Notes/B.md'});
  ids.config.order.do = ['Notes/B.md#^abcd'];
  await ids.view.move(foreignA, 'do', foreignB);
  assert.equal(ids.edits.length, 0);
  assert.equal(ids.writes.length, 1);
  assert.equal(ids.writes[0].assignments['Notes/A.md#^abcd'], 'do');
  assert.equal(ids.writes[0].assignments.abcd, undefined);
  assert.deepEqual(ids.writes[0].order.do, ['Notes/A.md#^abcd', 'Notes/B.md#^abcd']);
  await ids.view.move(foreignB, 'schedule');
  assert.equal(ids.edits.length, 0);
  assert.equal(ids.writes[1].assignments['Notes/B.md#^abcd'], 'schedule');
  assert.equal(ids.writes[1].assignments.abcd, undefined);

  const plain = bareTask({id: 'scratch-line', anchor: null});
  ids.io.editResult = 'em-created01';
  await ids.view.move(plain, 'eliminate');
  assert.equal(ids.edits.length, 1);
  assert.equal(ids.edits[0].anchor, null);
  assert.deepEqual(ids.edits[0].change, {});
  assert.equal(ids.writes[2].assignments['em-created01'], 'eliminate');
  assert.equal(ids.writes[2].assignments['scratch-line'], undefined);

  ids.io.editResult = 'abcd';
  ids.config.assignments = {'Notes/A.md#^abcd': 'do', abcd: 'do', keep: 'schedule'};
  ids.config.order.do = ['Notes/A.md#^abcd', 'abcd'];
  ids.config.order.schedule = ['keep'];
  ids.config.order.delegate = [];
  ids.config.order.eliminate = [];
  ids.config.order.inbox = [];
  await ids.view.changeTask(foreignA, {remove: true});
  assert.equal(ids.edits[ids.edits.length - 1].change.remove, true);
  const removed = ids.writes[ids.writes.length - 1];
  assert.equal(removed.assignments['Notes/A.md#^abcd'], undefined);
  assert.equal(removed.assignments.abcd, undefined);
  assert.equal(removed.assignments.keep, 'schedule');
  assert.deepEqual(removed.order.do, []);
  assert.deepEqual(removed.order.schedule, ['keep']);

  const em = bareTask({id: 'em-sameanchor', anchor: 'em-sameanchor'});
  ids.io.editResult = 'em-sameanchor';
  ids.config.assignments = {'em-sameanchor': 'delegate', other: 'do'};
  ids.config.order.do = ['other'];
  ids.config.order.schedule = [];
  ids.config.order.delegate = ['em-sameanchor'];
  ids.config.order.eliminate = [];
  ids.config.order.inbox = [];
  const writesBeforeDone = ids.writes.length;
  await ids.view.changeTask(em, {done: true});
  assert.equal(ids.edits[ids.edits.length - 1].change.done, true);
  assert.equal(ids.writes.length, writesBeforeDone);
  await ids.view.changeTask(em, {remove: true});
  const emRemoved = ids.writes[ids.writes.length - 1];
  assert.equal(emRemoved.assignments.other, 'do');
  assert.equal(emRemoved.assignments['em-sameanchor'], undefined);
  assert.deepEqual(emRemoved.order.do, ['other']);
  assert.deepEqual(emRemoved.order.delegate, []);
  ids.view.onunload();

  console.log('PASS view: queued actions, queue error continues, source folder refresh, assignment ids, filtered vault refresh, no refresh after unload');
})().catch(error => { console.error(error); process.exitCode = 1; });
