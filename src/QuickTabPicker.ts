import { homedir } from "os";
import path from "path";
import { runInThisContext } from "vm";
import { QuickInputButton, QuickPickItem, QuickPickItemKind, Tab, TabInputCustom, TabInputNotebook, TabInputNotebookDiff, TabInputTerminal, TabInputText, TabInputTextDiff, TabInputWebview, ThemeColor, ThemeIcon, TreeItem, Uri, commands, window, workspace } from "vscode";

type TabInputType = TabInputText | TabInputTextDiff | TabInputCustom | TabInputWebview | TabInputNotebook | TabInputNotebookDiff | TabInputTerminal;

interface FileTabInput {
  type: "file";
  inner: TabInputText;
}

interface GitDiffTabInput {
  type: "git";
  inner: TabInputTextDiff;
}

interface MagitTabInput {
  type: "magit";
  inner: TabInputText;
}

interface InputTypeOther {
  type: "other";
  uri: Uri;
}

type TabInputUnion = FileTabInput | GitDiffTabInput | MagitTabInput | InputTypeOther;

class QuickTabItem implements QuickPickItem {
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

window.tabGroups.onDidChangeTabs(event => {
  if (!inQuickTab) {
    const tab = window.tabGroups.activeTabGroup.activeTab;
    if (tab) {
      lastActiveTabIdent = tab.label;
    }
  }
});

export let lastActiveTabIdent: string | null = null;
export let inQuickTab = false;
export function setInQuickTabStatus(status: boolean) {
  commands.executeCommand("setContext", "inQuickTab", status);
  inQuickTab = status;
}

export class QuickTabPicker {
  readonly _inner = window.createQuickPick<QuickTabItem>();
  readonly _items = new Array<QuickTabItem>();

  constructor() {
    setInQuickTabStatus(true);

    this._inner.items = this._getTabItems();
    this._inner.onDidChangeActive((items) => this._onDidChangeActive(items as any));
    this._inner.onDidAccept(() => this.destroy());
    this._inner.show();
  }

  destroy(): void {
    setInQuickTabStatus(false);
    this._inner.dispose();
  }

  private _onDidChangeActive(items: QuickTabItem[]) {
    const item = items[0];
    const input = item.input;

    if (!input || input.type === "git") {
      throw new Error("Items that cannot be switched to should be hidden");
    }

    // TODO: Do we have a way of opening the actual diff?
    // if (input.type == "git") {
    //   window.showTextDocument(input.inner.modified, { preserveFocus: true });
    //   return;
    // }

    if (input.type == "file" || input.type === "magit") {
      window.showTextDocument(input.inner.uri, { preserveFocus: true });
      return;
    };

    window.showTextDocument(input.uri, { preserveFocus: true });
  }

  private _getTabItems(): QuickTabItem[] {
    const tabGroups = window.tabGroups.all;
    const files: QuickPickItem[] = [];
    const diffs: QuickPickItem[] = [];
    const other: QuickPickItem[] = [];
    let mostRecent: QuickTabItem | null = null;
    let activeItem: QuickTabItem | null = null;

    for (const group of tabGroups) {
      for (const tab of group.tabs) {
        const item = new QuickTabItem(tab);

        if (group.isActive && tab.isActive) {
          activeItem = item;
        }

        if (item.ident === lastActiveTabIdent) {
          mostRecent = item;
        } else if (item.type === "file") {
          files.push(item);
        } else if (item.type === "other" || item.type === 'magit') {
          other.push(item);;
        } else if (item.type === "git") {
          diffs.push(item);
        }
      }
    }

    if (activeItem == null) {
      throw new Error("Active tab not found");
    }

    lastActiveTabIdent = activeItem.ident;

    const sorted: QuickPickItem[] = [];

    if (mostRecent) {
      sorted.push({
        label: "Last",
        kind: QuickPickItemKind.Separator
      });
      sorted.push(mostRecent);
    }

    sorted.push({
      label: "Text",
      kind: QuickPickItemKind.Separator
    });
    sorted.push(...files);

    // TODO: Do we have a way of opening the actual diff?
    // sorted.push({
    //   label: "Git",
    //   kind: QuickPickItemKind.Separator
    // });
    // sorted.push(...diffs);

    sorted.push({
      label: "Other",
      kind: QuickPickItemKind.Separator
    });
    sorted.push(...other);

    // Ok, should not be able to select separators
    return sorted as any;
  }
}

