import { homedir } from "os";
import path from "path";
import { runInThisContext } from "vm";
import { QuickInputButton, QuickPickItem, QuickPickItemKind, Tab, TabInputCustom, TabInputNotebook, TabInputNotebookDiff, TabInputTerminal, TabInputText, TabInputTextDiff, TabInputWebview, ThemeColor, ThemeIcon, TreeItem, Uri, window, workspace } from "vscode";

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
}

type TabInputUnion = FileTabInput | GitDiffTabInput | MagitTabInput | InputTypeOther;

class QuickTabItem implements QuickPickItem {
  constructor(private readonly _tab: Tab) {
    this._input = this._initInput();
  }

  private _input: TabInputUnion;
  private _initInput(): TabInputUnion {
    const input = this._tab.input as any as TabInputType;

    if (input) {
      if ("uri" in input) {
        switch (input.uri.scheme) {
          case "file": return { type: "file", inner: input };
          case "magit": return { type: "magit", inner: input };
        }
      }

      else if ("modified" in input) {
        return {
          type: "git",
          inner: input
        };
      }
    }

    return { type: "other" };
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

  get type(): TabInputUnion["type"] {
    return this._input.type;
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
    if (!this._input) {
      return;
    }

    const input = this._input;;
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

let lastActiveTabIdent: string | null = null;

export class QuickTabPicker {
  readonly _inner = window.createQuickPick<QuickTabItem>();
  readonly _items = new Array<QuickTabItem>();

  constructor() {
    const tabGroups = window.tabGroups.all;
    const files: QuickPickItem[] = [];
    const diffs: QuickPickItem[] = [];
    const other: QuickPickItem[] = [];
    let mostRecent: QuickTabItem | null = null;

    for (const group of tabGroups) {
      for (const tab of group.tabs) {
        const item = new QuickTabItem(tab);

        if (item.ident === lastActiveTabIdent) {
          mostRecent = item;
        } else if (item.type === "file") {
          files.push(item);
        } else if (item.type === "git") {
          diffs.push(item);
        } else {
          other.push(item);;
        }
      }
    }

    const sorted: QuickPickItem[] = [];

    if (mostRecent) {
      sorted.push({
        label: "Recent",
        kind: QuickPickItemKind.Separator
      });
      sorted.push(mostRecent);
    }

    sorted.push({
      label: "Text",
      kind: QuickPickItemKind.Separator
    });
    sorted.push(...files);

    sorted.push({
      label: "Git",
      kind: QuickPickItemKind.Separator
    });
    sorted.push(...diffs);

    sorted.push({
      label: "System",
      kind: QuickPickItemKind.Separator
    });
    sorted.push(...other);

    this._inner.items = sorted as any;
    this._inner.show();
  }

  destroy(): void {
    this._inner.dispose();
  }
}

