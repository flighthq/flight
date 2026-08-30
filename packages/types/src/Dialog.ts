import type { ApplicationWindow } from './ApplicationWindow';
import type { Entity, EntityRuntime } from './Entity';

// One picker filter. Each MIME key owns exactly the extensions it describes; native providers flatten
// the extension values while Web passes the pairing through to the File System Access API.
export interface FileDialogFilter {
  readonly accept: Readonly<Record<string, readonly string[]>>;
  readonly name: string;
}

// A handle to a file or directory chosen through a dialog. On web, path is null because browsers
// cannot expose real host paths; native hosts populate path. Provider-neutral file operations live in
// the Entity runtime so the identity remains valid after crossing package boundaries.
export interface FileDialogHandle extends Entity {
  readonly kind: 'File' | 'Directory';
  readonly name: string;
  readonly path: string | null;
}

// Runtime operations are deliberately provider-neutral: filesystem consumes these without knowing
// whether the handle retains a File, a FileSystemFileHandle, or a future native binding.
export interface FileDialogHandleOperations {
  readonly readBinary?: () => Promise<Uint8Array | null>;
  readonly readText?: () => Promise<string | null>;
  readonly writeBinary?: (data: Readonly<Uint8Array>) => Promise<boolean>;
  readonly writeText?: (data: string) => Promise<boolean>;
}

export interface FileDialogHandleRuntime extends EntityRuntime {
  operations: FileDialogHandleOperations | null;
}

export interface OpenFileDialogOptions {
  readonly filters?: readonly FileDialogFilter[];
  readonly multiple?: boolean;
}

export interface SaveFileDialogOptions {
  readonly defaultName?: string;
  readonly filters?: readonly FileDialogFilter[];
}

export type FileOpenDialogResult =
  | { readonly handles: readonly [FileDialogHandle, ...FileDialogHandle[]]; readonly outcome: 'selected' }
  | {
      readonly outcome: 'cancelled' | 'runtime-unavailable' | 'security-denied' | 'file-open-failed';
    };

export type DirectoryOpenDialogResult =
  | { readonly handle: FileDialogHandle; readonly outcome: 'selected' }
  | {
      readonly outcome: 'cancelled' | 'runtime-unavailable' | 'security-denied' | 'directory-open-failed';
    };

export type FileSaveDialogResult =
  | { readonly handle: FileDialogHandle; readonly outcome: 'selected' }
  | {
      readonly outcome: 'cancelled' | 'runtime-unavailable' | 'security-denied' | 'file-save-failed';
    };

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
