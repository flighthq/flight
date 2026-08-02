import { addNodeChild, getNodeChildAt, getNodeParent } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

import { createScene2DSlotReference } from './scene2DDocument';
import { setScene2DSlotReferenceContent } from './scene2DSlotReference';

describe('setScene2DSlotReferenceContent', () => {
  it('keeps child order stable when a resolve pass retains the same content', () => {
    const target = createDisplayObject();
    const content = createDisplayObject();
    const overlay = createDisplayObject();
    const reference = createScene2DSlotReference('slot', target);
    setScene2DSlotReferenceContent(reference, content);
    addNodeChild(target, overlay);

    setScene2DSlotReferenceContent(reference, content);

    expect(getNodeChildAt(target, 0)).toBe(content);
    expect(getNodeChildAt(target, 1)).toBe(overlay);
  });

  it('replaces only the content retained by the manifest reference', () => {
    const target = createDisplayObject();
    const authored = createDisplayObject();
    const first = createDisplayObject();
    const second = createDisplayObject();
    addNodeChild(target, authored);
    const reference = createScene2DSlotReference('slot', target);

    setScene2DSlotReferenceContent(reference, first);
    setScene2DSlotReferenceContent(reference, second);

    expect(reference.content).toBe(second);
    expect(getNodeParent(authored)).toBe(target);
    expect(getNodeParent(first)).toBeNull();
    expect(getNodeParent(second)).toBe(target);
  });
});
