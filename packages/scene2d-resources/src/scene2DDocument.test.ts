import { createEmbeddedImageResourceReference } from '@flighthq/image/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

import { createScene2DDocument, createScene2DSlotReference } from './scene2DDocument';

describe('createScene2DDocument', () => {
  it('retains the unattached root and both enumerable contracts', () => {
    const root = createDisplayObject();
    const slots = [createScene2DSlotReference('bg', createDisplayObject())];
    const imageResources = [createEmbeddedImageResourceReference(new Uint8Array([1]), 'image/png')];
    expect(createScene2DDocument(root, slots, 'acme', null, imageResources)).toEqual({
      backgroundColor: null,
      imageResources,
      root,
      slots,
      sourceKind: 'acme',
    });
  });

  it('defaults both contracts to empty for a document that carries neither', () => {
    const document = createScene2DDocument(createDisplayObject());
    expect(document.slots).toEqual([]);
    expect(document.imageResources).toEqual([]);
  });
});

describe('createScene2DSlotReference', () => {
  it('retains instance and linkage identity in the manifest', () => {
    const target = createDisplayObject();
    const reference = createScene2DSlotReference('avatarSlot', target, 'Game.Avatar', false);
    expect(reference.content).toBeNull();
    expect(reference.linkage).toBe('Game.Avatar');
    expect(reference.required).toBe(false);
    expect(target.name).toBe('avatarSlot');
  });
});
