// src/commands/pack.ts

import * as vscode from 'vscode';
import * as path from 'path';
import {
  getWorkspaceRootFsPath,
  loadIgnore,
  parseIgnoreExtensions,
  gatherFileUris
} from '../utils';

export function registerPackCommand(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
) {
  const callback = async (resource: vscode.Uri, selectedResources: vscode.Uri[]) => {
    outputChannel.clear();
    outputChannel.appendLine('PackForLLM command invoked.');

    // — 1. Determine selected URIs —
    let uris: vscode.Uri[] = [];
    if (Array.isArray(selectedResources) && selectedResources.length > 0) {
      uris = selectedResources;
      outputChannel.appendLine(`Selected ${uris.length} resource(s).`);
    } else if (resource) {
      uris = [resource];
      outputChannel.appendLine('Single resource selected.');
    } else {
      // Command Palette fallback: prompt for MULTI folder/file selection
      const picks = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: true,
        openLabel: 'Select files or folders to pack'
      });
      if (!picks || picks.length === 0) {
        vscode.window.showErrorMessage('No files or folders selected.');
        outputChannel.appendLine('Error: No files or folders selected.');
        return;
      }
      uris = picks;
      outputChannel.appendLine(`User picked ${uris.length} item(s) via dialog.`);
    }

    // — 2. Find workspace root —
    const workspaceRootFsPath = getWorkspaceRootFsPath(uris[0]);

    // — 3. Load user settings —
    const config = vscode.workspace.getConfiguration('packForLLM');
    const rawDelimiterTemplate =
      config.get<string>('delimiter') || '<<< FILE: ${file} >>>';
    outputChannel.appendLine(`Using delimiter template: "${rawDelimiterTemplate}"`);

    const useGitignore = config.get<boolean>('useGitignore', true);
    outputChannel.appendLine(`Use .gitignore? ${useGitignore}`);

    const ignoreExtensions = parseIgnoreExtensions(
      config.get<string>('ignoreExtensions', '') || ''
    );
    outputChannel.appendLine(
      `Ignoring extensions: ${
        ignoreExtensions.length > 0 ? ignoreExtensions.join(', ') : '(none)'
      }`
    );

    const ignoreHidden = config.get<boolean>('ignoreHidden', false);
    outputChannel.appendLine(`Ignore hidden files? ${ignoreHidden}`);

    // — 4. Load .gitignore matcher —
    let igMatcher;
    if (useGitignore) {
      igMatcher = await loadIgnore(workspaceRootFsPath);
    } else {
      igMatcher = await loadIgnore(workspaceRootFsPath);
      // Even if user disabled .gitignore, loadIgnore always adds ".git/" so that .git is ignored.
      outputChannel.appendLine('Skipping .gitignore file rules (still ignoring .git folder).');
    }

    // — 5+6. Gather & read files under a progress notification —
    let aggregated = '';
    try {
      aggregated = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Packing files for LLM…',
          cancellable: false
        },
        async progress => {
          progress.report({ message: 'Gathering files…' });

          // 5a. Collect all file URIs from each selection
          const allFileUris: vscode.Uri[] = [];
          for (const uri of uris) {
            outputChannel.appendLine(`Processing selection: ${uri.fsPath}`);
            const files = await gatherFileUris(
              uri,
              workspaceRootFsPath,
              igMatcher,
              ignoreExtensions,
              ignoreHidden,
              outputChannel
            );
            allFileUris.push(...files);
          }

          outputChannel.appendLine(`Total files collected: ${allFileUris.length}`);
          if (allFileUris.length === 0) {
            throw new Error('No readable files found (all ignored or filtered).');
          }

          progress.report({ message: `Reading ${allFileUris.length} files…` });

          // 6a. Read each file and build the aggregated string
          let result = '';
          for (let i = 0; i < allFileUris.length; i++) {
            const fileUri = allFileUris[i];
            const relPath = path
              .relative(workspaceRootFsPath, fileUri.fsPath)
              .replace(/\\/g, '/');

            outputChannel.appendLine(`Reading file: ${relPath}`);
            const bytes = await vscode.workspace.fs.readFile(fileUri);
            const content = bytes.toString();

            const actualDelimiter = rawDelimiterTemplate.replace(/\$\{file\}/g, relPath);
            result += actualDelimiter + '\n' + content + '\n\n';

            progress.report({
              increment: Math.floor(100 / allFileUris.length),
              message: `Reading file ${i + 1}/${allFileUris.length}`
            });
          }

          return result;
        }
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(err.message);
      outputChannel.appendLine(`Error during packing: ${err.message}`);
      return;
    }

    if (!aggregated) {
      return;
    }

    // — 7. Open the aggregated document —
    outputChannel.appendLine('Opening aggregated document.');
    const doc = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: aggregated
    });
    await vscode.window.showTextDocument(doc);
    outputChannel.appendLine('Aggregated document displayed.');
    outputChannel.show();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.packForLLM.pack', callback)
  );
}
