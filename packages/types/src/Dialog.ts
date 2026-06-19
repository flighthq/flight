import type { ApplicationWindow } from './ApplicationWindow';

// File-extension group for open/save dialogs, e.g. { name: 'Images', extensions: ['png', 'jpg'] }.
export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenFileDialogOptions {
  title?: string;
  multiple?: boolean;
  directory?: boolean;
  filters?: FileDialogFilter[];
  defaultPath?: string;
  // Native parent window to attach the modal dialog to; web backends ignore it.
  parentWindow?: ApplicationWindow;
}

export interface SaveFileDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileDialogFilter[];
  // Native parent window to attach the modal dialog to; web backends ignore it.
  parentWindow?: ApplicationWindow;
}

export type MessageDialogKind = 'info' | 'warning' | 'error' | 'question';

export interface MessageDialogOptions {
  title?: string;
  message: string;
  detail?: string;
  buttons?: string[];
  kind?: MessageDialogKind;
  // Optional checkbox shown beneath the message (e.g. "Don't ask again"); native hosts honor it.
  checkboxLabel?: string;
  // Initial checked state of the checkbox.
  checkboxChecked?: boolean;
  // Index of the button activated by Enter/default; native hosts honor it.
  defaultId?: number;
  // Index of the button activated by Escape/cancel; native hosts honor it.
  cancelId?: number;
  // Native parent window to attach the modal dialog to; web backends ignore it.
  parentWindow?: ApplicationWindow;
}

// Outcome of a message dialog: which button the user pressed and the final checkbox state.
export interface MessageDialogResult {
  buttonIndex: number;
  checkboxChecked: boolean;
}

// Native file/message dialog seam. Free functions in @flighthq/dialog delegate to the active backend
// (web default or a native host's). Resolves to sentinels ([] / null / 0 / false) on cancel or when the
// host lacks the surface, rather than throwing — dialog dismissal is an expected outcome, not an error.
export interface DialogBackend {
  openFile(options: Readonly<OpenFileDialogOptions>): Promise<string[]>;
  saveFile(options: Readonly<SaveFileDialogOptions>): Promise<string | null>;
  message(options: Readonly<MessageDialogOptions>): Promise<MessageDialogResult>;
  confirm(options: Readonly<MessageDialogOptions>): Promise<boolean>;
  prompt(message: string, defaultValue: string): Promise<string | null>;
}
