import { ExtensionContext, commands, window } from "vscode";
import { QuickTabPicker } from "./QuickTabPicker";

let quickTabPicker: QuickTabPicker | null = null;

export function activate(context: ExtensionContext) {
  let disposable = commands.registerCommand('quick-tab-search.showTabs', showTabs);

  context.subscriptions.push(disposable);
}

function showTabs(): void {
  quickTabPicker = new QuickTabPicker();
}

export function deactivate() {
  quickTabPicker?.destroy();
}
