import type { Entity } from './Entity';
import type { HostShellCapabilities } from './Host';

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

// Options for one argument-vector child process. Environment entries are passed as literal strings;
// command parsing, shell expansion, and ambient shell selection are deliberately outside this seam.
export interface ShellProcessOptions {
  readonly cwd?: string;
  readonly environment?: Readonly<Record<string, string>>;
}

// Terminal process status. A normal exit has a numeric code and null signal; signal termination has
// a null code and the provider's literal signal name. Providers preserve null when the platform does
// not report one side of the result rather than fabricating a value.
export interface ShellProcessExitStatus {
  readonly code: number | null;
  readonly signal: string | null;
}

// A live provider-owned child process. Standard I/O uses the same Uint8Array Web Streams convention
// as file-system streaming. Closing stdin is the WritableStream lifecycle; terminate requests process
// termination, while exit settles exactly once with the provider's terminal status.
export interface ShellProcess extends Entity {
  readonly exit: Promise<Readonly<ShellProcessExitStatus>>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly stdin: WritableStream<Uint8Array>;
  readonly stdout: ReadableStream<Uint8Array>;
  terminate(): void;
}

// Minimal host shape accepted by spawnShellProcess. A real Host satisfies it directly; an omitted
// process slot is explicit unsupported capability and produces null before any provider call.
export interface ShellProcessHost {
  readonly shell: Pick<HostShellCapabilities, 'process'>;
}

// The seven provider interfaces are separate because host coverage differs by operation. An omitted
// Host.shell slot is capability absence, never a provider whose methods return unsupported sentinels.
// The six bounded command providers own no whole-provider resource. Process lifetime belongs to each
// returned ShellProcess, so the spawning provider itself likewise has no destroy hook.
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

// Spawn is asynchronous work with a synchronously returned live handle, not a synchronous execution
// API: completion is observed through ShellProcess.exit. The backend receives an argument vector and
// never a shell command string to parse.
export interface ShellProcessBackend extends Entity {
  spawn(command: string, args: readonly string[], options?: Readonly<ShellProcessOptions>): ShellProcess;
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
