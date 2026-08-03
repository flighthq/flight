import { resolveAudioResourceReference } from '@flighthq/audio/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type {
  AudioResource,
  AudioResourceFetch,
  AudioResourceReference,
  LoadScene2DAudioResourcesOptions,
  Scene2DAudioResources,
  Scene2DDocument,
} from '@flighthq/types/contract';

// Operation-scoped asynchronous boundary for a document's sounds, the twin of loadScene2DImageResources.
// Each selected reference decodes once into the resource it already handed out, so a trigger bound before
// the load hears samples after it without being rebound. No resolver state survives this call.
export async function loadScene2DAudioResources(
  document: Scene2DDocument,
  options?: Readonly<LoadScene2DAudioResourcesOptions>,
): Promise<Scene2DAudioResources> {
  const selected = document.audioResources.filter(
    (reference) => options?.select === undefined || options.select(reference),
  );
  const signal = options?.signal ?? new AbortController().signal;
  const context = options?.context ?? null;
  const fetch = options?.fetch ?? rejectExternalAudioResource;
  let loaded = 0;

  const resources = await Promise.all(
    selected.map(async (reference): Promise<AudioResource | null> => {
      try {
        return await resolveAudioResourceReference(reference, context, fetch, signal);
      } finally {
        loaded++;
        if (options?.progress !== undefined) {
          emitSignal(options.progress, { loaded, reference, total: selected.length });
        }
      }
    }),
  );

  const resolved: AudioResourceReference[] = [];
  const unresolved: AudioResourceReference[] = [];
  for (let i = 0; i < selected.length; i++) {
    if (resources[i] === null) unresolved.push(selected[i]);
    else resolved.push(selected[i]);
  }
  return { document, resolved, unresolved };
}

// A document with no external sounds never needs a fetch seam, so the default reports the miss rather than
// making the caller supply a fetcher it has no use for.
const rejectExternalAudioResource: AudioResourceFetch = () => Promise.resolve(null);
