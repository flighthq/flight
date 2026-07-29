import { setNode2DSlotContent } from '@flighthq/scene2d/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type {
  LoadScene2DResourcesOptions,
  Node2D,
  Scene2DContentReference,
  Scene2DDocument,
  Scene2DResourceResolution,
  Scene2DResources,
} from '@flighthq/types/contract';
import { Scene2DContentReferenceKind } from '@flighthq/types/contract';

// Operation-scoped asynchronous boundary. Slot fills remain synchronous and code-driven; only asset
// references cross the caller-supplied Promise seam. No resolver state survives this call.
export async function loadScene2DResources(
  document: Scene2DDocument,
  options: Readonly<LoadScene2DResourcesOptions>,
): Promise<Scene2DResources> {
  const selected = document.references.filter((reference) => options.select === undefined || options.select(reference));
  const signal = options.signal ?? new AbortController().signal;
  let loaded = 0;

  const loads = selected.map(async (reference): Promise<Node2D | null> => {
    try {
      if (reference.kind === Scene2DContentReferenceKind.Slot) {
        return options.resolveSlotContent?.(reference.name, reference.linkage) ?? null;
      }
      return await options.loadAssetContent(reference.name, reference.uri, signal);
    } finally {
      loaded++;
      emitScene2DResourceLoadProgress(options, loaded, selected.length, reference);
    }
  });
  const contents = await Promise.all(loads);
  const resolved: Scene2DResourceResolution[] = [];
  const unresolved: Scene2DContentReference[] = [];
  for (let i = 0; i < selected.length; i++) {
    reconcileLoadedScene2DContent(selected[i], contents[i], resolved, unresolved);
  }
  return { document, resolved, root: document.root, unresolved };
}

function emitScene2DResourceLoadProgress(
  options: Readonly<LoadScene2DResourcesOptions>,
  loaded: number,
  total: number,
  reference: Readonly<Scene2DContentReference>,
): void {
  if (options.progress === undefined) return;
  emitSignal(options.progress, {
    kind: reference.kind,
    loaded,
    name: reference.name,
    total,
  });
}

function reconcileLoadedScene2DContent(
  reference: Scene2DContentReference,
  content: Node2D | null,
  resolved: Scene2DResourceResolution[],
  unresolved: Scene2DContentReference[],
): void {
  setNode2DSlotContent(reference.target, content);
  if (content === null) unresolved.push(reference);
  else resolved.push({ content, reference });
}
