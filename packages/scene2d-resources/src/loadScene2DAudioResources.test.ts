import {
  createAudioResource,
  createEmbeddedAudioResourceReference,
  createExternalAudioResourceReference,
} from '@flighthq/audio/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { connectSignal, createSignal } from '@flighthq/signals/contract';
import type { AudioResourceFetch, Scene2DAudioResourceLoadProgress } from '@flighthq/types/contract';
import { ResourceResolutionState } from '@flighthq/types/contract';

import { loadScene2DAudioResources } from './loadScene2DAudioResources';
import { createScene2DDocument } from './scene2DDocument';

const decodedBuffer = { duration: 1 } as AudioBuffer;

function createContext(): AudioContext {
  return { decodeAudioData: vi.fn().mockResolvedValue(decodedBuffer) } as unknown as AudioContext;
}

describe('loadScene2DAudioResources', () => {
  it('decodes every embedded reference and reports them resolved', async () => {
    const references = [
      createEmbeddedAudioResourceReference(new Uint8Array([1]), 'audio/mpeg'),
      createEmbeddedAudioResourceReference(new Uint8Array([2]), 'audio/mpeg'),
    ];
    const document = createScene2DDocument(createDisplayObject(), [], 'swf', null, [], references);

    const result = await loadScene2DAudioResources(document, { context: createContext() });

    expect(result.resolved).toEqual(references);
    expect(result.unresolved).toEqual([]);
    expect(result.document).toBe(document);
    for (const reference of references) {
      expect(reference.resource.buffer).toBe(decodedBuffer);
      expect(reference.state).toBe(ResourceResolutionState.Resolved);
    }
  });

  it('separates the references it could not resolve from the ones it could', async () => {
    // No context and no registered decoder, so this one has nothing that can take its bytes.
    const undecodable = createEmbeddedAudioResourceReference(new Uint8Array([1]), 'audio/vnd.acme.thing');
    const document = createScene2DDocument(createDisplayObject(), [], 'swf', null, [], [undecodable]);

    const result = await loadScene2DAudioResources(document, { context: null });

    expect(result.resolved).toEqual([]);
    expect(result.unresolved).toEqual([undecodable]);
    expect(undecodable.state).toBe(ResourceResolutionState.Failed);
  });

  it('loads only what select admits', async () => {
    const wanted = createEmbeddedAudioResourceReference(new Uint8Array([1]), 'audio/mpeg');
    const skipped = createEmbeddedAudioResourceReference(new Uint8Array([2]), 'audio/wav');
    const document = createScene2DDocument(createDisplayObject(), [], 'swf', null, [], [wanted, skipped]);

    const result = await loadScene2DAudioResources(document, {
      context: createContext(),
      select: (reference) => reference.mimeType === 'audio/mpeg',
    });

    expect(result.resolved).toEqual([wanted]);
    // A reference nobody selected is untouched rather than reported unresolved.
    expect(result.unresolved).toEqual([]);
    expect(skipped.state).toBe(ResourceResolutionState.Unresolved);
  });

  it('routes external references through the caller’s fetch seam', async () => {
    const fetch = vi.fn<AudioResourceFetch>(async () => createAudioResource(decodedBuffer));
    const reference = createExternalAudioResourceReference('hit.mp3', '/sounds');
    const document = createScene2DDocument(createDisplayObject(), [], 'spine', null, [], [reference]);

    const result = await loadScene2DAudioResources(document, { context: null, fetch });

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.resolved).toEqual([reference]);
  });

  it('reports an external reference unresolved when the caller supplied no fetch seam', async () => {
    const reference = createExternalAudioResourceReference('hit.mp3');
    const document = createScene2DDocument(createDisplayObject(), [], 'spine', null, [], [reference]);

    const result = await loadScene2DAudioResources(document, { context: createContext() });

    expect(result.unresolved).toEqual([reference]);
  });

  it('emits progress once per selected reference', async () => {
    const events: Scene2DAudioResourceLoadProgress[] = [];
    const progress = createSignal<(event: Readonly<Scene2DAudioResourceLoadProgress>) => void>();
    connectSignal(progress, (event) => events.push({ ...event }));
    const references = [
      createEmbeddedAudioResourceReference(new Uint8Array([1]), 'audio/mpeg'),
      createEmbeddedAudioResourceReference(new Uint8Array([2]), 'audio/mpeg'),
    ];
    const document = createScene2DDocument(createDisplayObject(), [], 'swf', null, [], references);

    await loadScene2DAudioResources(document, { context: createContext(), progress });

    expect(events.map((event) => event.loaded)).toEqual([1, 2]);
    expect(events.every((event) => event.total === 2)).toBe(true);
  });

  it('resolves to empty contracts for a document that carries no audio', async () => {
    const document = createScene2DDocument(createDisplayObject());
    const result = await loadScene2DAudioResources(document);
    expect(result.resolved).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });
});
