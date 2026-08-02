import { resolveImageResourceReference } from '@flighthq/image/contract';
import { emitSignal } from '@flighthq/signals/contract';
import { setTextureSource } from '@flighthq/texture/contract';
import type {
  Image,
  ImageResourceFetch,
  ImageResourceReference,
  LoadScene2DImageResourcesOptions,
  Scene2DDocument,
  Scene2DImageResources,
} from '@flighthq/types/contract';

// Operation-scoped asynchronous boundary for a document's pixels. Each selected reference decodes once and
// binds into every Texture waiting on it, so a bitmap character placed a hundred times costs one decode and
// a hundred assignments. No resolver state survives this call.
export async function loadScene2DImageResources(
  document: Scene2DDocument,
  options?: Readonly<LoadScene2DImageResourcesOptions>,
): Promise<Scene2DImageResources> {
  const selected = document.imageResources.filter(
    (reference) => options?.select === undefined || options.select(reference),
  );
  const signal = options?.signal ?? new AbortController().signal;
  const fetch = options?.fetch ?? rejectExternalImageResource;
  let loaded = 0;

  const images = await Promise.all(
    selected.map(async (reference): Promise<Image | null> => {
      try {
        return await resolveImageResourceReference(reference, fetch, signal);
      } finally {
        loaded++;
        if (options?.progress !== undefined) {
          emitSignal(options.progress, { loaded, reference, total: selected.length });
        }
      }
    }),
  );

  const resolved: ImageResourceReference[] = [];
  const unresolved: ImageResourceReference[] = [];
  for (let i = 0; i < selected.length; i++) {
    const reference = selected[i];
    const image = images[i];
    if (image === null) {
      unresolved.push(reference);
      continue;
    }
    bindScene2DImageResourceTextures(reference, image);
    resolved.push(reference);
  }
  return { document, resolved, unresolved };
}

// Fans one decoded image out to every Texture the reference names. setTextureSource bumps each texture's
// version, so renderers holding GPU handles against these textures re-upload on their next draw.
function bindScene2DImageResourceTextures(reference: Readonly<ImageResourceReference>, image: Image): void {
  const textures = reference.textures;
  if (textures === undefined) return;
  for (let i = 0; i < textures.length; i++) setTextureSource(textures[i], image);
}

// A document with no external images never needs a fetch seam, so the default reports the miss rather than
// making the caller supply a fetcher it has no use for.
const rejectExternalImageResource: ImageResourceFetch = () => Promise.resolve(null);
