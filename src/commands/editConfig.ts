import * as vscode from 'vscode';

export function registerEditConfigCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'extension.packForLLM.editConfig',
    async () => {
      // Opens the Settings UI filtered to “packForLLM”
      await vscode.commands.executeCommand('workbench.action.openSettings', 'packForLLM');
    }
  );

  context.subscriptions.push(disposable);
}
