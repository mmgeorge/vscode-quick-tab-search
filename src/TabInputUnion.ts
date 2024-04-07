import { TabInputCustom, TabInputNotebook, TabInputNotebookDiff, TabInputTerminal, TabInputText, TabInputTextDiff, TabInputWebview, Uri } from "vscode";

export type TabInputType = TabInputText | TabInputTextDiff | TabInputCustom | TabInputWebview | TabInputNotebook | TabInputNotebookDiff | TabInputTerminal;
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
interface SettingsTabInput {
  type: "settings";
}
interface KeybindingsTabInput {
  type: "keybindings";
}
interface InputTypeOther {
  type: "other";
  uri: Uri;
}
export type TabInputUnion = FileTabInput | GitDiffTabInput | MagitTabInput | InputTypeOther | SettingsTabInput | KeybindingsTabInput;
