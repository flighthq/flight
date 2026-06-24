import type {
  ShellBackend,
  ShellOpenExternalOptions,
  ShellOpenPathOptions,
  ShellShortcutLink,
  ShellShortcutWriteOperation,
} from '@flighthq/types';

// Builds the default web backend. Only openExternal is achievable on the web (window.open); revealing
// items, opening arbitrary local paths, trashing, shortcut links, and batch operations require a native
// host, so they return false / null / error-string sentinels here.
export function createWebShellBackend(): ShellBackend {
  return {
    beep() {
      // No portable web equivalent of a system beep; no-op until a native host provides one.
    },
    async moveItemsToTrash() {
      // The web cannot move local paths to the OS trash; native-host only.
      return [];
    },
    async moveToTrash() {
      // The web cannot move a local path to the OS trash; native-host only.
      return false;
    },
    async openExternal(url) {
      // window.open returns a Window handle on success, or null when blocked (popup blocker, no window).
      // The activate option (macOS foreground raise) has no web equivalent and is silently ignored.
      if (typeof window === 'undefined' || typeof window.open !== 'function') return false;
      try {
        return window.open(url, '_blank', 'noopener') !== null;
      } catch {
        return false;
      }
    },
    async openPath() {
      // The web sandbox cannot open arbitrary local paths; only a native host can.
      return false;
    },
    async openPathResult() {
      // The web cannot open arbitrary local paths; native-host only.
      return 'unavailable on web';
    },
    async readShortcutLink() {
      // Windows .lnk shortcut links are not accessible on the web.
      return null;
    },
    async showItemInFolder() {
      // The web has no OS file manager to reveal an item in; native-host only.
      return false;
    },
    async writeShortcutLink() {
      // Windows .lnk shortcut links cannot be written on the web.
      return false;
    },
  };
}

// The active shell backend, or a lazily-created web default. There is always a backend.
export function getShellBackend(): ShellBackend {
  if (_backend === null) _backend = createWebShellBackend();
  return _backend;
}

// True when url is allowed by the active URL-scheme allowlist. When no allowlist is set, all URLs
// are allowed. Used internally by openExternalUrl; also exported for callers that need the check.
export function isShellUrlAllowed(url: string): boolean {
  if (_urlSchemeAllowlist === null) return true;
  try {
    const scheme = new URL(url).protocol.replace(/:$/, '');
    return _urlSchemeAllowlist.includes(scheme);
  } catch {
    return false;
  }
}

// Moves a batch of local paths to the OS trash. Returns a per-path boolean array. Empty array on the
// web (native-host only). Single-path convenience: use moveItemToTrash.
export function moveItemsToTrash(paths: readonly string[]): Promise<readonly boolean[]> {
  return getShellBackend().moveItemsToTrash(paths);
}

// Moves a local path to the OS trash. Returns false on the web; native-host capability.
export function moveItemToTrash(path: string): Promise<boolean> {
  return getShellBackend().moveToTrash(path);
}

// Opens a URL in the user's default browser / external handler. Returns false when blocked, popup-
// blocked, or the URL scheme is not in the active allowlist (see setShellUrlSchemeAllowlist).
export function openExternalUrl(url: string, options?: Readonly<ShellOpenExternalOptions>): Promise<boolean> {
  if (!isShellUrlAllowed(url)) return Promise.resolve(false);
  return getShellBackend().openExternal(url, options);
}

// Opens a local path with its default OS application. Returns false on the web; native-host capability.
export function openShellPath(path: string, options?: Readonly<ShellOpenPathOptions>): Promise<boolean> {
  return getShellBackend().openPath(path, options);
}

// Opens a local path and returns the OS error message, or '' on success. On the web returns
// 'unavailable on web'. Use this when you need the reason a path could not be opened rather than
// just a boolean; openShellPath is the boolean convenience wrapper over this.
export function openShellPathResult(path: string, options?: Readonly<ShellOpenPathOptions>): Promise<string> {
  return getShellBackend().openPathResult(path, options);
}

// Reads a Windows .lnk shell shortcut. Returns null on non-Windows platforms, on the web, or when
// the shortcut does not exist.
export function readShellShortcutLink(shortcutPath: string): Promise<ShellShortcutLink | null> {
  return getShellBackend().readShortcutLink(shortcutPath);
}

// Installs a native host shell backend; pass null to fall back to the web default.
export function setShellBackend(backend: ShellBackend | null): void {
  _backend = backend;
}

// Sets the URL-scheme allowlist consulted by openExternalUrl. Pass null to allow all schemes
// (default behavior). When a non-null list is set, openExternalUrl returns false for any URL whose
// scheme is not in the list. Example: setShellUrlSchemeAllowlist(['https', 'mailto']).
// This closes the classic openExternal security footgun with attacker-controlled URLs.
export function setShellUrlSchemeAllowlist(schemes: readonly string[] | null): void {
  _urlSchemeAllowlist = schemes;
}

// Emits a system beep. No-op on the web until a native host provides one.
export function shellBeep(): void {
  getShellBackend().beep();
}

// Reveals a local path in the OS file manager. Returns false on the web; native-host capability.
export function showItemInFolder(path: string): Promise<boolean> {
  return getShellBackend().showItemInFolder(path);
}

// Creates a Windows .lnk shell shortcut at shortcutPath pointing to link. Returns false on
// non-Windows platforms and on the web. operation defaults to 'create'.
// IMPORTANT: URL safety — only use openExternalUrl for user-facing link opening; do not pass
// attacker-controlled paths to writeShellShortcutLink without validation.
export function writeShellShortcutLink(
  shortcutPath: string,
  link: Readonly<ShellShortcutLink>,
  operation?: ShellShortcutWriteOperation,
): Promise<boolean> {
  return getShellBackend().writeShortcutLink(shortcutPath, link, operation);
}

let _backend: ShellBackend | null = null;
let _urlSchemeAllowlist: readonly string[] | null = null;
