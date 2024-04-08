import { ExtensionContext, commands, window } from "vscode";
import { QuickTabItem, QuickTabPicker } from "./QuickTabPicker";

let quickTabPicker: QuickTabPicker | null = null;

export function activate(context: ExtensionContext) {
  let disposables = [
    commands.registerCommand('quick-tab-search.showTabs', showTabs),
    commands.registerCommand('quick-tab-search.togglePinTab', togglePinTab),
  ];

  context.subscriptions.push(...disposables);
}

export function deactivate() {
  quickTabPicker?.destroy();
}


function showTabs(): void {
  quickTabPicker = new QuickTabPicker();
}

function togglePinTab(): void {
  const currentTab = window.tabGroups.activeTabGroup.activeTab;
  if (!currentTab) {
    return;
  }

  if (!currentTab.isPinned) {
    commands.executeCommand("workbench.action.pinEditor");
  } else {
    commands.executeCommand("workbench.action.unpinEditor");
  }
}
