import { createEmbeddedAudioResourceReference } from '@flighthq/audio/contract';
import { createEmbeddedImageResourceReference } from '@flighthq/image/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

import { createScene2DDocument, createScene2DSlotReference } from './scene2DDocument';

describe('createScene2DDocument', () => {
  it('retains the unattached root and all three enumerable contracts', () => {
    const root = createDisplayObject();
    const slots = [createScene2DSlotReference('bg', createDisplayObject())];
    const imageResources = [createEmbeddedImageResourceReference(new Uint8Array([1]), 'image/png')];
    const audioResources = [createEmbeddedAudioResourceReference(new Uint8Array([2]), 'audio/mpeg')];
    expect(createScene2DDocument(root, slots, 'acme', null, imageResources, audioResources)).toMatchObject({
      audioResources,
      backgroundColor: null,
      imageResources,
      root,
      slots,
      sourceKind: 'acme',
    });
  });

  it('defaults all three contracts to empty for a document that carries none', () => {
    const document = createScene2DDocument(createDisplayObject());
    expect(document.slots).toEqual([]);
    expect(document.imageResources).toEqual([]);
    expect(document.audioResources).toEqual([]);
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
