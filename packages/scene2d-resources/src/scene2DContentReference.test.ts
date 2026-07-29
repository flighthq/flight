import { addNodeChild, getNodeParent } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

import { setScene2DContentReferenceContent } from './scene2DContentReference';
import { createScene2DSlotReference } from './scene2DDocument';

describe('setScene2DContentReferenceContent', () => {
  it('replaces only the content retained by the manifest reference', () => {
    const target = createDisplayObject();
    const authored = createDisplayObject();
    const first = createDisplayObject();
    const second = createDisplayObject();
    addNodeChild(target, authored);
    const reference = createScene2DSlotReference('slot', target);

    setScene2DContentReferenceContent(reference, first);
    setScene2DContentReferenceContent(reference, second);

    expect(reference.content).toBe(second);
    expect(getNodeParent(authored)).toBe(target);
    expect(getNodeParent(first)).toBeNull();
    expect(getNodeParent(second)).toBe(target);
  });
});
