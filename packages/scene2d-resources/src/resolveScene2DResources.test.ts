import { getNodeParent } from '@flighthq/node/contract';
import { createDisplayObject, getNode2DSlotContent, setNode2DSlotContent } from '@flighthq/scene2d/contract';

import { resolveScene2DResources } from './resolveScene2DResources';
import { createScene2DAssetReference, createScene2DDocument, createScene2DSlotReference } from './scene2DDocument';

describe('resolveScene2DResources', () => {
  it('reconciles asset and application slot content synchronously', () => {
    const root = createDisplayObject();
    const assetTarget = createDisplayObject();
    const slotTarget = createDisplayObject();
    const assetContent = createDisplayObject();
    const slotContent = createDisplayObject();
    const document = createScene2DDocument(root, [
      createScene2DAssetReference('background', 'bg.png', assetTarget),
      createScene2DSlotReference('avatar', slotTarget, 'Game.Avatar'),
    ]);

    const resources = resolveScene2DResources(document, {
      resolveAssetContent: (name, uri) => (name === 'background' && uri === 'bg.png' ? assetContent : null),
      resolveSlotContent: (name, linkage) => (name === 'avatar' && linkage === 'Game.Avatar' ? slotContent : null),
    });

    expect(resources.resolved.map((entry) => entry.content)).toEqual([assetContent, slotContent]);
    expect(resources.unresolved).toEqual([]);
    expect(getNodeParent(assetContent)).toBe(assetTarget);
    expect(getNodeParent(slotContent)).toBe(slotTarget);
  });

  it('clears stale managed content when a selected reference is unresolved', () => {
    const target = createDisplayObject();
    const stale = createDisplayObject();
    setNode2DSlotContent(target, stale);
    const reference = createScene2DSlotReference('missing', target);
    const resources = resolveScene2DResources(createScene2DDocument(createDisplayObject(), [reference]));
    expect(resources.unresolved).toEqual([reference]);
    expect(getNode2DSlotContent(target)).toBeNull();
    expect(getNodeParent(stale)).toBeNull();
  });

  it('leaves references outside the selected working set untouched', () => {
    const target = createDisplayObject();
    const existing = createDisplayObject();
    setNode2DSlotContent(target, existing);
    const reference = createScene2DSlotReference('deferred', target);
    const resources = resolveScene2DResources(createScene2DDocument(createDisplayObject(), [reference]), {
      select: () => false,
    });
    expect(resources.resolved).toEqual([]);
    expect(resources.unresolved).toEqual([]);
    expect(getNode2DSlotContent(target)).toBe(existing);
  });
});
