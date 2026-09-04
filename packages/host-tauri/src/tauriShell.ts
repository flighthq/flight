import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  HostShellCapabilities,
  ShellExternalBackend,
  ShellPathOpenBackend,
  ShellPathRevealBackend,
  TauriApi,
} from '@flighthq/types/contract';

export function initializeTauriShellExternalBackend(
  out: EntityConstruction<ShellExternalBackend>,
  opener: TauriApi['opener'],
): void {
  out.open = async (url) => {
    try {
      await opener.openUrl(url);
      return { reason: 'ok' };
    } catch {
      return { reason: 'operation-failed' };
    }
  };
}

export function initializeTauriShellPathOpenBackend(
  out: EntityConstruction<ShellPathOpenBackend>,
  opener: TauriApi['opener'],
): void {
  out.open = async (path) => {
    try {
      await opener.openPath(path);
      return { reason: 'ok' };
    } catch (error) {
      return { message: errorMessage(error), reason: 'operation-failed' };
    }
  };
}

export function initializeTauriShellPathRevealBackend(
  out: EntityConstruction<ShellPathRevealBackend>,
  opener: TauriApi['opener'],
): void {
  out.reveal = async (path) => {
    try {
      await opener.revealItemInDir(path);
      return { reason: 'ok' };
    } catch {
      return { reason: 'operation-failed' };
    }
  };
}

// Tauri's opener plugin provides exactly external URL, path-open, and path-reveal commands. Every
// provider is an Entity; unsupported trash, shortcut-link, and beep slots are omitted by construction.
export function makeTauriShellCapabilities(
  tauri: TauriApi,
): HostShellCapabilities & Required<Pick<HostShellCapabilities, 'external' | 'pathOpen' | 'pathReveal'>> {
  const opener = tauri.opener;
  const external = allocateEntity<ShellExternalBackend>();
  initializeTauriShellExternalBackend(external, opener);
  const pathOpenOut = allocateEntity<ShellPathOpenBackend>();
  initializeTauriShellPathOpenBackend(pathOpenOut, opener);
  const pathOpen = finishEntity(pathOpenOut);
  const pathRevealOut = allocateEntity<ShellPathRevealBackend>();
  initializeTauriShellPathRevealBackend(pathRevealOut, opener);
  const pathReveal = finishEntity(pathRevealOut);
  return { external, pathOpen, pathReveal };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
