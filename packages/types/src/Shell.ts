// Operating-system shell integration seam. Free functions in @flighthq/shell delegate to the active
// ShellBackend (web default or a native host's). Operations the web cannot perform — revealing a file
// in the OS file manager, moving a path to the trash, opening an arbitrary local path, reading/writing
// Windows .lnk shortcut links — resolve to false / [] / null / an error string rather than throwing.
// They are expected-failure surfaces on the web, not programmer errors.
export interface ShellBackend {
  beep(): void;
  moveItemsToTrash(paths: readonly string[]): Promise<readonly boolean[]>;
  moveToTrash(path: string): Promise<boolean>;
  openExternal(url: string, options?: Readonly<ShellOpenExternalOptions>): Promise<boolean>;
  openPath(path: string, options?: Readonly<ShellOpenPathOptions>): Promise<boolean>;
  // Opens a local path and resolves to the OS error message, or '' on success.
  openPathResult(path: string, options?: Readonly<ShellOpenPathOptions>): Promise<string>;
  readShortcutLink(shortcutPath: string): Promise<ShellShortcutLink | null>;
  showItemInFolder(path: string): Promise<boolean>;
  writeShortcutLink(
    shortcutPath: string,
    link: Readonly<ShellShortcutLink>,
    operation?: ShellShortcutWriteOperation,
  ): Promise<boolean>;
}

// Options for openShellExternalUrl. activate raises the opened application to the foreground (macOS);
// it has no web equivalent and is ignored by the web backend.
export interface ShellOpenExternalOptions {
  activate?: boolean;
}

// Options for openShellPath / openShellPathResult. workingDirectory sets the working directory for
// the launched application; application names a specific OS application to open the path with
// (defaulting to the path's registered handler). Both are native-host only.
export interface ShellOpenPathOptions {
  application?: string;
  workingDirectory?: string;
}

// A Windows .lnk shell shortcut link. target is the path the shortcut points to; the remaining
// fields are optional shortcut metadata populated by native hosts.
export interface ShellShortcutLink {
  target: string;
  appUserModelId?: string;
  args?: string;
  description?: string;
  icon?: string;
  iconIndex?: number;
  workingDirectory?: string;
}

// How writeShellShortcutLink applies a shortcut link at a path: create a new link (failing if one
// exists), update an existing link's fields, or replace it wholesale. Defaults to 'create'.
export type ShellShortcutWriteOperation = 'create' | 'replace' | 'update';
