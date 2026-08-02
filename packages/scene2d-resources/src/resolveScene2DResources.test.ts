import { addNodeChild, getNodeParent } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

import { resolveScene2DResources } from './resolveScene2DResources';
import { createScene2DDocument, createScene2DSlotReference } from './scene2DDocument';

describe('resolveScene2DResources', () => {
  it('reconciles application slot content synchronously', () => {
    const root = createDisplayObject();
    const slotTarget = createDisplayObject();
    const slotContent = createDisplayObject();
    const document = createScene2DDocument(root, [createScene2DSlotReference('avatar', slotTarget, 'Game.Avatar')]);

    const resources = resolveScene2DResources(document, {
      resolveSlotContent: (reference) =>
        reference.name === 'avatar' && reference.linkage === 'Game.Avatar' ? slotContent : null,
    });

    expect(resources.resolved.map((entry) => entry.content)).toEqual([slotContent]);
    expect(resources.unresolved).toEqual([]);
    expect(document.slots[0].content).toBe(slotContent);
    expect(getNodeParent(slotContent)).toBe(slotTarget);
  });

  it('clears stale managed content when a selected reference is unresolved', () => {
    const target = createDisplayObject();
    const stale = createDisplayObject();
    const reference = createScene2DSlotReference('missing', target);
    reference.content = stale;
    addNodeChild(target, stale);
    const resources = resolveScene2DResources(createScene2DDocument(createDisplayObject(), [reference]));
    expect(resources.unresolved).toEqual([reference]);
    expect(reference.content).toBeNull();
    expect(getNodeParent(stale)).toBeNull();
  });

  it('leaves references outside the selected working set untouched', () => {
    const target = createDisplayObject();
    const existing = createDisplayObject();
    const reference = createScene2DSlotReference('deferred', target);
    reference.content = existing;
    addNodeChild(target, existing);
    const resources = resolveScene2DResources(createScene2DDocument(createDisplayObject(), [reference]), {
      select: () => false,
    });
    expect(resources.resolved).toEqual([]);
    expect(resources.unresolved).toEqual([]);
    expect(reference.content).toBe(existing);
  });
});
