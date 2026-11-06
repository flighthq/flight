// Generated from crates/flight-shell/src/shell.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { isShellUrlAllowed } from './shell.native.ts';
import type {
  HostShellBeepCapability,
  HostShellExternalCapability,
  HostShellPathOpenCapability,
  HostShellPathRevealCapability,
  HostShellProcessCapability,
  HostShellShortcutLinkCapability,
  HostShellTrashCapability,
  ShellExternalOutcome,
  ShellExternalUrlPolicy,
  ShellPathOpenOutcome,
  ShellPathRevealOutcome,
  ShellProcess,
  ShellProcessOptions,
  ShellShortcutLink,
  ShellShortcutLinkReadOutcome,
  ShellShortcutLinkWriteOutcome,
  ShellShortcutWriteOperation,
  ShellTrashOutcome,
} from './types.ts';

// [lenient] fn is_shell_url_allowed: unsupported Rust method call `.scheme()`; impl sugar is not a transpilation source

/**
 * Moves one path to the trash through the host (TS `moveShellItemToTrash`).
 */
export async function moveShellItemToTrash(
  hostShellTrash: Readonly<HostShellTrashCapability>,
  path: string,
): Promise<ShellTrashOutcome> {
  return await hostShellTrash.moveToTrash(String(path));
}

// [lenient] fn move_shell_items_to_trash: unsupported Rust method call `.poll()`; impl sugar is not a transpilation source

/**
 * Hands a URL to an OS handler after the required per-call policy check (TS
 * `openShellExternalUrl`). A blocked or malformed scheme never reaches the host; there is
 * intentionally no policy default, ambient allowlist or allow-all path.
 */
export async function openShellExternalUrl(
  hostShellExternal: Readonly<HostShellExternalCapability>,
  url: string,
  policy: Readonly<ShellExternalUrlPolicy>,
): Promise<ShellExternalOutcome> {
  if (!isShellUrlAllowed(url, policy)) {
    return { reason: 'blocked-scheme' };
  }
  return await hostShellExternal.open(String(url));
}

/**
 * Opens a path through the host (TS `openShellPath`).
 */
export async function openShellPath(
  hostShellPathOpen: Readonly<HostShellPathOpenCapability>,
  path: string,
): Promise<ShellPathOpenOutcome> {
  return await hostShellPathOpen.open(String(path));
}

/**
 * Reads a shortcut link through the host (TS `readShellShortcutLink`).
 */
export async function readShellShortcutLink(
  hostShellShortcutLink: Readonly<HostShellShortcutLinkCapability>,
  shortcutPath: string,
): Promise<ShellShortcutLinkReadOutcome> {
  return await hostShellShortcutLink.read(String(shortcutPath));
}

/**
 * Reveals a path through the host (TS `revealShellPath`).
 */
export async function revealShellPath(
  hostShellPathReveal: Readonly<HostShellPathRevealCapability>,
  path: string,
): Promise<ShellPathRevealOutcome> {
  return await hostShellPathReveal.reveal(String(path));
}

/**
 * Plays the platform alert sound through the host (TS `shellBeep`). Synchronous dispatch.
 */
export function shellBeep(hostShellBeep: Readonly<HostShellBeepCapability>): void {
  hostShellBeep.beep();
}

/**
 * Spawns one child process from an argument vector (TS `spawnShellProcess`). The command, the
 * argument vector and the optional options are forwarded unchanged; the provider owns the
 * returned live handle.
 */
export function spawnShellProcess(
  hostShellProcess: Readonly<HostShellProcessCapability>,
  command: string,
  args: Readonly<string[]>,
  options?: Readonly<ShellProcessOptions>,
): ShellProcess {
  return hostShellProcess.spawn(command, args, options);
}

/**
 * Writes a shortcut link through the host (TS `writeShellShortcutLink`). The operation is
 * explicit and forwarded unchanged.
 */
export async function writeShellShortcutLink(
  hostShellShortcutLink: Readonly<HostShellShortcutLinkCapability>,
  shortcutPath: string,
  link: Readonly<ShellShortcutLink>,
  operation: ShellShortcutWriteOperation,
): Promise<ShellShortcutLinkWriteOutcome> {
  return await hostShellShortcutLink.write(String(shortcutPath), link, operation);
}
