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
      empty(){ mock.settings.length=0; },
      createEl(){ return {textContent: '', createEl(){return {};}}; }
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
  constructor(contentEl){this.settingEl={style:{}};this.components=[];mock.settings.push(this);}
  setName(name){this.name=name;return this;}
  setDesc(text){this.desc=text;return this;}
  setClass(text){this.className=text;return this;}
  addText(cb){const c={value:'',inputEl:{focus(){}},setValue(v){this.value=v;return this;},setPlaceholder(v){this.placeholder=v;return this;},onChange(f){this.onChanged=f;return this;}};cb(c);this.text=c;return this;}
  addDropdown(cb){const c={value:'',options:[],addOption(v,t){this.options.push([v,t]);return this;},setValue(v){this.value=v;return this;},onChange(f){this.onChanged=f;return this;},change(v){this.value=v;this.onChanged(v);}};cb(c);this.dropdown=c;return this;}
  addToggle(cb){const c={value:false,setValue(v){this.value=v;return this;},onChange(f){this.onChanged=f;return this;}};cb(c);this.toggle=c;return this;}
  addButton(cb){const c={setButtonText(v){this.label=v;return this;},setCta(){return this;},setWarning(){return this;},onClick(f){this.click=f;return this;}};cb(c);this.buttons??=[];this.buttons.push(c);return this;}
  addExtraButton(cb){const c={setIcon(){return this;},setTooltip(){return this;},onClick(f){this.click=f;return this;}};cb(c);this.extra=c;return this;}
};
mock.install=()=>{
  const old=Module._load;
  Module._load=function(request,parent,isMain){ if(request==='obsidian')return mock;return old.apply(this,arguments); };
  return ()=>{Module._load=old;};
};
module.exports=mock;
