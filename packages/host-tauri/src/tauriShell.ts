import type {
  HostShellCapabilities,
  HostShellExternalCapability,
  HostShellPathOpenCapability,
  HostShellPathRevealCapability,
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

export function tauriHostShellExternal(tauri: TauriApi): HostShellExternalCapability {
  const provider = {} as HostShellExternalCapability;
  provider.open = async (url) => {
    try {
      await tauri.opener.openUrl(url);
      return { reason: 'ok' };
    } catch {
      return { reason: 'operation-failed' };
    }
  };
  return provider;
}

export function tauriHostShellPathOpen(tauri: TauriApi): HostShellPathOpenCapability {
  const provider = {} as HostShellPathOpenCapability;
  provider.open = async (path) => {
    try {
      await tauri.opener.openPath(path);
      return { reason: 'ok' };
    } catch (error) {
      return { message: errorMessage(error), reason: 'operation-failed' };
    }
  };
  return provider;
}

export function tauriHostShellPathReveal(tauri: TauriApi): HostShellPathRevealCapability {
  const provider = {} as HostShellPathRevealCapability;
  provider.reveal = async (path) => {
    try {
      await tauri.opener.revealItemInDir(path);
      return { reason: 'ok' };
    } catch {
      return { reason: 'operation-failed' };
    }
  };
  return provider;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
