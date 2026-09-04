import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  HostShellCapabilities,
  ShellExternalBackend,
  ShellPathOpenBackend,
  ShellPathRevealBackend,
  TauriApi,
} from '@flighthq/types/contract';

// Tauri's opener plugin provides exactly external URL, path-open, and path-reveal commands. Every
// provider is an Entity; unsupported trash, shortcut-link, and beep slots are omitted by construction.
export function makeTauriShellCapabilities(
  tauri: TauriApi,
): HostShellCapabilities & Required<Pick<HostShellCapabilities, 'external' | 'pathOpen' | 'pathReveal'>> {
  const opener = tauri.opener;
  const external = allocateEntity<ShellExternalBackend>();
  external.open = async (url) => {
    try {
      await opener.openUrl(url);
      return { reason: 'ok' };
    } catch {
      return { reason: 'operation-failed' };
    }
  };
  const pathOpen = (() => {
    const out = allocateEntity<ShellPathOpenBackend>();
    out.open = async (path) => {
      try {
        await opener.openPath(path);
        return { reason: 'ok' };
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
        await opener.revealItemInDir(path);
        return { reason: 'ok' };
      } catch {
        return { reason: 'operation-failed' };
      }
    };
    return finishEntity(out);
  })();
  return { external, pathOpen, pathReveal };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
