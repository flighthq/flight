import type { MessageDialogOptions } from './Dialog.ts';
import type { MessageDialogResult } from './Dialog.ts';

export interface HostMessageDialogCapability {
  confirm(options: Readonly<MessageDialogOptions>): Promise<boolean>;
  message(options: Readonly<MessageDialogOptions>): Promise<MessageDialogResult>;
}
