import * as vscode from 'vscode';
import { registerPackCommand } from './commands/pack';
import { registerPackTreeCommand } from './commands/packTree';
import { registerEditConfigCommand } from './commands/editConfig';

export function activate(context: vscode.ExtensionContext) {
  // Create a single output channel for all commands
  const outputChannel = vscode.window.createOutputChannel('PackForLLM');
  context.subscriptions.push(outputChannel);

  // Register each command, passing in context and outputChannel as needed
  registerPackCommand(context, outputChannel);
  registerPackTreeCommand(context, outputChannel);
  registerEditConfigCommand(context);
}

export function deactivate() {
  // Nothing special to clean up here; each command disposes when its returned Disposable is disposed.
}
