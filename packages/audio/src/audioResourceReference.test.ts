import { createEntity } from '@flighthq/entity/contract';
import type { AudioDecoder, AudioResourceFetch } from '@flighthq/types/contract';
import { EntityRuntimeKey, ResourceResolutionState } from '@flighthq/types/contract';

import { getAudioDecoderMimeTypes, registerAudioDecoder, unregisterAudioDecoder } from './audioDecoderRegistry';
import { createAudioResource } from './audioResource';
import {
  createAudioResourceFailure,
  createEmbeddedAudioResourceReference,
  createExternalAudioResourceReference,
  explainAudioResourceReferenceResolution,
  findAudioResourceReferenceByName,
  resetFailedAudioResourceReference,
  resolveAudioResourceReference,
} from './audioResourceReference';

describe('createAudioResourceFailure', () => {
  it('keeps an Error’s name and message without retaining the Error', () => {
    const failure = createAudioResourceFailure(new TypeError('bad bytes'));
    expect(Object.hasOwn(failure, EntityRuntimeKey)).toBe(true);
    expect(failure).toMatchObject({ kind: 'Error', message: 'bad bytes', name: 'TypeError' });
  });

  it('stringifies a thrown non-Error', () => {
    const failure = createAudioResourceFailure('nope');
    expect(Object.hasOwn(failure, EntityRuntimeKey)).toBe(true);
    expect(failure).toMatchObject({ kind: 'Error', message: 'nope', name: null });
  });
});

describe('createEmbeddedAudioResourceReference', () => {
  it('starts unresolved with a resource waiting for its samples', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const reference = createEmbeddedAudioResourceReference(bytes, 'audio/mpeg', 'theme');

    expect(reference.kind).toBe('Embedded');
    expect(reference.bytes).toBe(bytes);
    expect(reference.mimeType).toBe('audio/mpeg');
    expect(reference.name).toBe('theme');
    expect(reference.failure).toBeNull();
    expect(reference.state).toBe(ResourceResolutionState.Unresolved);
    // The resource exists before its samples do, so a cue can hold it while the bytes are undecoded.
    expect(reference.resource.buffer).toBeNull();
  });

  it('borrows the caller’s bytes rather than copying them', () => {
    const bytes = new Uint8Array([9, 9]);
    expect(createEmbeddedAudioResourceReference(bytes).bytes).toBe(bytes);
  });

  it('leaves the mime type and name null when the container declared neither', () => {
    const reference = createEmbeddedAudioResourceReference(new Uint8Array([0]));
    expect(reference.mimeType).toBeNull();
    expect(reference.name).toBeNull();
  });

  it('gives each reference its own resource', () => {
    const first = createEmbeddedAudioResourceReference(new Uint8Array([1]));
    const second = createEmbeddedAudioResourceReference(new Uint8Array([2]));
    expect(first.resource).not.toBe(second.resource);
  });
});

describe('createExternalAudioResourceReference', () => {
  it('names a uri that has not been fetched yet', () => {
    const reference = createExternalAudioResourceReference('hit.mp3', '/sounds', 'audio/mpeg', 'hit');
    expect(reference.kind).toBe('External');
    expect(reference.uri).toBe('hit.mp3');
    expect(reference.basePath).toBe('/sounds');
    expect(reference.mimeType).toBe('audio/mpeg');
    expect(reference.name).toBe('hit');
    expect(reference.resource.buffer).toBeNull();
    expect(reference.state).toBe(ResourceResolutionState.Unresolved);
  });

  it('defaults the base path and the declared type to null', () => {
    const reference = createExternalAudioResourceReference('hit.mp3');
    expect(reference.basePath).toBeNull();
    expect(reference.mimeType).toBeNull();
  });
});

describe('explainAudioResourceReferenceResolution', () => {
  it('reports an unresolved reference as not retryable', () => {
    const reference = createEmbeddedAudioResourceReference(new Uint8Array([1]));
    expect(explainAudioResourceReferenceResolution(reference)).toEqual({
      failure: null,
      kind: 'Embedded',
      retryable: false,
      state: ResourceResolutionState.Unresolved,
    });
  });

  it('detaches the failure so a caller cannot mutate the reference through it', () => {
    const reference = createEmbeddedAudioResourceReference(new Uint8Array([1]));
    reference.state = ResourceResolutionState.Failed;
    reference.failure = createEntity({ kind: 'Error' as const, message: 'boom', name: null });
    const explanation = explainAudioResourceReferenceResolution(reference);
    expect(explanation.retryable).toBe(true);
    expect(explanation.failure).not.toBe(reference.failure);
    explanation.failure!.message = 'changed';
    expect(reference.failure.message).toBe('boom');
  });
});

describe('findAudioResourceReferenceByName', () => {
  it('returns the reference carrying the name', () => {
    const first = createEmbeddedAudioResourceReference(new Uint8Array([1]), 'audio/mpeg', 'intro');
    const second = createEmbeddedAudioResourceReference(new Uint8Array([2]), 'audio/mpeg', 'loop');
    expect(findAudioResourceReferenceByName([first, second], 'loop')).toBe(second);
  });

  it('returns null for a name the document does not carry', () => {
    const only = createEmbeddedAudioResourceReference(new Uint8Array([1]));
    expect(findAudioResourceReferenceByName([only], 'missing')).toBeNull();
    expect(findAudioResourceReferenceByName([], 'anything')).toBeNull();
  });
});

