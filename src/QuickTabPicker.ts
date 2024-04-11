import { homedir } from "os";
import path from "path";
import { QuickInputButton, QuickPickItem, QuickPickItemKind, Tab, commands, window, workspace } from "vscode";
import { TabInputType, TabInputUnion } from "./TabInputUnion";

const showCurrentTab = false;

export class QuickTabItem implements QuickPickItem {
  constructor(private readonly _tab: Tab) {
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

    const input = this.input;;
    switch (input.type) {
      case "file": {
        const uri = input.inner.uri;
        const workspaceFolder = workspace.getWorkspaceFolder(uri);
        if (workspaceFolder) {
          return path.relative(workspaceFolder.uri.path, uri.path);
        }

        if (uri.path.includes("home")) {
          return "~/" + path.relative(homedir(), uri.path);
        }
        break;
      }

      case "git": {
        const uri = input.inner.modified;
        const workspaceFolder = workspace.getWorkspaceFolder(uri);
        if (workspaceFolder) {
          return "git://" + path.relative(workspaceFolder.uri.path, uri.path);
        }

        if (uri.path.includes("home")) {
          return "git:~/" + path.relative(homedir(), uri.path);
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


let currentActiveTabIdent = window.tabGroups.activeTabGroup.activeTab?.label;
let lastActiveTabIdent: string | undefined;

window.tabGroups.onDidChangeTabs(event => {
  const tab = window.tabGroups.activeTabGroup.activeTab;

  if (tab) {
    // We can get this event fired for the same tab multiple times
    if (tab.label === currentActiveTabIdent) {
      return;
    }
    const item = new QuickTabItem(tab);
    lastActiveTabIdent = currentActiveTabIdent
    currentActiveTabIdent = tab.label;
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

      //lastActiveTabIdent = ident;

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

    for (const group of tabGroups) {
      for (const tab of group.tabs) {
        const item = new QuickTabItem(tab);

        if (!showCurrentTab && item.isActive) {
          continue;
        }

        if (item.ident === lastActiveTabIdent) {
          mostRecent = item;
        }
        else if (tab.isPinned) {
          pinned.push(item);
        }
        else if (item.type === "file") {
          files.push(item);
        } else if (item.type === "other" || item.type === 'magit' || item.type === "settings" || item.type === "keybindings") {
          other.push(item);;
        } else if (item.type === "git") {
          diffs.push(item);
        }
      }
    }

    const sorted: QuickPickItem[] = [];

    if (mostRecent) {
      sorted.push({
        label: "Last",
        kind: QuickPickItemKind.Separator
      });
      sorted.push(mostRecent);
    };

    sorted.push({
      label: "Pins",
      kind: QuickPickItemKind.Separator
    });
    sorted.push(...pinned);

    sorted.push({
      label: "Text",
      kind: QuickPickItemKind.Separator
    });
    sorted.push(...files);

    // TODO: Do we have a way of opening the actual diff?
    sorted.push({
      label: "Git",
      kind: QuickPickItemKind.Separator
    });
    sorted.push(...diffs);

    sorted.push({
      label: "Other",
      kind: QuickPickItemKind.Separator
    });
    sorted.push(...other);

    // Ok, should not be able to select separators
    return sorted as any;
  }
}

