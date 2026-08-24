import type { BackendExplanation } from '@flighthq/types/contract';
import type {
  ShellBackend,
  ShellOpenExternalOptions,
  ShellOpenPathOptions,
  ShellShortcutLink,
  ShellShortcutWriteOperation,
} from '@flighthq/types/contract';

export function explainShellBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

// The active shell backend. Precedence: custom > host > sentinel.
export function getShellBackend(): ShellBackend {
  return _custom ?? _host ?? _sentinel;
}

export function installShellHostBackend(backend: ShellBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

// True when url is allowed by the active URL-scheme allowlist. When no allowlist is set, all URLs
// are allowed. Used internally by openShellExternalUrl; also exported for callers that need the check.
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

export function observeShellHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

// Opens a URL in the user's default browser / external handler. Returns false when blocked, popup-
// blocked, or the URL scheme is not in the active allowlist (see setShellUrlSchemeAllowlist).
// SECURITY: handing an attacker-controlled URL to the OS default handler is the classic openExternal
// footgun — a non-http(s) scheme can launch a local application or protocol handler. When the url may
// be untrusted, constrain the accepted schemes with setShellUrlSchemeAllowlist (e.g. ['https',
// 'mailto']); isShellUrlAllowed exposes the same check for a caller that wants to gate the URL itself.
export function openShellExternalUrl(url: string, options?: Readonly<ShellOpenExternalOptions>): Promise<boolean> {
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

export function resetShellBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

// Installs a custom shell backend; pass null to clear the custom override.
export function setShellBackend(backend: ShellBackend | null): void {
  _custom = backend;
}

// Sets the URL-scheme allowlist consulted by openShellExternalUrl. Pass null to allow all schemes
// (default behavior). When a non-null list is set, openShellExternalUrl returns false for any URL whose
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
// IMPORTANT: URL safety — only use openShellExternalUrl for user-facing link opening; do not pass
// attacker-controlled paths to writeShellShortcutLink without validation.
export function writeShellShortcutLink(
  shortcutPath: string,
  link: Readonly<ShellShortcutLink>,
  operation?: ShellShortcutWriteOperation,
): Promise<boolean> {
  return getShellBackend().writeShortcutLink(shortcutPath, link, operation);
}

const _sentinel: ShellBackend = {
  beep() {},
  async moveItemsToTrash() {
    return [];
  },
  async moveToTrash() {
    return false;
  },
  async openExternal() {
    return false;
  },
  async openPath() {
    return false;
  },
  async openPathResult() {
    return 'unavailable on web';
  },
  async readShortcutLink() {
    return null;
  },
  async showItemInFolder() {
    return false;
  },
  async writeShortcutLink() {
    return false;
  },
};
let _custom: ShellBackend | null = null;
let _host: ShellBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;
let _urlSchemeAllowlist: readonly string[] | null = null;
