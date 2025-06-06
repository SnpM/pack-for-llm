# pack-for-llm (Pack for LLM) README

Pack and concatenate text files in your workspace into a single, copy-pasteable document for large-language models (LLMs). Select files or folders, and the extension outputs a combined text file with clear file delimiters.

## Features

- **Pack Selected Files/Folders**  
  Right-click any file or folder (or use the Command Palette) to run **Pack for LLM**, concatenating all readable files into one untitled document with delimiters.

- **Custom Delimiter**  
  Define a template (e.g. `<<< FILE: ${file} >>>`) that appears before each file’s content. Use `${file}` to insert the file’s relative path.

- **Optional .gitignore Respect**  
  Toggle whether to honor your workspace’s `.gitignore`. When enabled, matched files/folders are skipped automatically.

- **Ignore by Extension**  
  Specify a comma-separated list of file extensions (e.g. `.png,.jpg,.log`) to skip, even if they’re not in `.gitignore`.

- **Edit Configuration Command**  
  Run **Pack for LLM: Edit configuration** to jump directly to this extension’s settings.

## Usage
1. **Select Files or Folders**  
    In the Explorer, right-click on one or more files or folders you want to pack.

2. **Run the Command**  
    Choose **Pack for LLM** from the context menu, or open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for `Pack for LLM`.

3. **Review the Output**  
    The extension creates a new untitled document containing the packed content, with clear delimiters between files.

4. **Customize Settings (Optional)**  
    - Change the delimiter template in the extension settings.
    - Toggle `.gitignore` respect or specify ignored extensions as needed.

5. **Copy or Save**  
    Copy the packed content or save the document for use with your preferred LLM.

**Tip:** Use the **Edit configuration** command to quickly adjust settings.