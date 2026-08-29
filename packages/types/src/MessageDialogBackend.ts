import type { MessageDialogOptions } from './Dialog';
import type { MessageDialogResult } from './Dialog';

export interface MessageDialogBackend {
  confirm(options: Readonly<MessageDialogOptions>): Promise<boolean>;
  message(options: Readonly<MessageDialogOptions>): Promise<MessageDialogResult>;
}
