import { homedir } from "os";
import path from "path";
import { runInThisContext } from "vm";
import { QuickInputButton, QuickPickItem, QuickPickItemKind, Tab, TabInputCustom, TabInputNotebook, TabInputNotebookDiff, TabInputTerminal, TabInputText, TabInputTextDiff, TabInputWebview, ThemeIcon, TreeItem, Uri, window, workspace } from "vscode";

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

type TabInputUnion = FileTabInput | GitDiffTabInput | MagitTabInput;

class QuickTabItem implements QuickPickItem {
  constructor(private readonly _tab: Tab) {
    this._input = this._initInput();
  }

  private _input: TabInputUnion | null = null;
  private _initInput(): TabInputUnion | null {
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

    return null;
  }

  get label(): string {
    return this._tab.label;
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

export class QuickTabPicker {
  readonly _inner = window.createQuickPick<QuickTabItem>();
  readonly _items = new Array<QuickTabItem>();

  constructor() {
    const tabGroups = window.tabGroups.all;

    for (const group of tabGroups) {
      for (const tab of group.tabs) {
        this._items.push(new QuickTabItem(tab));
      }
    }

    this._inner.items = this._items;
    this._inner.show();
  }

  destroy(): void {
    this._inner.dispose();
  }
}

