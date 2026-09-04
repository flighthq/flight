import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  HasDialogMessage,
  HasDialogPrompt,
  MessageDialogBackend,
  MessageDialogOptions,
  MessageDialogResult,
  PromptDialogBackend,
  PromptDialogOptions,
} from '@flighthq/types/contract';

// These two providers predate the file-dialog split and remain here until their own domain slices move
// them into host-web. File-picker providers live exclusively in @flighthq/host-web.
export const webMessageDialogBackend = createWebMessageDialogBackend();
export const webPromptDialogBackend = createWebPromptDialogBackend();

function createWebMessageDialogBackend(): MessageDialogBackend {
  const out = allocateEntity<MessageDialogBackend>();
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
  return finishEntity(out);
}

function createWebPromptDialogBackend(): PromptDialogBackend {
  const out = allocateEntity<PromptDialogBackend>();
  out.prompt = async (options) => {
    if (options.signal?.aborted) return null;
    if (typeof window === 'undefined' || typeof window.prompt !== 'function') return null;
    try {
      return window.prompt(options.message, options.defaultValue ?? '');
    } catch {
      return null;
    }
  };
  return finishEntity(out);
}

export function showConfirmDialog(host: HasDialogMessage, options: Readonly<MessageDialogOptions>): Promise<boolean> {
  return host.dialog.message.confirm(options);
}

export function showErrorBox(
  host: HasDialogMessage,
  title: string,
  content: string,
  signal?: AbortSignal,
): Promise<MessageDialogResult> {
  return host.dialog.message.message(
    signal === undefined
      ? { kind: 'error', message: content, title }
      : { kind: 'error', message: content, signal, title },
  );
}

export function showErrorDialog(
  host: HasDialogMessage,
  options: Readonly<MessageDialogOptions>,
): Promise<MessageDialogResult> {
  return host.dialog.message.message({ ...options, kind: 'error' });
}

export function showInfoDialog(
  host: HasDialogMessage,
  options: Readonly<MessageDialogOptions>,
): Promise<MessageDialogResult> {
  return host.dialog.message.message({ ...options, kind: 'info' });
}

export function showMessageDialog(
  host: HasDialogMessage,
  options: Readonly<MessageDialogOptions>,
): Promise<MessageDialogResult> {
  return host.dialog.message.message(options);
}

export function showPromptDialog(
  host: HasDialogPrompt,
  options: Readonly<PromptDialogOptions>,
): Promise<string | null> {
  return host.dialog.prompt.prompt(options);
}

export function showWarningDialog(
  host: HasDialogMessage,
  options: Readonly<MessageDialogOptions>,
): Promise<MessageDialogResult> {
  return host.dialog.message.message({ ...options, kind: 'warning' });
}
