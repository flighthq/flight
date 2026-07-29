import { createDisplayObject } from '@flighthq/scene2d/contract';
import { Scene2DContentReferenceKind } from '@flighthq/types/contract';

import { createScene2DAssetReference, createScene2DDocument, createScene2DSlotReference } from './scene2DDocument';

describe('createScene2DAssetReference', () => {
  it('creates an enumerable named asset target', () => {
    const target = createDisplayObject();
    const reference = createScene2DAssetReference('heroImage', 'hero.png', target);
    expect(reference).toEqual({
      content: null,
      kind: Scene2DContentReferenceKind.Asset,
      name: 'heroImage',
      required: true,
      target,
      uri: 'hero.png',
    });
    expect(target.name).toBe('heroImage');
  });
});

describe('createScene2DDocument', () => {
  it('retains the unattached root and an independent manifest', () => {
    const root = createDisplayObject();
    const references = [createScene2DAssetReference('bg', 'bg.png', createDisplayObject())];
    expect(createScene2DDocument(root, references, 'acme')).toEqual({
      references,
      root,
      sourceKind: 'acme',
    });
  });
});

describe('createScene2DSlotReference', () => {
  it('retains instance and linkage identity in the manifest', () => {
    const target = createDisplayObject();
    const reference = createScene2DSlotReference('avatarSlot', target, 'Game.Avatar', false);
    expect(reference.content).toBeNull();
    expect(reference.kind).toBe(Scene2DContentReferenceKind.Slot);
    expect(reference.linkage).toBe('Game.Avatar');
    expect(reference.required).toBe(false);
    expect(target.name).toBe('avatarSlot');
  });
});
