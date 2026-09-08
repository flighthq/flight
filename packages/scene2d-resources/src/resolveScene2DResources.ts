import type {
  ResolveScene2DResourcesOptions,
  Scene2DDocument,
  Scene2DResources,
  Scene2DSlotReference,
} from '@flighthq/types/contract';

import { reportScene2DResourceFailure } from './scene2DResourceDiagnostics';
import { setScene2DSlotReferenceContent } from './scene2DSlotReference';

// Reconciles one caller-selected working set of application slots entirely synchronously. Slot content is
// code the application already holds, so there is nothing to fetch, decode, or schedule here — a document's
// pixels travel the separate loadScene2DImageResources path.
export function resolveScene2DResources(
  document: Scene2DDocument,
  options?: Readonly<ResolveScene2DResourcesOptions>,
): Scene2DResources {
  const resolved: Scene2DResources['resolved'] = [];
  const unresolved: Scene2DSlotReference[] = [];
  let requiredTotal = 0;
  let requiredUnresolved = 0;
  for (let i = 0; i < document.slots.length; i++) {
    const reference = document.slots[i];
    if (options?.select !== undefined && !options.select(reference)) continue;
    if (reference.required) requiredTotal++;
    const content = options?.resolveSlotContent?.(reference) ?? null;
    setScene2DSlotReferenceContent(reference, content);
    if (content === null) {
      unresolved.push(reference);
      if (reference.required) requiredUnresolved++;
    } else resolved.push({ content, reference });
  }
  if (requiredUnresolved > 0) {
    reportScene2DResourceFailure({
      operation: 'resolveScene2DResources',
      reason: 'required-slots-unresolved',
      total: requiredTotal,
      unresolved: requiredUnresolved,
      url: null,
    });
  }
  return { document, resolved, root: document.root, unresolved };
}
