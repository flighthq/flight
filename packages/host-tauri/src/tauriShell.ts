import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  HostShellCapabilities,
  HostShellExternalProvider,
  HostShellPathOpenProvider,
  HostShellPathRevealProvider,
  TauriApi,
} from '@flighthq/types/contract';

// Tauri's opener plugin provides exactly external URL, path-open, and path-reveal commands. Every
// provider is an Entity; unsupported trash, shortcut-link, and beep slots are omitted by construction.
export function tauriHostShell(
  tauri: TauriApi,
): HostShellCapabilities & Required<Pick<HostShellCapabilities, 'external' | 'pathOpen' | 'pathReveal'>> {
  return {
    external: tauriHostShellExternal(tauri),
    pathOpen: tauriHostShellPathOpen(tauri),
    pathReveal: tauriHostShellPathReveal(tauri),
  };
}

export function tauriHostShellExternal(tauri: TauriApi): HostShellExternalProvider {
  const provider = allocateEntity<HostShellExternalProvider>();
  provider.open = async (url) => {
    try {
      await tauri.opener.openUrl(url);
      return { reason: 'ok' };
    } catch {
      return { reason: 'operation-failed' };
    }
  };
  return finishEntity(provider);
}

export function tauriHostShellPathOpen(tauri: TauriApi): HostShellPathOpenProvider {
  const provider = allocateEntity<HostShellPathOpenProvider>();
  provider.open = async (path) => {
    try {
      await tauri.opener.openPath(path);
      return { reason: 'ok' };
    } catch (error) {
      return { message: errorMessage(error), reason: 'operation-failed' };
    }
  };
  return finishEntity(provider);
}

export function tauriHostShellPathReveal(tauri: TauriApi): HostShellPathRevealProvider {
  const provider = allocateEntity<HostShellPathRevealProvider>();
  provider.reveal = async (path) => {
    try {
      await tauri.opener.revealItemInDir(path);
      return { reason: 'ok' };
    } catch {
      return { reason: 'operation-failed' };
    }
  };
  return finishEntity(provider);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
