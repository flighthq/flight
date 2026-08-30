import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityRuntimeKey,
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
  const external: ShellExternalBackend = createEntity({
    async open(url) {
      try {
        await opener.openUrl(url);
        return { reason: 'ok' };
      } catch {
        return { reason: 'operation-failed' };
      }
    },
  } satisfies Omit<ShellExternalBackend, typeof EntityRuntimeKey>);
  const pathOpen: ShellPathOpenBackend = createEntity({
    async open(path) {
      try {
        await opener.openPath(path);
        return { reason: 'ok' };
      } catch (error) {
        return { message: errorMessage(error), reason: 'operation-failed' };
      }
    },
  } satisfies Omit<ShellPathOpenBackend, typeof EntityRuntimeKey>);
  const pathReveal: ShellPathRevealBackend = createEntity({
    async reveal(path) {
      try {
        await opener.revealItemInDir(path);
        return { reason: 'ok' };
      } catch {
        return { reason: 'operation-failed' };
      }
    },
  } satisfies Omit<ShellPathRevealBackend, typeof EntityRuntimeKey>);
  return { external, pathOpen, pathReveal };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
