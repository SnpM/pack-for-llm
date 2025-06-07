// src/utils.ts

import * as vscode from 'vscode';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';
import * as fs from 'fs';

/**
 * Return the workspace root folder path for a given URI.
 * If the URI is not inside any workspace, return the URI’s fsPath itself.
 */
export function getWorkspaceRootFsPath(uri: vscode.Uri): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  return workspaceFolder ? workspaceFolder.uri.fsPath : uri.fsPath;
}

/**
 * Load a GitIgnore matcher for the workspace root.
 * Always ignores “.git/” regardless of .gitignore contents.
 */
export async function loadIgnore(workspaceRoot: string): Promise<Ignore> {
  const ig = ignore();
  const gitignorePathOnDisk = path.join(workspaceRoot, '.gitignore');

  if (fs.existsSync(gitignorePathOnDisk)) {
    try {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(gitignorePathOnDisk));
      ig.add(raw.toString());
    } catch {
      // if it fails, skip loading .gitignore
    }
  }

  // Always ignore .git folder
  ig.add('.git/');
  return ig;
}

/**
 * Parse a comma‐delimited string of extensions into an array of ".ext" strings.
 */
export function parseIgnoreExtensions(raw: string): string[] {
  return raw
    .split(',')
    .map(ext => ext.trim().toLowerCase())
    .filter(ext => ext.length > 0)
    .map(ext => (ext.startsWith('.') ? ext : `.${ext}`));
}

/**
 * Return true if relPath (always forward‐slash‐normalized) should be ignored,
 * either by .gitignore rules, by matching one of ignoreExtensions,
 * or (if ignoreHidden is true) because the basename starts with a dot.
 *
 * @param relPath - e.g. "foo/bar/.env"
 * @param ig
 * @param ignoreExtensions
 * @param ignoreHidden  if true, immediately ignore anything whose basename starts with '.'
 */
export function shouldIgnore(
  relPath: string,
  ig: Ignore,
  ignoreExtensions: string[],
  ignoreHidden: boolean
): boolean {
  // 1) Hidden check:
  const base = path.basename(relPath);
  if (ignoreHidden && base.startsWith('.')) {
    return true;
  }

  // 2) gitignore matcher
  if (ig.ignores(relPath)) {
    return true;
  }

  // 3) extension‐based filter
  if (ignoreExtensions.length > 0) {
    const ext = path.extname(relPath).toLowerCase();
    if (ignoreExtensions.includes(ext)) {
      return true;
    }
  }

  // 4) Hardcoded exclusions
  const hardcodedExclusions = [".p4l"]
  if (relPath.endsWith('.p4l')) {
    return true;
  }

  return false;
}

/**
 * Recursively gather all file URIs under `uri`, skipping any folder/file
 * whose relative path (to workspaceRoot) is ignored by ig or matches ignoreExtensions
 * or is hidden (if ignoreHidden = true).
 */
export async function gatherFileUris(
  uri: vscode.Uri,
  workspaceRoot: string,
  ig: Ignore,
  ignoreExtensions: string[],
  ignoreHidden: boolean,
  outputChannel: vscode.OutputChannel
): Promise<vscode.Uri[]> {
  const rel = path.relative(workspaceRoot, uri.fsPath).replace(/\\/g, '/');

  if (shouldIgnore(rel, ig, ignoreExtensions, ignoreHidden)) {
    outputChannel.appendLine(`Ignored: ${rel}`);
    return [];
  }

  try {
    const stat = await vscode.workspace.fs.stat(uri);

    if (stat.type & vscode.FileType.Directory) {
      outputChannel.appendLine(`Entering directory: ${rel}`);
      const entries = await vscode.workspace.fs.readDirectory(uri);
      const nested: vscode.Uri[] = [];

      // Sort entries for deterministic order
      entries.sort((a, b) => a[0].localeCompare(b[0]));

      for (const [name, fileType] of entries) {
        const childUri = vscode.Uri.joinPath(uri, name);
        const childRel = path
          .relative(workspaceRoot, childUri.fsPath)
          .replace(/\\/g, '/');

        if (shouldIgnore(childRel, ig, ignoreExtensions, ignoreHidden)) {
          outputChannel.appendLine(`  Skipping: ${childRel}`);
          continue;
        }

        if (fileType & vscode.FileType.Directory) {
          nested.push(
            ...(await gatherFileUris(childUri, workspaceRoot, ig, ignoreExtensions, ignoreHidden, outputChannel))
          );
        } else if (fileType & vscode.FileType.File) {
          outputChannel.appendLine(`  Found file: ${childRel}`);
          nested.push(childUri);
        }
      }

      return nested;
    }

    if (stat.type & vscode.FileType.File) {
      outputChannel.appendLine(`Found file: ${rel}`);
      return [uri];
    }

    return [];
  } catch (err) {
    vscode.window.showWarningMessage(`Unable to access: ${uri.fsPath}`);
    outputChannel.appendLine(
      `Warning: Unable to access ${uri.fsPath}: ${(err as Error).message}`
    );
    return [];
  }
}

/**
 * Return true if the given URI is a directory.
 */
export async function isDirectory(uri: vscode.Uri): Promise<boolean> {
  const stat = await vscode.workspace.fs.stat(uri);
  return Boolean(stat.type & vscode.FileType.Directory);
}

/**
   * Create an untitled URI for a new file named baseName.ext,
   * appending _1, _2, … if a same-named untitled document is already open.
   */
export function createUniqueUntitledUri(
  workspaceRoot: string,
  baseName: string,
  ext: string
): vscode.Uri {
  // 1) Gather all open untitled tab names
  const openUntitled = new Set(
    vscode.workspace.textDocuments
      .filter((doc) => doc.uri.scheme === 'untitled')
      .map((doc) => path.basename(doc.uri.path))
  );

  // 2) Gather all file names in workspace root
  let onDisk = new Set<string>();
  try {
    for (const f of fs.readdirSync(workspaceRoot)) {
      onDisk.add(f);
    }
  } catch {
    // ignore read errors
  }

  let name = `${baseName}.${ext}`;
  let counter = 1;

  // bump suffix while name collides with either set
  while (openUntitled.has(name) || onDisk.has(name)) {
    name = `${baseName}_${counter}.${ext}`;
    counter++;
  }

  const fullPath = path.join(workspaceRoot, name);
  return vscode.Uri.parse(`untitled:${fullPath}`);
}