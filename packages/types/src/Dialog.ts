import type { ApplicationWindow } from './ApplicationWindow';

// File-extension group for open/save dialogs, e.g. { name: 'Images', extensions: ['png', 'jpg'] }.
export interface FileDialogFilter {
  name: string;
  extensions: string[];
  // Optional MIME types for this group; consumed by the web File System Access API and the
  // legacy <input accept> attribute. Native hosts may ignore it in favor of extensions.
  mimeTypes?: string[];
}

// A handle to a file or directory chosen through a dialog. On web, path is null because browsers
// cannot expose real host paths; native hosts populate path. The live web FileSystem*Handle (when
// the File System Access API produced it) is retrieved separately via getWebFileSystemHandle /
// getWebDirectorySystemHandle, keyed by this handle's reference identity.
export interface FileDialogHandle {
  kind: 'File' | 'Directory';
  name: string;
  path: string | null;
}

// Starting location hint for file/directory pickers. The web File System Access API only honors
// 'desktop'|'documents'|'downloads'|'music'|'pictures'|'videos'; the remaining values are native-only
// and silently dropped on web.
export type FileDialogStartIn =
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'music'
  | 'pictures'
  | 'videos'
  | 'home'
  | 'temp'
  | 'appData'
  | 'cache';

export interface OpenFileDialogOptions {
  title?: string;
  multiple?: boolean;
  directory?: boolean;
  filters?: FileDialogFilter[];
  defaultPath?: string;
  // Starting location hint for the picker; web honors a subset of values.
  startIn?: FileDialogStartIn;
  // Native parent window to attach the modal dialog to; web backends ignore it.
  parentWindow?: ApplicationWindow;
}

// Options for a directory picker, distinct from an open-file picker. Web honors multiple/startIn;
// native hosts additionally honor parentWindow.
export interface OpenDirectoryDialogOptions {
  title?: string;
  multiple?: boolean;
  // Starting location hint for the picker; web honors a subset of values.
  startIn?: FileDialogStartIn;
  // Native parent window to attach the modal dialog to; web backends ignore it.
  parentWindow?: ApplicationWindow;
}

export interface SaveFileDialogOptions {
  title?: string;
  defaultPath?: string;
  // Suggested file name for the save target; preferred over defaultPath's basename when present.
  defaultName?: string;
  filters?: FileDialogFilter[];
  // Starting location hint for the picker; web honors a subset of values.
  startIn?: FileDialogStartIn;
  // Native parent window to attach the modal dialog to; web backends ignore it.
  parentWindow?: ApplicationWindow;
}

// Options for a text prompt dialog. Aligns prompt with its sibling dialog calls (object options).
export interface PromptDialogOptions {
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
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

// Outcome of a message dialog: which button the user pressed, whether the dialog was cancelled
// (Escape / dismiss), and the final checkbox state.
export interface MessageDialogResult {
  buttonIndex: number;
  cancelled: boolean;
  checkboxChecked: boolean;
}

// Native file/message dialog seam. Free functions in @flighthq/dialog delegate to the active backend
// (web default or a native host's). Resolves to sentinels ([] / null / 0 / false) on cancel or when the
// host lacks the surface, rather than throwing — dialog dismissal is an expected outcome, not an error.
export interface DialogBackend {
  confirm(options: Readonly<MessageDialogOptions>): Promise<boolean>;
  message(options: Readonly<MessageDialogOptions>): Promise<MessageDialogResult>;
  openDirectory(options: Readonly<OpenDirectoryDialogOptions>): Promise<FileDialogHandle[]>;
  openFile(options: Readonly<OpenFileDialogOptions>): Promise<FileDialogHandle[]>;
  prompt(options: Readonly<PromptDialogOptions>): Promise<string | null>;
  saveFile(options: Readonly<SaveFileDialogOptions>): Promise<FileDialogHandle | null>;
}
