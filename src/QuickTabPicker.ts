import { statSync } from "fs";
import { homedir } from "os";
import path from "path";
import { QuickInputButton, QuickPickItem, Tab, commands, window, workspace } from "vscode";
import { TabInputType, TabInputUnion } from "./TabInputUnion";

const showCurrentTab = false;

export class QuickTabItem implements QuickPickItem {
  constructor(
    private readonly _tab: Tab,
    readonly lastUsed: number | null
  ) {
    this.input = this._initInput();
  }

  readonly input: TabInputUnion | null;
  private _initInput(): TabInputUnion | null {
    const input = this._tab.input as any as TabInputType;

    if (input) {
      if ("uri" in input) {
        switch (input.uri.scheme) {
          case "file": return { type: "file", inner: input };
          case "magit": return { type: "magit", inner: input };
        }

        return { type: "other", uri: input.uri };
      }

      if ("modified" in input) {
        return {
          type: "git",
          inner: input
        };
      }
    }

    if (this._tab.label === "Keyboard Shortcuts") {
      return { type: "keybindings" };
    }

    if (this._tab.label === "Settings") {
      return { type: "settings" };
    }

    // TODO: Do we have a way to switch to buffers that don't have a uri? I.e., system menus?
    return null;
  }

  get isActive(): Tab["isActive"] {
    return this._tab.isActive;
  }

  get isPinned(): Tab["isPinned"] {
    return this._tab.isPinned;
  }

  get isDirty(): Tab["isDirty"] {
    return this._tab.isDirty;
  }

  get type(): TabInputUnion["type"] | undefined {
    return this.input?.type;
  }

  get label(): string {
    const icon = this.isDirty ? "$(close-dirty) " : "      ";
    return `${icon}${this._tab.label}`;
  }

  get ident(): string {
    return this._tab.label;
  }

  get buttons(): QuickInputButton[] {
    if (this.isDirty) {
      // Color never changes if we do this
      // 
      // return [
      //   {
      //     tooltip: "Buffer has unsaved changes",
      //     iconPath: new ThemeIcon("close-dirty", new ThemeColor("button.hoverBackground")),
      //   }
      // ];
    }
    return [];
  }

  get description(): string | undefined {
    if (!this.input) {
      return;
    }

    const pin = this.isPinned ? "   $(pinned)" : "";

    const input = this.input;;
    switch (input.type) {
      case "file": {
        const uri = input.inner.uri;
        const workspaceFolder = workspace.getWorkspaceFolder(uri);
        if (workspaceFolder) {
          return path.relative(workspaceFolder.uri.path, uri.path);
        }

        if (uri.path.includes("home")) {
          return `~/` + path.relative(homedir(), uri.path) + `${pin}`;
        }
        break;
      }

      case "git": {
        const uri = input.inner.modified;
        const workspaceFolder = workspace.getWorkspaceFolder(uri);
        if (workspaceFolder) {
          return `git://` + path.relative(workspaceFolder.uri.path, uri.path) + `${pin}`;
        }

        if (uri.path.includes("home")) {
          return `git:~/` + path.relative(homedir(), uri.path) + `${pin}`;
        }
        break;
      }
    }
  }
}

export let inQuickTab = false;

export function setInQuickTabStatus(status: boolean) {
  commands.executeCommand("setContext", "inQuickTab", status);
  inQuickTab = status;
}

const tabToLastUsed = new Map<string, number>()
for (const group of window.tabGroups.all) {
  for (const tab of group.tabs) {
    const item = new QuickTabItem(tab, null);

    switch (item.input?.type) {
      case "file":
        const lastModified = statSync(item.input.inner.uri.fsPath).mtime.getTime();
        tabToLastUsed.set(item.ident, lastModified)
        break;
    }
  }
}

window.tabGroups.onDidChangeTabs(event => {
  for (const tab of event.closed) {
    tabToLastUsed.delete(tab.label);
  }

  for (const tab of event.changed) {
    tabToLastUsed.set(tab.label, Date.now());
  }
})

export class QuickTabPicker {
  readonly _inner = window.createQuickPick<QuickTabItem>();
  readonly _items = new Array<QuickTabItem>();

  constructor() {
    setInQuickTabStatus(true);

    this._inner.items = this._getTabItems();
    this._inner.onDidAccept(() => this._onDidAccept());
    this._inner.show();
  }

  destroy(): void {
    setInQuickTabStatus(false);
    this._inner.dispose();
  }

  private _onDidAccept() {
    const activeItems = this._inner.activeItems;

    if (activeItems.length !== 0) {
      const item = activeItems[0];
      const ident = window.tabGroups.activeTabGroup.activeTab?.label;
      if (ident === item.ident) {
        this.destroy();
        return;
      }

      // These are special cases. Ideally we would be able to reveal 
      // in onDidChangeActive item, but we can't as they are commands
      if (item.input) {
        if (item.input.type === "settings") {
          commands.executeCommand("workbench.action.openSettings");
        }
        else if (item.input.type === "keybindings") {
          commands.executeCommand("workbench.action.openGlobalKeybindings");
        }
        else if (item.input.type === "git") {
          commands.executeCommand("git.openChange", item.input.inner.original);
        }
        else if (item.input.type === "file" || item.input.type === "magit") {
          window.showTextDocument(item.input.inner.uri, { preserveFocus: false });
        }
        else {
          window.showTextDocument(item.input.uri, { preserveFocus: false });
        }
      }
    }

    this.destroy();
  }

  private _getTabItems(): QuickTabItem[] {
    const tabGroups = window.tabGroups.all;
    const files: QuickPickItem[] = [];
    const diffs: QuickPickItem[] = [];
    const other: QuickPickItem[] = [];
    const pinned: QuickPickItem[] = [];
    let mostRecent: QuickTabItem | null = null;
    let activeItem: QuickTabItem | null = null;

    const items = []

    for (const group of tabGroups) {
      for (const tab of group.tabs) {
        if (!showCurrentTab && tab.isActive) {
          continue;
        }
        const lastUsed = tabToLastUsed.get(tab.label) ?? null;

        items.push(new QuickTabItem(tab, lastUsed))
      }
    }

    const recentTabs = items
      .filter(item => item.lastUsed !== null)
      .sort((a, b) => b.lastUsed! - a.lastUsed!)

    const otherTab = items.filter(item => item.lastUsed === null);

    return [...recentTabs, ...otherTab]
  }
}

