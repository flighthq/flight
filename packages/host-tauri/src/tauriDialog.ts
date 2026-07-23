import type {
  DialogBackend,
  FileDialogFilter,
  FileDialogHandle,
  MessageDialogKind,
  TauriApi,
  TauriDialogFilter,
} from '@flighthq/types';

// Maps Flight's DialogBackend onto Tauri's async `@tauri-apps/plugin-dialog`. Both sides are
// Promise-based. Open/save resolve to sentinels ([] / null) on cancel. Tauri returns real host paths,
// so FileDialogHandles carry a populated `path`. Two contract gaps are handled honestly: Tauri's
// `message` is a single-button acknowledgement (it cannot report a multi-button choice), so `message`
// resolves buttonIndex 0 / not-cancelled; and Tauri has no text-input dialog, so `prompt` resolves the
// null sentinel. The modal parent window is not threaded through, so dialogs are application-modal.
export function createTauriDialogBackend(tauri: TauriApi): DialogBackend {
  const dialog = tauri.dialog;
  return {
    async openFile(options) {
      const result = await dialog.open({
        title: options.title,
        defaultPath: options.defaultPath,
        multiple: options.multiple,
        directory: options.directory,
        filters: options.filters?.map(toTauriFilter),
      });
      const kind = options.directory ? 'Directory' : 'File';
      return toHandles(result, kind);
    },
    async openDirectory(options) {
      const result = await dialog.open({
        title: options.title,
        multiple: options.multiple,
        directory: true,
      });
      return toHandles(result, 'Directory');
    },
    async saveFile(options) {
      const path = await dialog.save({
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters?.map(toTauriFilter),
      });
      return path === null ? null : toFileHandle(path, 'File');
    },
    async message(options) {
      await dialog.message(options.message, {
        title: options.title,
        kind: toTauriMessageKind(options.kind),
      });
      // Tauri's message is a single-button acknowledgement; it reports no button choice or checkbox.
      return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
    },
    async confirm(options) {
      return dialog.confirm(options.message, {
        title: options.title,
        kind: toTauriMessageKind(options.kind),
      });
    },
    async prompt() {
      // Tauri has no native text-input dialog; report unsupported via the null sentinel.
      return null;
    },
  };
}

function toFileHandle(path: string, kind: 'File' | 'Directory'): FileDialogHandle {
  return { kind, name: basename(path), path };
}

function toHandles(result: string | string[] | null, kind: 'File' | 'Directory'): FileDialogHandle[] {
  if (result === null) return [];
  const paths = Array.isArray(result) ? result : [result];
  return paths.map((path) => toFileHandle(path, kind));
}

function toTauriFilter(filter: Readonly<FileDialogFilter>): TauriDialogFilter {
  return { name: filter.name, extensions: [...filter.extensions] };
}

// Tauri's message/confirm accept only info/warning/error; Flight's 'question' has no Tauri glyph, so it
// falls back to 'info'.
function toTauriMessageKind(kind: MessageDialogKind | undefined): 'info' | 'warning' | 'error' {
  if (kind === 'warning') return 'warning';
  if (kind === 'error') return 'error';
  return 'info';
}

function basename(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '');
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}
