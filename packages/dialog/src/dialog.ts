import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  HostMessageDialogProvider,
  HostPromptDialogProvider,
  MessageDialogOptions,
  MessageDialogResult,
  PromptDialogOptions,
} from '@flighthq/types/contract';

// Message and prompt providers stay with their dialog operations; host-web re-exports these canonical
// identities alongside the file-picker providers it owns.
export const webHostMessageDialog = createWebMessageDialogBackend();
export const webHostPromptDialog = createWebPromptDialogBackend();

function createWebMessageDialogBackend(): HostMessageDialogProvider {
  const out = allocateEntity<HostMessageDialogProvider>();
  initializeWebMessageDialogBackend(out);
  return finishEntity(out);
}

function createWebPromptDialogBackend(): HostPromptDialogProvider {
  const out = allocateEntity<HostPromptDialogProvider>();
  initializeWebPromptDialogBackend(out);
  return finishEntity(out);
}

export function initializeWebMessageDialogBackend(out: EntityConstruction<HostMessageDialogProvider>): void {
  out.confirm = async (options) => {
    if (options.signal?.aborted) return false;
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false;
    try {
      return window.confirm(options.message) === true;
    } catch {
      return false;
    }
  };
  out.message = async (options) => {
    const checkboxChecked = options.checkboxChecked ?? false;
    if (options.signal?.aborted) return { buttonIndex: options.cancelId ?? 0, cancelled: true, checkboxChecked };
    if (typeof window === 'undefined' || typeof window.alert !== 'function') {
      return { buttonIndex: 0, cancelled: false, checkboxChecked };
    }
    try {
      window.alert(options.message);
    } catch {
      return { buttonIndex: 0, cancelled: false, checkboxChecked };
    }
    return { buttonIndex: 0, cancelled: false, checkboxChecked };
  };
}

export function initializeWebPromptDialogBackend(out: EntityConstruction<HostPromptDialogProvider>): void {
  out.prompt = async (options) => {
    if (options.signal?.aborted) return null;
    if (typeof window === 'undefined' || typeof window.prompt !== 'function') return null;
    try {
      return window.prompt(options.message, options.defaultValue ?? '');
    } catch {
      return null;
    }
  };
}

export function showConfirmDialog(
  hostMessageDialog: Readonly<HostMessageDialogProvider>,
  options: Readonly<MessageDialogOptions>,
): Promise<boolean> {
  return hostMessageDialog.confirm(options);
}

export function showErrorBox(
  hostMessageDialog: Readonly<HostMessageDialogProvider>,
  title: string,
  content: string,
  signal?: AbortSignal,
): Promise<MessageDialogResult> {
  return hostMessageDialog.message(
    signal === undefined
      ? { kind: 'error', message: content, title }
      : { kind: 'error', message: content, signal, title },
  );
}

export function showErrorDialog(
  hostMessageDialog: Readonly<HostMessageDialogProvider>,
  options: Readonly<MessageDialogOptions>,
): Promise<MessageDialogResult> {
  return hostMessageDialog.message({ ...options, kind: 'error' });
}

export function showInfoDialog(
  hostMessageDialog: Readonly<HostMessageDialogProvider>,
  options: Readonly<MessageDialogOptions>,
): Promise<MessageDialogResult> {
  return hostMessageDialog.message({ ...options, kind: 'info' });
}

export function showMessageDialog(
  hostMessageDialog: Readonly<HostMessageDialogProvider>,
  options: Readonly<MessageDialogOptions>,
): Promise<MessageDialogResult> {
  return hostMessageDialog.message(options);
}

export function showPromptDialog(
  hostPromptDialog: Readonly<HostPromptDialogProvider>,
  options: Readonly<PromptDialogOptions>,
): Promise<string | null> {
  return hostPromptDialog.prompt(options);
}

export function showWarningDialog(
  hostMessageDialog: Readonly<HostMessageDialogProvider>,
  options: Readonly<MessageDialogOptions>,
): Promise<MessageDialogResult> {
  return hostMessageDialog.message({ ...options, kind: 'warning' });
}
