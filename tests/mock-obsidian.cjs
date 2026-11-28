/* Standalone test mock. Not bundled into the plugin. */
const Module = require('node:module');
const notices = [];
const mock = {
  notices, settings: [], lastPicker: null, language: 'ru',
  getLanguage(){return mock.language;},
  normalizePath: path => path.replace(/\\/g, "/"),
  TFile: class TFile {
    constructor(path) { this.path=path; this.extension=path.split('.').at(-1); }
  },
  TFolder: class TFolder { constructor(path) { this.path=path; } },
  Notice: class Notice { constructor(message) { notices.push(message); } },
};
mock.Modal = class Modal {
  constructor(app) {
    this.app=app;
    this.contentEl={
      attrs: {},
      nodes: [],
      empty(){ mock.settings.length=0; this.nodes=[]; },
      createEl(tag, opts){
        const node={tag, textContent: opts && opts.text != null ? String(opts.text) : '', createEl(){return {};}};
        this.nodes.push(node);
        return node;
      },
      setAttribute(name, value){ this.attrs[name]=String(value); },
      getAttribute(name){ return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
    };
  }
  open(){this.onOpen?.();}
  close(){this.onClose?.();}
};
mock.FuzzySuggestModal = class FuzzySuggestModal extends mock.Modal {
  setPlaceholder(v){this.placeholder=v;}
  open(){mock.lastPicker=this;}
};
mock.Setting = class Setting {
  constructor(contentEl){
    // Node does not apply styles.css. Mirror .em-setting-hidden so existing display assertions still observe visibility.
    this.settingEl={
      style:{display:''},
      _classes:new Set(),
      toggleClass(name, value){
        const names=Array.isArray(name) ? name : String(name).split(/\s+/);
        for (const cls of names) {
          if (!cls) continue;
          if (value) this._classes.add(cls); else this._classes.delete(cls);
          if (cls==='em-setting-hidden') this.style.display=value ? 'none' : '';
        }
      },
      addClass(...names){ for (const name of names) this.toggleClass(name, true); },
      removeClass(...names){ for (const name of names) this.toggleClass(name, false); }
    };
    this.components=[];
    mock.settings.push(this);
  }
  setName(name){this.name=name;return this;}
  setDesc(text){this.desc=text;return this;}
  setClass(text){this.className=text;return this;}
  addText(cb){const c={value:'',inputEl:{focus(){}},setValue(v){this.value=v;return this;},setPlaceholder(v){this.placeholder=v;return this;},onChange(f){this.onChanged=f;return this;}};cb(c);this.text=c;return this;}
  addDropdown(cb){const c={value:'',options:[],addOption(v,t){this.options.push([v,t]);return this;},setValue(v){this.value=v;return this;},onChange(f){this.onChanged=f;return this;},change(v){this.value=v;this.onChanged(v);}};cb(c);this.dropdown=c;return this;}
  addToggle(cb){const c={value:false,setValue(v){this.value=v;return this;},onChange(f){this.onChanged=f;return this;}};cb(c);this.toggle=c;return this;}
  addButton(cb){const c={setButtonText(v){this.label=v;return this;},setCta(){return this;},setWarning(){return this;},onClick(f){this.click=f;return this;}};cb(c);this.buttons??=[];this.buttons.push(c);return this;}
  addExtraButton(cb){const c={setIcon(){return this;},setTooltip(){return this;},onClick(f){this.click=f;return this;}};cb(c);this.extra=c;return this;}
};
mock.Component = class Component {
  constructor(){ this._children=[]; this._events=[]; this.loaded=false; this.unloadCount=0; }
  load(){
    if (this.loaded) return;
    this.loaded=true;
    this.onload();
    for (const child of [...this._children]) child.load();
  }
  onload(){}
  onunload(){}
  unload(){
    const children=this._children.splice(0);
    for (const child of children) child.unload();
    this._events=[];
    this.unloadCount++;
    if (this.loaded) { this.loaded=false; this.onunload(); }
  }
  addChild(child){ this._children.push(child); if (this.loaded) child.load(); return child; }
  removeChild(child){
    const index=this._children.indexOf(child);
    if (index>=0) this._children.splice(index, 1);
    child.unload();
    return child;
  }
  register(cb){ this._events.push(cb); }
  registerEvent(ref){ this._events.push(ref); return ref; }
};
mock.MarkdownRenderChild = class MarkdownRenderChild extends mock.Component {
  constructor(containerEl){ super(); this.containerEl=containerEl; }
};
mock.MarkdownRenderer = class MarkdownRenderer extends mock.MarkdownRenderChild {
  static async render(_app, markdown, el, _sourcePath, component){
    const child=new mock.MarkdownRenderChild(el);
    if (component && typeof component.addChild==='function') component.addChild(child);
    if (el && typeof el.setText==='function') el.setText(String(markdown ?? ''));
    else if (el) el.textContent=String(markdown ?? '');
    return child;
  }
};
mock.Menu = class Menu {
  constructor(){ this.items=[]; }
  addItem(cb){
    const item={title:'', setTitle(v){this.title=v;return this;}, setIcon(){return this;}, onClick(fn){this.click=fn;return this;}};
    cb(item);
    this.items.push(item);
    return this;
  }
  addSeparator(){ return this; }
  showAtMouseEvent(){}
};
mock.install=()=>{
  const old=Module._load;
  Module._load=function(request,parent,isMain){ if(request==='obsidian')return mock;return old.apply(this,arguments); };
  return ()=>{Module._load=old;};
};
module.exports=mock;
