import type { ImportDiagnostic, PathBooleanKernel, RiveDocumentImportResult } from '@flighthq/types/contract';

import { registerAllRiveHandlers } from './riveHandlers.ts';
import { createRiveImportRegistry } from './riveImportRegistry.ts';
import { createRiveDocumentImportResult } from './riveScene2D.ts';

/**
 * Imports a `.riv` with every family this package reads — the whole format, in one call.
 *
 * ★ THIS MODULE EXISTS TO OWN THE DEFAULT, AND NOTHING ELSE. `createRiveDocumentImportResult` does the work and takes
 * the registry as an argument; naming the full preset is the one thing that cannot live beside it, because a module that
 * names `registerAllRiveHandlers` names every family in the package. The audit measured that esbuild shakes the unused
 * import today — an empty-registry import came out identical either way — but the coupling was there to be broken by any
 * future change that made the preset reachable, and a gate can only assert the source-level claim if it is true.
 *
 * The kernel stays an explicit argument here as it is everywhere else: it is a dependency the host supplies, not a
 * choice about which families to install.
 */
export function createScene2DFromRiveDocument(
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  source: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): RiveDocumentImportResult {
  const registry = createRiveImportRegistry();
  registerAllRiveHandlers(pathBooleanKernel, registry);
  return createRiveDocumentImportResult(registry, source, diagnostics);
}
