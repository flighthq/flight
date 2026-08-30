import type { Entity } from './Entity';

// Opening an external URL is security-sensitive, so every call must name the schemes it permits.
// There is deliberately no default and no allow-all sentinel: callers decide policy before a provider
// is dispatched. Scheme names omit the trailing colon, for example ['https', 'mailto'].
export interface ShellExternalUrlPolicy {
  readonly allowedSchemes: readonly string[];
}

export type ShellExternalOutcome = {
  readonly reason: 'blocked-scheme' | 'ok' | 'operation-failed' | 'popup-blocked';
};

export type ShellPathOpenOutcome =
  | { readonly reason: 'ok' }
  | { readonly message: string; readonly reason: 'operation-failed' };

export type ShellPathRevealOutcome = { readonly reason: 'ok' | 'operation-failed' };

export type ShellShortcutLinkReadOutcome =
  | { readonly link: Readonly<ShellShortcutLink>; readonly reason: 'ok' }
  | { readonly message: string; readonly reason: 'operation-failed' };

export type ShellShortcutLinkWriteOutcome = { readonly reason: 'ok' | 'operation-failed' };

export type ShellTrashOutcome = { readonly reason: 'ok' | 'operation-failed' };

// The six provider interfaces are separate because host coverage differs by operation. An omitted
// Host.shell slot is capability absence, never a provider whose methods return unsupported sentinels.
// These bounded commands own no whole-provider resource, so their Entity identity has no destroy hook.
export interface ShellBeepBackend extends Entity {
  beep(): void;
}

export interface ShellExternalBackend extends Entity {
  open(url: string): Promise<ShellExternalOutcome>;
}

export interface ShellPathOpenBackend extends Entity {
  open(path: string): Promise<ShellPathOpenOutcome>;
}

export interface ShellPathRevealBackend extends Entity {
  reveal(path: string): Promise<ShellPathRevealOutcome>;
}

export interface ShellShortcutLinkBackend extends Entity {
  read(shortcutPath: string): Promise<ShellShortcutLinkReadOutcome>;
  write(
    shortcutPath: string,
    link: Readonly<ShellShortcutLink>,
    operation: ShellShortcutWriteOperation,
  ): Promise<ShellShortcutLinkWriteOutcome>;
}

export interface ShellTrashBackend extends Entity {
  moveToTrash(path: string): Promise<ShellTrashOutcome>;
}

// A Windows .lnk shell shortcut link. target is the path the shortcut points to; the remaining
// fields are optional shortcut metadata populated by the Windows provider.
export interface ShellShortcutLink {
  target: string;
  appUserModelId?: string;
  args?: string;
  description?: string;
  icon?: string;
  iconIndex?: number;
  workingDirectory?: string;
}

// How writeShellShortcutLink applies a shortcut link at a path.
export type ShellShortcutWriteOperation = 'create' | 'replace' | 'update';
