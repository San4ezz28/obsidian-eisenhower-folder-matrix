import { App, Component, MarkdownRenderChild, MarkdownRenderer, Menu, Notice, TFile } from "obsidian";
import { getTaskZone, isPathInside, moveAssignment, normalizeVaultPath, orderedTasks } from "./core";
import { ConfirmDeleteModal, MatrixFormModal, TaskInputModal } from "./modals";
import { MatrixStore } from "./store";
import { MatrixConfig, Quadrant, QUADRANTS, Task, Zone, ZONES } from "./types";
import { t, type TranslationKey } from "./i18n";

export interface MatrixHost {
  app: App;
  store: MatrixStore;
  openTask(task: Task): Promise<void>;
}

export class MatrixView extends MarkdownRenderChild {
  private timer: number | undefined;
  private file: TFile | undefined;
  private config: MatrixConfig | undefined;
  private tasks: Task[] = [];
  private active: Quadrant = "do";
  private actionTail: Promise<void> = Promise.resolve();
  private actionDepth = 0;
  private unloaded = false;
  private completedOpen = false;
  private serial = 0;
  private seenDuplicateIds = new Set<string>();
  /** One parent for MarkdownRenderer children of the current draw. Replaced on each render. */
  private renderComponent = new Component();
  private tr(key: TranslationKey, params: Record<string, string | number> = {}): string {
    return t(key, this.config?.language || "auto", params);
  }

  constructor(private host: MatrixHost, private root: HTMLElement, private id: string, private preferredPath: string) {
    super(root);
    root.addClass("em-root");
  }

