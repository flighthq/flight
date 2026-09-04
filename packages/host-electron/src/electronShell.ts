import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronShortcutDetails,
  EntityConstruction,
  HostShellCapabilities,
  PlatformName,
  ShellBeepBackend,
  ShellExternalBackend,
  ShellPathOpenBackend,
  ShellPathRevealBackend,
  ShellShortcutLink,
  ShellShortcutLinkBackend,
  ShellTrashBackend,
} from '@flighthq/types/contract';

export function initializeShellBeepBackend(
  out: EntityConstruction<ShellBeepBackend>,
  shell: ElectronApi['shell'],
): void {
  out.beep = () => {
    shell.beep();
  };
}

export function initializeShellExternalBackend(
  out: EntityConstruction<ShellExternalBackend>,
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

export function initializeShellPathOpenBackend(
  out: EntityConstruction<ShellPathOpenBackend>,
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

export function initializeShellPathRevealBackend(
  out: EntityConstruction<ShellPathRevealBackend>,
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

export function initializeShellShortcutLinkBackend(
  out: EntityConstruction<ShellShortcutLinkBackend>,
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

export function initializeShellTrashBackend(
  out: EntityConstruction<ShellTrashBackend>,
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

// Builds Electron's exact Shell capability group. platform is caller-injected because shortcut-link
// support is a construction-time Windows fact, not something capability resolution reads ambiently.
export function makeElectronShellCapabilities(
  electron: ElectronApi,
  platform: PlatformName,
): HostShellCapabilities &
  Required<Pick<HostShellCapabilities, 'beep' | 'external' | 'pathOpen' | 'pathReveal' | 'trash'>> {
  const shell = electron.shell;
  const beep = allocateEntity<ShellBeepBackend>();
  initializeShellBeepBackend(beep, shell);
  const external = (() => {
    const out = allocateEntity<ShellExternalBackend>();
    initializeShellExternalBackend(out, shell);
    return finishEntity(out);
  })();
  const pathOpen = (() => {
    const out = allocateEntity<ShellPathOpenBackend>();
    initializeShellPathOpenBackend(out, shell);
    return finishEntity(out);
  })();
  const pathReveal = (() => {
    const out = allocateEntity<ShellPathRevealBackend>();
    initializeShellPathRevealBackend(out, shell);
    return finishEntity(out);
  })();
  const trash = (() => {
    const out = allocateEntity<ShellTrashBackend>();
    initializeShellTrashBackend(out, shell);
    return finishEntity(out);
  })();
  const shared = { beep, external, pathOpen, pathReveal, trash };
  if (platform !== 'windows') return shared;
  return { ...shared, shortcutLink: createElectronShellShortcutLinkBackend(electron) };
}

function createElectronShellShortcutLinkBackend(electron: ElectronApi): ShellShortcutLinkBackend {
  const out = allocateEntity<ShellShortcutLinkBackend>();
  initializeShellShortcutLinkBackend(out, electron.shell);
  return finishEntity(out);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
