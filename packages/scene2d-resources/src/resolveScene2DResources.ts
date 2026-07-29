import type {
  Node2D,
  ResolveScene2DResourcesOptions,
  Scene2DContentReference,
  Scene2DDocument,
  Scene2DResources,
} from '@flighthq/types/contract';
import { Scene2DContentReferenceKind } from '@flighthq/types/contract';

import { setScene2DContentReferenceContent } from './scene2DContentReference';

// Reconciles one caller-selected working set entirely synchronously. Asset content must already be
// available through resolveAssetContent; application slots resolve by name/linkage. This function performs
// no fetch, decode, Promise scheduling, or registry dispatch.
export function resolveScene2DResources(
  document: Scene2DDocument,
  options?: Readonly<ResolveScene2DResourcesOptions>,
): Scene2DResources {
  const resolved: Scene2DResources['resolved'] = [];
  const unresolved: Scene2DContentReference[] = [];
  for (let i = 0; i < document.references.length; i++) {
    const reference = document.references[i];
    if (options?.select !== undefined && !options.select(reference)) continue;
    const content = resolveScene2DContentReference(reference, options);
    if (content === null) {
      setScene2DContentReferenceContent(reference, null);
      unresolved.push(reference);
    } else {
      setScene2DContentReferenceContent(reference, content);
      resolved.push({ content, reference });
    }
  }
  return { document, resolved, root: document.root, unresolved };
}

function resolveScene2DContentReference(
  reference: Readonly<Scene2DContentReference>,
  options: Readonly<ResolveScene2DResourcesOptions> | undefined,
): Node2D | null {
  if (reference.kind === Scene2DContentReferenceKind.Asset) {
    return options?.resolveAssetContent?.(reference.name, reference.uri) ?? null;
  }
  return options?.resolveSlotContent?.(reference.name, reference.linkage) ?? null;
}
