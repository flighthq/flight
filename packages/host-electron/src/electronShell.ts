import type {
  ElectronApi,
  ElectronShortcutDetails,
  DesktopOsProfile,
  HostShellCapabilities,
  HostShellBeepCapability,
  HostShellExternalCapability,
  HostShellPathOpenCapability,
  HostShellPathRevealCapability,
  ShellShortcutLink,
  HostShellShortcutLinkCapability,
  HostShellTrashCapability,
} from '@flighthq/types/contract';

// Builds Electron's exact Shell capability group. platform is caller-injected because shortcut-link
// support is a construction-time Windows fact, not something capability resolution reads ambiently.
export function electronHostShell(
  electron: ElectronApi,
  platform: DesktopOsProfile,
): HostShellCapabilities &
  Required<Pick<HostShellCapabilities, 'beep' | 'external' | 'pathOpen' | 'pathReveal' | 'trash'>> {
  const shared = {
    beep: electronHostShellBeep(electron),
    external: electronHostShellExternal(electron),
    pathOpen: electronHostShellPathOpen(electron),
    pathReveal: electronHostShellPathReveal(electron),
    trash: electronHostShellTrash(electron),
  };
  if (platform !== 'windows') return shared;
  return { ...shared, shortcutLink: electronHostShellShortcutLink(electron) };
}

export function electronHostShellBeep(electron: ElectronApi): HostShellBeepCapability {
  const out = {} as HostShellBeepCapability;
  populateElectronHostShellBeep(out, electron.shell);
  return out;
}

export function electronHostShellExternal(electron: ElectronApi): HostShellExternalCapability {
  const out = {} as HostShellExternalCapability;
  populateElectronHostShellExternal(out, electron.shell);
  return out;
}

export function electronHostShellPathOpen(electron: ElectronApi): HostShellPathOpenCapability {
  const out = {} as HostShellPathOpenCapability;
  populateElectronHostShellPathOpen(out, electron.shell);
  return out;
}

export function electronHostShellPathReveal(electron: ElectronApi): HostShellPathRevealCapability {
  const out = {} as HostShellPathRevealCapability;
  populateElectronHostShellPathReveal(out, electron.shell);
  return out;
}

export function electronHostShellShortcutLink(electron: ElectronApi): HostShellShortcutLinkCapability {
  const out = {} as HostShellShortcutLinkCapability;
  populateElectronHostShellShortcutLink(out, electron.shell);
  return out;
}

export function electronHostShellTrash(electron: ElectronApi): HostShellTrashCapability {
  const out = {} as HostShellTrashCapability;
  populateElectronHostShellTrash(out, electron.shell);
  return out;
}

export function populateElectronHostShellBeep(out: HostShellBeepCapability, shell: ElectronApi['shell']): void {
  out.beep = () => {
    shell.beep();
  };
}

export function populateElectronHostShellExternal(out: HostShellExternalCapability, shell: ElectronApi['shell']): void {
  out.open = async (url) => {
    try {
      await shell.openExternal(url);
      return { reason: 'ok' };
    } catch {
      return { reason: 'operation-failed' };
    }
  };
}

export function populateElectronHostShellPathOpen(out: HostShellPathOpenCapability, shell: ElectronApi['shell']): void {
  out.open = async (path) => {
    try {
      const message = await shell.openPath(path);
      return message === '' ? { reason: 'ok' } : { message, reason: 'operation-failed' };
    } catch (error) {
      return { message: errorMessage(error), reason: 'operation-failed' };
    }
  };
}

export function populateElectronHostShellPathReveal(
  out: HostShellPathRevealCapability,
  shell: ElectronApi['shell'],
): void {
  out.reveal = async (path) => {
    try {
      shell.showItemInFolder(path);
      return { reason: 'ok' };
    } catch {
      return { reason: 'operation-failed' };
    }
  };
}

export function populateElectronHostShellShortcutLink(
  out: HostShellShortcutLinkCapability,
  shell: ElectronApi['shell'],
): void {
  out.read = async (shortcutPath) => {
    try {
      const details = shell.readShortcutLink(shortcutPath);
      const link: ShellShortcutLink = {
        target: details.target,
        appUserModelId: details.appUserModelId,
        args: details.args,
        description: details.description,
        icon: details.icon,
        iconIndex: details.iconIndex,
        workingDirectory: details.cwd,
      };
      return { link, reason: 'ok' };
    } catch (error) {
      return { message: errorMessage(error), reason: 'operation-failed' };
    }
  };
  out.write = async (shortcutPath, link, operation) => {
    try {
      const details: ElectronShortcutDetails = {
        target: link.target,
        appUserModelId: link.appUserModelId,
        args: link.args,
        description: link.description,
        icon: link.icon,
        iconIndex: link.iconIndex,
        cwd: link.workingDirectory,
      };
      return { reason: shell.writeShortcutLink(shortcutPath, operation, details) ? 'ok' : 'operation-failed' };
    } catch {
      return { reason: 'operation-failed' };
    }
  };
}

export function populateElectronHostShellTrash(out: HostShellTrashCapability, shell: ElectronApi['shell']): void {
  out.moveToTrash = async (path) => {
    try {
      await shell.trashItem(path);
      return { reason: 'ok' };
    } catch {
      return { reason: 'operation-failed' };
    }
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