describe('resetFailedAudioResourceReference', () => {
  it('returns a failed reference to unresolved', () => {
    const reference = createEmbeddedAudioResourceReference(new Uint8Array([1]));
    reference.state = ResourceResolutionState.Failed;
    reference.failure = createEntity({ kind: 'Error' as const, message: 'boom', name: null });
    expect(resetFailedAudioResourceReference(reference)).toBe(true);
    expect(reference.state).toBe(ResourceResolutionState.Unresolved);
    expect(reference.failure).toBeNull();
  });

  it('leaves a reference that never failed untouched', () => {
    const reference = createEmbeddedAudioResourceReference(new Uint8Array([1]));
    reference.state = ResourceResolutionState.Resolved;
    expect(resetFailedAudioResourceReference(reference)).toBe(false);
    expect(reference.state).toBe(ResourceResolutionState.Resolved);
  });
});

describe('resolveAudioResourceReference', () => {
  const decodedBuffer = { duration: 1 } as AudioBuffer;
  const context = { decodeAudioData: vi.fn().mockResolvedValue(decodedBuffer) } as unknown as AudioContext;
  const noFetch: AudioResourceFetch = async () => null;

  afterEach(() => {
    for (const mimeType of [...getAudioDecoderMimeTypes()]) unregisterAudioDecoder(mimeType);
  });

  it('decodes embedded bytes through the platform and binds them into the reference’s own resource', async () => {
    const reference = createEmbeddedAudioResourceReference(new Uint8Array([1, 2]), 'audio/mpeg');
    const resource = reference.resource;

    const resolved = await resolveAudioResourceReference(reference, context, noFetch, new AbortController().signal);

    // The resource every cue already holds is the one that gains the samples; swapping in the decoder's
    // own would leave every cue pointing at an empty resource.
    expect(resolved).toBe(resource);
    expect(resource.buffer).toBe(decodedBuffer);
    expect(reference.state).toBe(ResourceResolutionState.Resolved);
  });

  it('prefers a registered decoder over the platform for a format the platform cannot parse', async () => {
    const swfBuffer = { duration: 2 } as AudioBuffer;
    const decoder = vi.fn<AudioDecoder>(async () => createAudioResource(swfBuffer));
    registerAudioDecoder('audio/vnd.adobe.swf-adpcm', decoder);
    const reference = createEmbeddedAudioResourceReference(
      new Uint8Array([7]),
      'audio/vnd.adobe.swf-adpcm; rate=22050; channels=1',
    );

    await resolveAudioResourceReference(reference, context, noFetch, new AbortController().signal);

    expect(decoder).toHaveBeenCalledOnce();
    // The decoder gets the whole type, parameters included, because that is where its rate lives.
    expect(decoder.mock.calls[0][1]).toBe('audio/vnd.adobe.swf-adpcm; rate=22050; channels=1');
    expect(reference.resource.buffer).toBe(swfBuffer);
  });

  it('fails rather than throwing when no decoder and no context can take the bytes', async () => {
    const reference = createEmbeddedAudioResourceReference(new Uint8Array([7]), 'audio/vnd.adobe.swf-adpcm');
    const resolved = await resolveAudioResourceReference(reference, null, noFetch, new AbortController().signal);

    expect(resolved).toBeNull();
    expect(reference.state).toBe(ResourceResolutionState.Failed);
    expect(Object.hasOwn(reference.failure!, EntityRuntimeKey)).toBe(true);
    expect(reference.failure).toMatchObject({
      kind: 'Unavailable',
      message: 'Audio resource unavailable',
      name: null,
    });
  });

  it('routes an external reference through the fetch seam', async () => {
    const fetched = { duration: 3 } as AudioBuffer;
    const fetch = vi.fn(async () => createAudioResource(fetched));
    const reference = createExternalAudioResourceReference('hit.mp3', '/sounds');

    await resolveAudioResourceReference(reference, context, fetch, new AbortController().signal);

    expect(fetch).toHaveBeenCalledOnce();
    expect(reference.resource.buffer).toBe(fetched);
    expect(reference.state).toBe(ResourceResolutionState.Resolved);
  });

  it('records a thrown decode as a failure rather than propagating it', async () => {
    const failing = {
      decodeAudioData: vi.fn().mockRejectedValue(new TypeError('bad bytes')),
    } as unknown as AudioContext;
    const reference = createEmbeddedAudioResourceReference(new Uint8Array([1]), 'audio/mpeg');

    const resolved = await resolveAudioResourceReference(reference, failing, noFetch, new AbortController().signal);

    expect(resolved).toBeNull();
    expect(reference.state).toBe(ResourceResolutionState.Failed);
    expect(Object.hasOwn(reference.failure!, EntityRuntimeKey)).toBe(true);
    expect(reference.failure).toMatchObject({ kind: 'Error', message: 'bad bytes', name: 'TypeError' });
  });

  it('treats an abort as a cancel, leaving the reference requestable rather than failed', async () => {
    const controller = new AbortController();
    const failing = {
      decodeAudioData: vi.fn().mockRejectedValue(new Error('cancelled')),
    } as unknown as AudioContext;
    controller.abort(new Error('cancelled'));
    const reference = createEmbeddedAudioResourceReference(new Uint8Array([1]), 'audio/mpeg');

    await expect(resolveAudioResourceReference(reference, failing, noFetch, controller.signal)).rejects.toThrow();
    expect(reference.state).toBe(ResourceResolutionState.Unresolved);
    expect(reference.failure).toBeNull();
  });
});
