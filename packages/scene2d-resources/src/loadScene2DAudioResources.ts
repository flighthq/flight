import { resolveAudioResourceReference } from '@flighthq/audio/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type {
  AudioResource,
  AudioResourceFetch,
  AudioResourceReference,
  LoadScene2DAudioResourcesOptions,
  Scene2DAudioResources,
  HostAudioDecodeCapabilities,
  Scene2DDocument,
} from '@flighthq/types/contract';

import { reportScene2DResourceFailure } from './scene2DResourceDiagnostics.ts';

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
  const audioDecode = options?.audioDecode ?? EMPTY_AUDIO_DECODE;
  const fetch = options?.fetch ?? rejectExternalAudioResource;
  let loaded = 0;

  const resources = await Promise.all(
    selected.map(async (reference): Promise<AudioResource | null> => {
      try {
        return await resolveAudioResourceReference(reference, audioDecode, fetch, signal, options?.decoders);
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
  const result = { document, resolved, unresolved };
  if (unresolved.length > 0) {
    reportScene2DResourceFailure({
      operation: 'loadScene2DAudioResources',
      reason: 'audio-resources-unresolved',
      total: selected.length,
      unresolved: unresolved.length,
      url: null,
    });
  }
  return result;
}

// A document with no external sounds never needs a fetch seam, so the default reports the miss rather than
// making the caller supply a fetcher it has no use for.
const rejectExternalAudioResource: AudioResourceFetch = () => Promise.resolve(null);

// A caller who names no host decoders gets a group with every slot empty rather than a thrown
// precondition: a document whose sounds are all external, or all covered by the caller's own decoders,
// has nothing for a standard container decoder to do.
const EMPTY_AUDIO_DECODE: Readonly<HostAudioDecodeCapabilities> = {};
