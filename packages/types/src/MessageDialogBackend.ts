import type { MessageDialogOptions } from './Dialog';
import type { MessageDialogResult } from './Dialog';
import type { Entity } from './Entity';

export interface MessageDialogBackend extends Entity {
  confirm(options: Readonly<MessageDialogOptions>): Promise<boolean>;
  message(options: Readonly<MessageDialogOptions>): Promise<MessageDialogResult>;
}
