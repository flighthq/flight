import { getNodeParent } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { connectSignal, createSignal } from '@flighthq/signals/contract';
import type { Scene2DResourceLoadProgress } from '@flighthq/types/contract';

import { loadScene2DResources } from './loadScene2DResources';
import { createScene2DAssetReference, createScene2DDocument, createScene2DSlotReference } from './scene2DDocument';

describe('loadScene2DResources', () => {
  it('brackets async assets and synchronous slots in one result', async () => {
    const assetTarget = createDisplayObject();
    const slotTarget = createDisplayObject();
    const assetContent = createDisplayObject();
    const slotContent = createDisplayObject();
    const document = createScene2DDocument(createDisplayObject(), [
      createScene2DAssetReference('background', 'bg.png', assetTarget),
      createScene2DSlotReference('avatar', slotTarget, 'Game.Avatar'),
    ]);

    const resources = await loadScene2DResources(document, {
      loadAssetContent: async (name, uri) => (name === 'background' && uri === 'bg.png' ? assetContent : null),
      resolveSlotContent: () => slotContent,
    });

    expect(resources.resolved).toHaveLength(2);
    expect(getNodeParent(assetContent)).toBe(assetTarget);
    expect(getNodeParent(slotContent)).toBe(slotTarget);
  });

  it('reports operation-scoped completion progress', async () => {
    const progress = createSignal<(event: Readonly<Scene2DResourceLoadProgress>) => void>();
    const events: Scene2DResourceLoadProgress[] = [];
    connectSignal(progress, (event) => events.push({ ...event }));
    const document = createScene2DDocument(createDisplayObject(), [
      createScene2DAssetReference('a', 'a.png', createDisplayObject()),
      createScene2DAssetReference('b', 'b.png', createDisplayObject()),
    ]);
    await loadScene2DResources(document, {
      loadAssetContent: async () => createDisplayObject(),
      progress,
    });
    expect(events.map((event) => event.loaded).sort()).toEqual([1, 2]);
    expect(events.every((event) => event.total === 2)).toBe(true);
  });

  it('returns resolutions in manifest order when assets settle out of order', async () => {
    let releaseFirst: (content: ReturnType<typeof createDisplayObject>) => void = () => {};
    const first = new Promise<ReturnType<typeof createDisplayObject>>((resolve) => {
      releaseFirst = resolve;
    });
    const secondContent = createDisplayObject();
    const document = createScene2DDocument(createDisplayObject(), [
      createScene2DAssetReference('first', 'first.png', createDisplayObject()),
      createScene2DAssetReference('second', 'second.png', createDisplayObject()),
    ]);
    const operation = loadScene2DResources(document, {
      loadAssetContent: (name) => (name === 'first' ? first : Promise.resolve(secondContent)),
    });
    releaseFirst(createDisplayObject());
    const resources = await operation;
    expect(resources.resolved.map((entry) => entry.reference.name)).toEqual(['first', 'second']);
  });

  it('relays caller cancellation into the asset loader', async () => {
    const controller = new AbortController();
    controller.abort('stop');
    const received: AbortSignal[] = [];
    const document = createScene2DDocument(createDisplayObject(), [
      createScene2DAssetReference('a', 'a.png', createDisplayObject()),
    ]);
    await loadScene2DResources(document, {
      loadAssetContent: async (_name, _uri, signal) => {
        received.push(signal);
        return null;
      },
      signal: controller.signal,
    });
    expect(received[0].aborted).toBe(true);
    expect(received[0].reason).toBe('stop');
  });
});
