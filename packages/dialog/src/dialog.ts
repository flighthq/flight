import type {
  DialogBackend,
  MessageDialogOptions,
  MessageDialogResult,
  OpenFileDialogOptions,
  SaveFileDialogOptions,
} from '@flighthq/types';

// Builds the default web backend over file inputs and window dialogs. File pickers cannot expose real
// host paths in a browser, so openFile resolves file names and saveFile resolves null. All API touches
// are guarded for jsdom/non-document hosts and resolve to sentinels rather than throwing.
export function createWebDialogBackend(): DialogBackend {
  return {
    openFile(options) {
      return openWebFileDialog(options);
    },
    async saveFile() {
      // The web platform cannot expose or choose a writable host path; native hosts override this.
      return null;
    },
    async message(options) {
      // The web platform has no multi-button/checkbox message box; alert() shows the text only and
      // always yields button 0. Native hosts honor buttons, checkboxLabel, defaultId, and cancelId.
      const checkboxChecked = options.checkboxChecked ?? false;
      if (typeof window === 'undefined' || typeof window.alert !== 'function') {
        return { buttonIndex: 0, checkboxChecked };
      }
      try {
        window.alert(options.message);
      } catch {
        return { buttonIndex: 0, checkboxChecked };
      }
      return { buttonIndex: 0, checkboxChecked };
    },
    async confirm(options) {
      if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false;
      try {
        // Coerce to a strict boolean: a real browser returns boolean, but a host that stubs confirm
        // (jsdom) can return undefined. confirm() must always yield a boolean.
        return window.confirm(options.message) === true;
      } catch {
        return false;
      }
    },
    async prompt(message, defaultValue) {
      if (typeof window === 'undefined' || typeof window.prompt !== 'function') return null;
      try {
        return window.prompt(message, defaultValue);
      } catch {
        return null;
      }
    },
  };
}

// The active dialog backend, or a lazily-created web default. There is always a backend.
export function getDialogBackend(): DialogBackend {
  if (_backend === null) _backend = createWebDialogBackend();
  return _backend;
}

// Installs a native host dialog backend; pass null to fall back to the web default.
export function setDialogBackend(backend: DialogBackend | null): void {
  _backend = backend;
}

// Shows a yes/no confirmation. Returns false on cancel or when the host lacks the surface.
export function showConfirmDialog(options: Readonly<MessageDialogOptions>): Promise<boolean> {
  return getDialogBackend().confirm(options);
}

// Shows an informational message. Returns the pressed button index and final checkbox state
// (buttonIndex 0 and the requested checkbox value on web alert/dismiss).
export function showMessageDialog(options: Readonly<MessageDialogOptions>): Promise<MessageDialogResult> {
  return getDialogBackend().message(options);
}

// Shows an open-file picker. Returns selected entries ([] on cancel). On web these are file names, not
// real host paths, since the browser cannot expose them.
export function showOpenFileDialog(options: Readonly<OpenFileDialogOptions>): Promise<string[]> {
  return getDialogBackend().openFile(options);
}

// Shows a text prompt. Returns the entered string, or null on cancel / when the host lacks the surface.
export function showPromptDialog(message: string, defaultValue = ''): Promise<string | null> {
  return getDialogBackend().prompt(message, defaultValue);
}

// Shows a save-file picker. Returns the chosen path, or null on cancel. Web always returns null because
// the browser cannot expose a writable host path.
export function showSaveFileDialog(options: Readonly<SaveFileDialogOptions>): Promise<string | null> {
  return getDialogBackend().saveFile(options);
}

let _backend: DialogBackend | null = null;

// Resolves with the selected file names via a transient <input type=file>. Resolves [] when the user
// cancels or no document exists. Web cannot expose real host paths, so file.name values are returned.
function openWebFileDialog(options: Readonly<OpenFileDialogOptions>): Promise<string[]> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return Promise.resolve([]);
  }
  return new Promise<string[]>((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      if (options.multiple === true) input.multiple = true;
      if (options.directory === true) {
        // webkitdirectory is non-standard but the only browser path-less directory picker.
        (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
      }
      const accept = buildAcceptAttribute(options.filters);
      if (accept !== '') input.accept = accept;
      input.addEventListener('change', () => {
        const files = input.files;
        if (files === null || files.length === 0) {
          resolve([]);
          return;
        }
        const names: string[] = [];
        for (let i = 0; i < files.length; i++) names.push(files[i].name);
        resolve(names);
      });
      // A cancelled picker fires no change event in many browsers; the 'cancel' event covers newer ones.
      input.addEventListener('cancel', () => resolve([]));
      input.click();
    } catch {
      resolve([]);
    }
  });
}

function buildAcceptAttribute(filters: OpenFileDialogOptions['filters']): string {
  if (filters === undefined || filters.length === 0) return '';
  const parts: string[] = [];
  for (const filter of filters) {
    for (const extension of filter.extensions) {
      if (extension === '*') continue;
      parts.push(extension.startsWith('.') ? extension : `.${extension}`);
    }
  }
  return parts.join(',');
}
