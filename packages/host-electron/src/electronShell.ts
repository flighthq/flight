import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronShortcutDetails,
  EntityRuntimeKey,
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

// Builds Electron's exact Shell capability group. platform is caller-injected because shortcut-link
// support is a construction-time Windows fact, not something capability resolution reads ambiently.
export function makeElectronShellCapabilities(
  electron: ElectronApi,
  platform: PlatformName,
): HostShellCapabilities &
  Required<Pick<HostShellCapabilities, 'beep' | 'external' | 'pathOpen' | 'pathReveal' | 'trash'>> {
  const shell = electron.shell;
  const beep = allocateEntity<ShellBeepBackend>();
  beep.beep = () => {
      shell.beep();
    };
  const external = (() => {
    const out = allocateEntity<ShellExternalBackend>();
    out.open = async (url) => {
      try {
        await shell.openExternal(url);
        return { reason: 'ok' };
      } catch {
        return { reason: 'operation-failed' };
      }
    };
    return finishEntity(out);
  })();
  const pathOpen = (() => {
    const out = allocateEntity<ShellPathOpenBackend>();
    out.open = async (path) => {
      try {
        const message = await shell.openPath(path);
        return message === '' ? { reason: 'ok' } : { message, reason: 'operation-failed' };
      } catch (error) {
        return { message: errorMessage(error), reason: 'operation-failed' };
      }
    };
    return finishEntity(out);
  })();
  const pathReveal = (() => {
    const out = allocateEntity<ShellPathRevealBackend>();
    out.reveal = async (path) => {
      try {
        shell.showItemInFolder(path);
        return { reason: 'ok' };
      } catch {
        return { reason: 'operation-failed' };
      }
    };
    return finishEntity(out);
  })();
  const trash = (() => {
    const out = allocateEntity<ShellTrashBackend>();
    out.moveToTrash = async (path) => {
      try {
        await shell.trashItem(path);
        return { reason: 'ok' };
      } catch {
        return { reason: 'operation-failed' };
      }
    };
    return finishEntity(out);
  })();
  const shared = { beep, external, pathOpen, pathReveal, trash };
  if (platform !== 'windows') return shared;
  return { ...shared, shortcutLink: createElectronShellShortcutLinkBackend(electron) };
}

function createElectronShellShortcutLinkBackend(electron: ElectronApi): ShellShortcutLinkBackend {
  const shell = electron.shell;
    const out = allocateEntity<ShellShortcutLinkBackend>();
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
  return finishEntity(out);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