  onload(): void {
    this.registerEvent(this.host.app.vault.on("modify", file => { this.onVaultFile(file); }));
    this.registerEvent(this.host.app.vault.on("create", file => { this.onVaultFile(file); }));
    this.registerEvent(this.host.app.vault.on("delete", file => { this.onVaultFile(file); }));
    this.registerEvent(this.host.app.vault.on("rename", (file, oldPath) => { this.onVaultFile(file, oldPath); }));
    void this.refresh();
  }
  onunload(): void {
    this.unloaded = true;
    this.serial++;
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
    this.renderComponent.unload();
  }
  /** Matrix note, configured source, or a still-unloaded config. Rename checks both paths. */
  private onVaultFile(file: { path: string } | null | undefined, oldPath?: string): void {
    if (this.pathAffectsView(file?.path) || (oldPath !== undefined && this.pathAffectsView(oldPath)))
      this.scheduleRefresh();
  }
  private pathAffectsView(path: string | undefined): boolean {
    if (!this.config || path === undefined) return true;
    if (path === this.file?.path || path === this.preferredPath) return true;
    const source = this.config.source;
    if (source.kind === "file") return path === source.path;
    // isPathInside is false for the folder path itself. Creating, deleting, or renaming that folder still refreshes.
    return normalizeVaultPath(path) === normalizeVaultPath(source.path)
      || isPathInside(path, source.path, source.recursive);
  }
  private scheduleRefresh(delay = 200): void {
    if (this.unloaded) return;
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      if (this.unloaded || this.actionDepth > 0) return;
      void this.refresh();
    }, delay);
  }
  private async refresh(): Promise<void> {
    if (this.unloaded) return;
    const serial = ++this.serial;
    try {
      const file = await this.host.store.findMatrix(this.id, this.file?.path || this.preferredPath);
      const config = await this.host.store.loadMatrix(file, this.id);
      if (serial !== this.serial || this.unloaded) return;
      this.file = file;
      this.config = config; // Allow source settings to be fixed even if the source is missing.
      const tasks = await this.host.store.loadTasks(config.source);
      if (serial !== this.serial || this.unloaded) return;
      this.tasks = tasks;
      const count = new Map<string, number>();
      for (const task of tasks) if (task.anchor) count.set(task.anchor, (count.get(task.anchor) || 0) + 1);
      this.seenDuplicateIds = new Set([...count].filter(([, n]) => n > 1).map(([id]) => id));
      this.render();
    } catch (e) {
      if (serial !== this.serial || this.unloaded) return;
      this.root.empty();
      const error = this.root.createDiv({ cls: "em-error" });
      error.createEl("strong", { text: this.tr("matrixLoadError") });
      error.createEl("p", { text: e instanceof Error ? e.message : String(e) });
      const retry = error.createEl("button", { text: this.tr("retry") });
      this.bind(retry, "click", () => void this.refresh());
      if (this.file && this.config) {
        const settings = error.createEl("button", { text: this.tr("editSource"), cls: "em-action-btn" });
        this.bind(settings, "click", () => this.settings());
      }
    }
  }
  private bind<K extends keyof HTMLElementEventMap>(element: HTMLElement, event: K,
    handler: (e: HTMLElementEventMap[K]) => void): void {
    // Dynamic elements are discarded on redraw; do not retain listeners in Component.
    element.addEventListener(event, handler as EventListener);
  }
  private notify(error: unknown): void {
    console.error("[Eisenhower Folder Matrix]", error);
    new Notice(error instanceof Error ? error.message : String(error), 8000);
  }
  private action(operation: () => Promise<void>): Promise<void> {
    this.actionDepth++;
    const job = this.actionTail.then(async () => {
      try { await operation(); }
      catch (e) { this.notify(e); }
      finally {
        this.actionDepth--;
        if (this.actionDepth === 0) this.scheduleRefresh(70);
      }
    });
    this.actionTail = job.then(() => undefined, () => undefined);
    return job;
  }
  private requireConfig(): { config: MatrixConfig; file: TFile } {
    if (!this.file || !this.config) throw new Error(this.tr("configNotLoaded"));
    return { config: this.config, file: this.file };
  }
  private checkId(task: Task): void {
    if (task.anchor && this.seenDuplicateIds.has(task.anchor))
      throw new Error(this.tr("duplicateId"));
  }
  private async move(task: Task, destination: Zone, before?: Task): Promise<void> {
    await this.action(async () => {
      this.checkId(task);
      const { file } = this.requireConfig();
      let id: string;
      try {
        // Anchored lines keep Task.id as the matrix key (path#^id for a foreign anchor).
        // A quadrant move must not rewrite a line that already has its anchor.
        id = task.anchor ? task.id : await this.host.store.editTask(task, {});
      } catch (error) {
        throw new Error(this.tr("attachTaskError", {error: error instanceof Error ? error.message : String(error)}));
      }
      try {
        await this.host.store.updateMatrix(file, this.id,
          current => moveAssignment(current, id, destination, before?.id));
      } catch (error) {
        throw new Error(this.tr("writeQuadrantError", {error: error instanceof Error ? error.message : String(error)}));
      }
    });
  }
  private async changeTask(task: Task, change: {done?: boolean; text?: string; remove?: boolean}): Promise<void> {
    await this.action(async () => {
      this.checkId(task);
      const id = await this.host.store.editTask(task, change);
      if (change.remove) {
        const { file } = this.requireConfig();
        const keys = new Set([task.id, id]);
        await this.host.store.updateMatrix(file, this.id, current => {
          const next = { ...current, assignments: {...current.assignments}, order: {...current.order} };
          for (const key of keys) delete next.assignments[key];
          for (const zone of ZONES) next.order[zone] = next.order[zone].filter(x => !keys.has(x));
          return next;
        });
      }
    });
  }
  private newTask(zone: Zone): void {
    const { config, file } = this.requireConfig();
    const defaultFile = config.source.kind === "file" ? null : config.inboxFile || "";
    new TaskInputModal(this.host.app, this.tr("newTask"), "", zone, defaultFile, async (text, target, path) => {
      this.checkSourceFile(path);
      await this.action(async () => {
        const id = await this.host.store.createTask(config, text, path || undefined);
        if (target && target !== "inbox") await this.host.store.updateMatrix(file, this.id, current => moveAssignment(current, id, target));
      });
    }, config.source, config.language).open();
  }
  private checkSourceFile(path: string | null): void {
    if (path === null) return;
    const cfg = this.requireConfig().config;
    if (cfg.source.kind === "folder" && !isPathInside(path, cfg.source.path, cfg.source.recursive))
      throw new Error(this.tr("sourceOutOfScope"));
  }
  private editTask(task: Task): void {
    new TaskInputModal(this.host.app, this.tr("editTask"), task.text, null, null,
      async (text) => this.changeTask(task, {text}), undefined, this.config?.language).open();
  }
  private settings(): void {
    const { config, file } = this.requireConfig();
    new MatrixFormModal(this.host.app, config, async next => {
      await this.host.store.sourceFiles(next.source); // validate before writing
      if (next.source.kind === "folder" && next.inboxFile &&
          !isPathInside(next.inboxFile, next.source.path, next.source.recursive))
        throw new Error(this.tr("targetOutsideSource"));
      await this.host.store.updateMatrix(file, this.id, current => ({
        ...current, source: next.source, inboxFile: next.inboxFile, subtasks: next.subtasks, language: next.language
      }));
      this.scheduleRefresh(100);
    }).open();
  }
  private render(): void {
    this.renderComponent.unload();
    this.renderComponent = new Component();
    this.renderComponent.load();
    const config = this.config!;
    const root = this.root;
    root.empty();
    const header = root.createDiv({ cls: "em-header" });
    header.createEl("h3", { text: this.tr("matrixTitle") });
    const actions = header.createDiv({ cls: "em-header-actions" });
    const add = actions.createEl("button", { cls: "em-action-btn", text: this.tr("addTask") });
    this.bind(add, "click", () => this.newTask("inbox"));
    const settings = actions.createEl("button", { cls: "em-action-btn", text: "⚙ " + this.tr("settings") });
    this.bind(settings, "click", () => this.settings());

    const tabs = root.createDiv({ cls: "em-mobile-tabs" });
    for (const q of QUADRANTS) {
      const count = this.visibleRootTasks().filter(t => getTaskZone(t, config) === q).length;
      const tab = tabs.createEl("button", { text: `${this.shortName(q)} · ${count}`, cls: `em-tab ${q === this.active ? "em-tab-active" : ""}` });
      this.bind(tab, "click", () => { this.active = q; this.render(); });
    }

    const grid = root.createDiv({ cls: "em-grid" });
    const roots = this.visibleRootTasks();
    for (const q of QUADRANTS) this.makeZone(grid, q, roots.filter(t => getTaskZone(t, config) === q));
    this.makeZone(root, "inbox", roots.filter(t => getTaskZone(t, config) === "inbox"));
    this.renderCompleted(root);
    if (this.seenDuplicateIds.size) root.createDiv({ cls: "em-warning", text: this.tr("duplicatesWarning") });
  }
  private shortName(q: Quadrant): string {
    return this.tr((({ do: "shortDo", schedule: "shortSchedule", delegate: "shortDelegate", eliminate: "shortEliminate" } as const)[q]));
  }
  private visibleRootTasks(): Task[] {
    const config = this.config!;
    const active = this.tasks.filter(t => !t.done);
    if (config.subtasks === "separate") return active;
    const byId = new Map(this.tasks.map(t => [t.id, t]));
    if (config.subtasks === "hidden") return active.filter(t => !t.parentId);
    // In nested mode child tasks are rendered inside their nearest unfinished ancestor.
    // A child of a completed parent becomes a visible root, so it won't be lost.
    return active.filter(t => !t.parentId || !byId.get(t.parentId) || Boolean(byId.get(t.parentId)?.done));
  }
  private makeZone(container: HTMLElement, zone: Zone, items: Task[]): void {
    const config = this.config!;
    const panel = container.createDiv({ cls: `em-zone em-${zone} ${zone === this.active ? "em-active" : ""}` });
    const heading = panel.createDiv({ cls: "em-zone-heading" });
    heading.createEl("strong", { text: this.tr(zone) });
    const toolbar = heading.createDiv({ cls: "em-zone-toolbar" });
    toolbar.createEl("span", { text: String(items.length), cls: "em-count" });
    const plus = toolbar.createEl("button", { cls: "em-plus", text: "+", attr: { "aria-label": this.tr("addTo", {zone: this.tr(zone)}) } });
    this.bind(plus, "click", () => this.newTask(zone));
    const list = panel.createDiv({ cls: "em-zone-list" });
    const sorted = orderedTasks(items, zone, config);
    if (!sorted.length) list.createDiv({cls: "em-empty", text: this.tr("dragToZone")});
    for (const item of sorted) this.makeCard(list, item, 0, zone);
    this.bind(panel, "dragover", e => { e.preventDefault(); panel.addClass("em-drag-over"); });
    this.bind(panel, "dragleave", e => {
      if (!(e.relatedTarget instanceof Node) || !panel.contains(e.relatedTarget)) panel.removeClass("em-drag-over");
    });
    this.bind(panel, "drop", e => {
      e.preventDefault(); panel.removeClass("em-drag-over");
      const id = e.dataTransfer?.getData("text/plain");
      const task = this.tasks.find(t => t.id === id && !t.done);
      if (task) void this.move(task, zone);
    });
  }
  private openCardMenu(event: MouseEvent, task: Task, canMove: boolean): void {
    const menu = new Menu();
    if (canMove) {
      for (const zone of ZONES) {
        menu.addItem(item => item.setTitle(this.tr("moveTo", {zone: this.tr(zone)}))
          .setIcon("arrow-right").onClick(() => { void this.move(task, zone); }));
      }
      menu.addSeparator();
    }
    menu.addItem(item => item.setTitle(this.tr("editText")).setIcon("pencil")
      .onClick(() => this.editTask(task)));
    menu.addItem(item => item.setTitle(this.tr("openSource")).setIcon("file-text")
      .onClick(() => { void this.host.openTask(task).catch(err => this.notify(err)); }));
    const childCount = this.tasks.filter(t => t.parentId === task.id).length;
    menu.addItem(item => item.setTitle(this.tr("deleteTask")).setIcon("trash-2")
      .onClick(() => new ConfirmDeleteModal(this.host.app, task.text,
        () => this.changeTask(task, {remove: true}), this.config?.language, childCount).open()));
    menu.showAtMouseEvent(event);
  }

  private makeCard(holder: HTMLElement, task: Task, depth: number, zone?: Zone): void {
    const config = this.config!;
    const card = holder.createDiv({ cls: "em-card" });
    if (depth) card.addClass("em-subtask");
    if (task.done) card.addClass("em-card-done");
    const canMove = depth === 0 && !task.done;
    const row = card.createDiv({ cls: "em-card-row" });
    if (canMove) {
      card.draggable = true;
      row.createSpan({text: "⠿", cls: "em-grip", attr: {title: this.tr("dragCard")}});
      this.bind(card, "dragstart", e => {
        e.dataTransfer?.setData("text/plain", task.id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      });
      this.bind(card, "dragover", e => e.preventDefault());
      this.bind(card, "drop", e => {
        e.preventDefault(); e.stopPropagation();
        const id = e.dataTransfer?.getData("text/plain");
        const moving = this.tasks.find(t => t.id === id && !t.done);
        if (moving && id !== task.id && zone) void this.move(moving, zone, task);
      });
    } else row.createSpan({ text: "•", cls: "em-grip-muted" });

    const checkbox = row.createEl("input", {
      type: "checkbox",
      attr: { "aria-label": task.done ? this.tr("markOpen") : this.tr("markDone") }
    });
    checkbox.checked = task.done;
    this.bind(checkbox, "change", () => void this.changeTask(task, {done: checkbox.checked}));

    const content = row.createDiv({ cls: "em-card-content" });
    const textEl = content.createDiv({ cls: "em-card-text" });
    // Render links, bold text and Obsidian ==highlights== as Markdown, not raw markers.
    void MarkdownRenderer.render(this.host.app, task.text, textEl, task.path, this.renderComponent)
      .catch(() => { textEl.setText(task.text); });
    const basename = task.path.split("/").pop() || task.path;
    const sourceLabel = task.group ? `${task.group} · ${basename}` : basename;
    content.createDiv({text: sourceLabel, cls: "em-card-source",
      attr: {title: this.tr("sourceLine", {path: task.path, line: task.line + 1})}});

    const more = row.createEl("button", { text: "⋯", cls: "em-card-menu", attr: {
      title: this.tr("actions"), "aria-label": this.tr("actions") } });
    this.bind(more, "click", e => { e.preventDefault(); e.stopPropagation();
      this.openCardMenu(e as MouseEvent, task, canMove); });
    this.bind(card, "dblclick", e => { if (e.target === card || e.target === textEl) this.editTask(task); });

    if (config.subtasks === "nested" && !task.done) {
      const children = this.tasks.filter(t => t.parentId === task.id && !t.done)
        .sort((a, b) => a.line - b.line);
      if (children.length) {
        const childHolder = card.createDiv({ cls: "em-children" });
        for (const child of children) this.makeCard(childHolder, child, depth + 1, zone);
      }
    }
  }
  private renderCompleted(root: HTMLElement): void {
    const done = this.tasks.filter(t => t.done).sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
    const details = root.createEl("details", { cls: "em-completed" });
    const summary = details.createEl("summary");
    summary.createSpan({ text: "✓ " + this.tr("completed", {count: done.length}) });
    let rendered = false;
    const showDone = (): void => {
      if (rendered) return;
      rendered = true;
      if (!done.length) {
        details.createDiv({ text: this.tr("noCompleted"), cls: "em-empty" });
        return;
      }
      const list = details.createDiv({ cls: "em-completed-list" });
      for (const task of done) this.makeCard(list, task, 0);
    };
    // Remember the open state, but skip Markdown cards until the section is actually open.
    this.bind(details, "toggle", () => {
      this.completedOpen = details.open;
      if (details.open) showDone();
    });
    details.open = this.completedOpen;
    if (details.open) showDone();
  }
}
