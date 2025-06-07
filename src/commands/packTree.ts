// src/commands/packTree.ts

import * as vscode from 'vscode';
import * as path from 'path';
import {
  getWorkspaceRootFsPath,
  loadIgnore,
  parseIgnoreExtensions,
  shouldIgnore,
  isDirectory
} from '../utils';

export function registerPackTreeCommand(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
) {
  const callback = async (resource: vscode.Uri, selectedResources: vscode.Uri[]) => {
    outputChannel.clear();
    outputChannel.appendLine('PackTree command invoked.');

    // — 1. Determine selected URI(s) (folders only) —
    let uris: vscode.Uri[] = [];
    if (Array.isArray(selectedResources) && selectedResources.length > 0) {
      uris = selectedResources;
      outputChannel.appendLine(`Selected ${uris.length} resource(s).`);
    } else if (resource) {
      uris = [resource];
      outputChannel.appendLine('Single resource selected.');
    } else {
      // Invoked from Command Palette → force user to pick exactly one folder
      const picks = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select a folder to pack tree'
      });
      if (!picks || picks.length === 0) {
        vscode.window.showErrorMessage('No folder selected.');
        outputChannel.appendLine('Error: No folder selected.');
        return;
      }
      uris = picks;
      outputChannel.appendLine(`User picked folder: ${uris[0].fsPath}`);
    }

    const rootUri = uris[0];

    // — 2. Resolve “workspace root” vs. “picked folder” —
    let workspaceRootFsPath = getWorkspaceRootFsPath(rootUri);
    const maybeWorkspace = vscode.workspace.getWorkspaceFolder(rootUri);
    if (maybeWorkspace) {
      workspaceRootFsPath = maybeWorkspace.uri.fsPath;
      outputChannel.appendLine(`Using workspace root: ${workspaceRootFsPath}`);
    } else {
      outputChannel.appendLine(
        `Picked folder isn’t inside a workspace. Using as root: ${workspaceRootFsPath}`
      );
    }

    // — 3. Load user settings —
    const config = vscode.workspace.getConfiguration('packForLLM');
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
    const igMatcher = await loadIgnore(workspaceRootFsPath);
    if (!useGitignore) {
      outputChannel.appendLine('Skipping .gitignore rules (still ignoring .git).');
    }

    // — 5. Build directory tree string in “tree” format —
    const lines: string[] = [];
    const rootName = path.basename(rootUri.fsPath) || rootUri.fsPath;
    lines.push(rootName + '/');

    /**
     * Recursively walk `uri` and append to `lines`.
     * `prefix` is the accumulated indent string.
     * `isLast` indicates if this node is the last sibling.
     */
    async function buildTree(
      uri: vscode.Uri,
      prefix: string,
      isLast: boolean
    ): Promise<void> {
      const relToWorkspace = path
        .relative(workspaceRootFsPath, uri.fsPath)
        .replace(/\\/g, '/');

      if (shouldIgnore(relToWorkspace, igMatcher, ignoreExtensions, ignoreHidden)) {
        outputChannel.appendLine(`Ignored: ${relToWorkspace}`);
        return;
      }

      const connector = isLast ? '└── ' : '├── ';
      const name = path.basename(uri.fsPath) + (await isDirectory(uri) ? '/' : '');
      lines.push(prefix + connector + name);

      if (await isDirectory(uri)) {
        let entries = await vscode.workspace.fs.readDirectory(uri);

        // Filter out any ignored by gitignore, extension, or hidden
        entries = entries.filter(([entryName, fileType]) => {
          const childRel = path
            .relative(workspaceRootFsPath, path.join(uri.fsPath, entryName))
            .replace(/\\/g, '/');
          return !shouldIgnore(childRel, igMatcher, ignoreExtensions, ignoreHidden);
        });

        // Sort alphabetically
        entries.sort((a, b) => a[0].localeCompare(b[0]));

        for (let i = 0; i < entries.length; i++) {
          const [entryName] = entries[i];
          const childUri = vscode.Uri.joinPath(uri, entryName);
          const isLastChild = i === entries.length - 1;
          const newPrefix = prefix + (isLast ? '    ' : '│   ');
          await buildTree(childUri, newPrefix, isLastChild);
        }
      }
    }

    // Gather top‐level entries under root
    let topEntries = await vscode.workspace.fs.readDirectory(rootUri);
    topEntries = topEntries.filter(([entryName]) => {
      const childRel = path
        .relative(workspaceRootFsPath, path.join(rootUri.fsPath, entryName))
        .replace(/\\/g, '/');
      return !shouldIgnore(childRel, igMatcher, ignoreExtensions, ignoreHidden);
    });
    topEntries.sort((a, b) => a[0].localeCompare(b[0]));

    for (let i = 0; i < topEntries.length; i++) {
      const [entryName] = topEntries[i];
      const childUri = vscode.Uri.joinPath(rootUri, entryName);
      const isLastChild = i === topEntries.length - 1;
      await buildTree(childUri, '', isLastChild);
    }

    const treeText = lines.join('\n');

    // — 6. Show the result in a new untitled document —
    outputChannel.appendLine('Opening directory tree document.');
    const doc = await vscode.workspace.openTextDocument({
      language: 'pack4llm',
      content: treeText
    });
    await vscode.window.showTextDocument(doc);
    outputChannel.appendLine('Directory tree displayed.');
    outputChannel.show();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.packForLLM.packTree', callback)
  );
}
