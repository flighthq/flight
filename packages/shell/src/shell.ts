import type {
  HasShellBeep,
  HasShellExternal,
  HasShellPathOpen,
  HasShellPathReveal,
  HasShellShortcutLink,
  HasShellTrash,
  ShellExternalOutcome,
  ShellExternalUrlPolicy,
  ShellPathOpenOutcome,
  ShellPathRevealOutcome,
  ShellProcess,
  ShellProcessHost,
  ShellProcessOptions,
  ShellShortcutLink,
  ShellShortcutLinkReadOutcome,
  ShellShortcutLinkWriteOutcome,
  ShellShortcutWriteOperation,
  ShellTrashOutcome,
} from '@flighthq/types/contract';

// Pure policy validation used by openShellExternalUrl before any host effect. Callers must supply the
// policy on every invocation; an empty allowedSchemes array intentionally blocks every URL.
export function isShellUrlAllowed(url: string, policy: Readonly<ShellExternalUrlPolicy>): boolean {
  try {
    const scheme = new URL(url).protocol.replace(/:$/, '').toLowerCase();
    return policy.allowedSchemes.some((allowed) => allowed.toLowerCase() === scheme);
  } catch {
    return false;
  }
}

// Projects the one-path provider operation across the batch. Promise.all starts every operation,
// awaits every settlement, and returns outcomes in the same order as paths.
export function moveShellItemsToTrash(
  host: HasShellTrash,
  paths: readonly string[],
): Promise<readonly ShellTrashOutcome[]> {
  return Promise.all(paths.map((path) => host.shell.trash.moveToTrash(path)));
}

export function moveShellItemToTrash(host: HasShellTrash, path: string): Promise<ShellTrashOutcome> {
  return host.shell.trash.moveToTrash(path);
}

// Handing a URL to an OS handler can launch a local application or registered protocol. The required
// per-call policy is validated before dispatch, so a blocked or malformed scheme never reaches the
// host. There is intentionally no policy default, ambient allowlist, or allow-all path.
export function openShellExternalUrl(
  host: HasShellExternal,
  url: string,
  policy: Readonly<ShellExternalUrlPolicy>,
): Promise<ShellExternalOutcome> {
  if (!isShellUrlAllowed(url, policy)) return Promise.resolve({ reason: 'blocked-scheme' });
  return host.shell.external.open(url);
}

export function openShellPath(host: HasShellPathOpen, path: string): Promise<ShellPathOpenOutcome> {
  return host.shell.pathOpen.open(path);
}

export function readShellShortcutLink(
  host: HasShellShortcutLink,
  shortcutPath: string,
): Promise<ShellShortcutLinkReadOutcome> {
  return host.shell.shortcutLink.read(shortcutPath);
}

export function revealShellPath(host: HasShellPathReveal, path: string): Promise<ShellPathRevealOutcome> {
  return host.shell.pathReveal.reveal(path);
}

export function shellBeep(host: HasShellBeep): void {
  host.shell.beep.beep();
}

export function spawnShellProcess(
  host: ShellProcessHost,
  command: string,
  args: readonly string[],
  options?: Readonly<ShellProcessOptions>,
): ShellProcess | null {
  return host.shell.process?.spawn(command, args, options) ?? null;
}

export function writeShellShortcutLink(
  host: HasShellShortcutLink,
  shortcutPath: string,
  link: Readonly<ShellShortcutLink>,
  operation: ShellShortcutWriteOperation,
): Promise<ShellShortcutLinkWriteOutcome> {
  return host.shell.shortcutLink.write(shortcutPath, link, operation);
}
