import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronShortcutDetails,
  DesktopOsProfile,
  EntityConstruction,
  HostShellCapabilities,
  HostShellBeepProvider,
  HostShellExternalProvider,
  HostShellPathOpenProvider,
  HostShellPathRevealProvider,
  ShellShortcutLink,
  HostShellShortcutLinkProvider,
  HostShellTrashProvider,
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

export function electronHostShellBeep(electron: ElectronApi): HostShellBeepProvider {
  const out = allocateEntity<HostShellBeepProvider>();
  populateElectronHostShellBeep(out, electron.shell);
  return finishEntity(out);
}

export function electronHostShellExternal(electron: ElectronApi): HostShellExternalProvider {
  const out = allocateEntity<HostShellExternalProvider>();
  populateElectronHostShellExternal(out, electron.shell);
  return finishEntity(out);
}

export function electronHostShellPathOpen(electron: ElectronApi): HostShellPathOpenProvider {
  const out = allocateEntity<HostShellPathOpenProvider>();
  populateElectronHostShellPathOpen(out, electron.shell);
  return finishEntity(out);
}

export function electronHostShellPathReveal(electron: ElectronApi): HostShellPathRevealProvider {
  const out = allocateEntity<HostShellPathRevealProvider>();
  populateElectronHostShellPathReveal(out, electron.shell);
  return finishEntity(out);
}

export function electronHostShellShortcutLink(electron: ElectronApi): HostShellShortcutLinkProvider {
  const out = allocateEntity<HostShellShortcutLinkProvider>();
  populateElectronHostShellShortcutLink(out, electron.shell);
  return finishEntity(out);
}

export function electronHostShellTrash(electron: ElectronApi): HostShellTrashProvider {
  const out = allocateEntity<HostShellTrashProvider>();
  populateElectronHostShellTrash(out, electron.shell);
  return finishEntity(out);
}

export function populateElectronHostShellBeep(
  out: EntityConstruction<HostShellBeepProvider>,
  shell: ElectronApi['shell'],
): void {
  out.beep = () => {
    shell.beep();
  };
}

export function populateElectronHostShellExternal(
  out: EntityConstruction<HostShellExternalProvider>,
  shell: ElectronApi['shell'],
): void {
  out.open = async (url) => {
    try {
      await shell.openExternal(url);
      return { reason: 'ok' };
    } catch {
      return { reason: 'operation-failed' };
    }
  };
}

export function populateElectronHostShellPathOpen(
  out: EntityConstruction<HostShellPathOpenProvider>,
  shell: ElectronApi['shell'],
): void {
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
  out: EntityConstruction<HostShellPathRevealProvider>,
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
  out: EntityConstruction<HostShellShortcutLinkProvider>,
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

export function populateElectronHostShellTrash(
  out: EntityConstruction<HostShellTrashProvider>,
  shell: ElectronApi['shell'],
): void {
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
