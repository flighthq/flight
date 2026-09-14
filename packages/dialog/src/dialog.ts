import type {
  HostMessageDialogProvider,
  HostPromptDialogProvider,
  MessageDialogOptions,
  MessageDialogResult,
  PromptDialogOptions,
} from '@flighthq/types/contract';

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
  signal?: MessageDialogOptions['signal'],
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
