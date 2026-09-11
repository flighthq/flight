import type {
  HostShellBeepProvider,
  HostShellExternalProvider,
  HostShellPathOpenProvider,
  HostShellPathRevealProvider,
  HostShellProcessProvider,
  HostShellShortcutLinkProvider,
  HostShellTrashProvider,
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
  hostShellTrash: Readonly<HostShellTrashProvider>,
  paths: readonly string[],
): Promise<readonly ShellTrashOutcome[]> {
  return Promise.all(paths.map((path) => hostShellTrash.moveToTrash(path)));
}

export function moveShellItemToTrash(
  hostShellTrash: Readonly<HostShellTrashProvider>,
  path: string,
): Promise<ShellTrashOutcome> {
  return hostShellTrash.moveToTrash(path);
}

// Handing a URL to an OS handler can launch a local application or registered protocol. The required
// per-call policy is validated before dispatch, so a blocked or malformed scheme never reaches the
// host. There is intentionally no policy default, ambient allowlist, or allow-all path.
export function openShellExternalUrl(
  hostShellExternal: Readonly<HostShellExternalProvider>,
  url: string,
  policy: Readonly<ShellExternalUrlPolicy>,
): Promise<ShellExternalOutcome> {
  if (!isShellUrlAllowed(url, policy)) return Promise.resolve({ reason: 'blocked-scheme' });
  return hostShellExternal.open(url);
}

export function openShellPath(
  hostShellPathOpen: Readonly<HostShellPathOpenProvider>,
  path: string,
): Promise<ShellPathOpenOutcome> {
  return hostShellPathOpen.open(path);
}

export function readShellShortcutLink(
  hostShellShortcutLink: Readonly<HostShellShortcutLinkProvider>,
  shortcutPath: string,
): Promise<ShellShortcutLinkReadOutcome> {
  return hostShellShortcutLink.read(shortcutPath);
}

export function revealShellPath(
  hostShellPathReveal: Readonly<HostShellPathRevealProvider>,
  path: string,
): Promise<ShellPathRevealOutcome> {
  return hostShellPathReveal.reveal(path);
}

export function shellBeep(hostShellBeep: Readonly<HostShellBeepProvider>): void {
  hostShellBeep.beep();
}

export function spawnShellProcess(
  hostShellProcess: Readonly<HostShellProcessProvider>,
  command: string,
  args: readonly string[],
  options?: Readonly<ShellProcessOptions>,
): ShellProcess {
  return hostShellProcess.spawn(command, args, options);
}

export function writeShellShortcutLink(
  hostShellShortcutLink: Readonly<HostShellShortcutLinkProvider>,
  shortcutPath: string,
  link: Readonly<ShellShortcutLink>,
  operation: ShellShortcutWriteOperation,
): Promise<ShellShortcutLinkWriteOutcome> {
  return hostShellShortcutLink.write(shortcutPath, link, operation);
}
