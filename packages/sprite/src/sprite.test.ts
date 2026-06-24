import { createRectangle, createVector2 } from '@flighthq/geometry';
import { connectSignal } from '@flighthq/signals';
import type { Node, Rectangle, Sprite, TextureAtlas, TextureAtlasRegion } from '@flighthq/types';
import { SpriteKind } from '@flighthq/types';

import {
  cloneSprite,
  computeSpriteLocalBoundsRectangle,
  createSprite,
  createSpriteData,
  createSpriteRuntime,
  createSpriteSignals,
  enableSpriteSignals,
  getSpriteOrigin,
  getSpriteRegion,
  getSpriteRuntime,
  getSpriteSignals,
  setSpriteFrame,
  setSpriteFrameRect,
} from './sprite';

describe('cloneSprite', () => {
  it('copies data fields into a new sprite', () => {
    const region: TextureAtlasRegion = {
      id: 4,
      x: 0,
      y: 0,
      width: 16,
      height: 16,
      pivotX: null,
      pivotY: null,
    } as TextureAtlasRegion;
    const atlas: TextureAtlas = { image: null, regions: [region] } as TextureAtlas;
    const rect = createRectangle(1, 2, 3, 4);
    const source = createSprite({ data: { atlas, id: 4, rect } });
    const clone = cloneSprite(source);
    expect(clone).not.toBe(source);
    expect(clone.data.id).toBe(4);
    expect(clone.data.atlas).toBe(atlas);
    expect(clone.data.rect).toBe(rect);
    expect(clone.kind).toBe(SpriteKind);
  });

  it('produces an independent runtime', () => {
    const source = createSprite({ data: { id: 1 } });
    const clone = cloneSprite(source);
    expect(getSpriteRuntime(clone)).not.toBe(getSpriteRuntime(source));
  });
});

describe('computeSpriteLocalBoundsRectangle', () => {
  it('does not modify out when no atlas or rect is set', () => {
    const sprite = createSprite();
    const out = createRectangle(0, 0, 0, 0);
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as Node);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('uses rect dimensions when rect is set', () => {
    const sprite = createSprite({ data: { rect: createRectangle(0, 0, 64, 48) } });
    const out = createRectangle();
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as Node);
    expect(out.width).toBe(64);
    expect(out.height).toBe(48);
  });

  it('prefers rect over atlas when both are set', () => {
    const region: TextureAtlasRegion = {
      id: 1,
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      pivotX: null,
      pivotY: null,
    } as TextureAtlasRegion;
    const atlas: TextureAtlas = { image: null, regions: [region] } as TextureAtlas;
    const sprite = createSprite({ data: { atlas, id: 1, rect: createRectangle(0, 0, 64, 48) } });
    const out = createRectangle();
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as Node);
    expect(out.width).toBe(64);
    expect(out.height).toBe(48);
  });

  it('uses atlas region dimensions when atlas is set', () => {
    const region: TextureAtlasRegion = {
      id: 3,
      x: 10,
      y: 20,
      width: 128,
      height: 96,
      pivotX: null,
      pivotY: null,
    } as TextureAtlasRegion;
    const atlas: TextureAtlas = { image: null, regions: [region] } as TextureAtlas;
    const sprite = createSprite({ data: { atlas, id: 3 } });
    const out = createRectangle();
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as Node);
    expect(out.width).toBe(128);
    expect(out.height).toBe(96);
  });

  it('does not modify out when atlas region id is not found', () => {
    const region: TextureAtlasRegion = {
      id: 5,
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      pivotX: null,
      pivotY: null,
    } as TextureAtlasRegion;
    const atlas: TextureAtlas = { image: null, regions: [region] } as TextureAtlas;
    const sprite = createSprite({ data: { atlas, id: 99 } });
    const out = createRectangle(0, 0, 0, 0);
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as Node);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('offsets out.x/out.y by negative pivot when region has a pivot', () => {
    const region: TextureAtlasRegion = {
      id: 1,
      x: 0,
      y: 0,
      width: 64,
      height: 32,
      pivotX: 16,
      pivotY: 8,
    } as TextureAtlasRegion;
    const atlas: TextureAtlas = { image: null, regions: [region] } as TextureAtlas;
    const sprite = createSprite({ data: { atlas, id: 1 } });
    const out = createRectangle();
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as Node);
    expect(out.x).toBe(-16);
    expect(out.y).toBe(-8);
    expect(out.width).toBe(64);
    expect(out.height).toBe(32);
  });

  it('does not offset when rect is set (rect overrides pivot)', () => {
    const rect = createRectangle(0, 0, 100, 50);
    const sprite = createSprite({ data: { rect } });
    const out = createRectangle(5, 5, 0, 0);
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as Node);
    expect(out.x).toBe(5); // rect path does not write x
    expect(out.y).toBe(5); // rect path does not write y
    expect(out.width).toBe(100);
    expect(out.height).toBe(50);
  });
});

describe('createSprite', () => {
  let sprite: Sprite;

  beforeEach(() => {
    sprite = createSprite();
  });

  it('initializes default values', () => {
    expect(sprite.data.atlas).toBeNull();
    expect(sprite.data.id).toBe(0);
    expect(sprite.data.rect).toBeNull();
    expect(sprite.kind).toBe(SpriteKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        atlas: {} as TextureAtlas,
        id: 1,
        rect: {} as Rectangle,
      },
    };
    const obj = createSprite(base);
    expect(obj.data.atlas).toStrictEqual(base.data.atlas);
    expect(obj.data.id).toStrictEqual(base.data.id);
    expect(obj.data.rect).toStrictEqual(base.data.rect);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createSprite(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createSpriteData', () => {
  it('returns default values', () => {
    const data = createSpriteData();
    expect(data.atlas).toBeNull();
    expect(data.id).toBe(0);
    expect(data.rect).toBeNull();
  });

  it('allows pre-defined values', () => {
    const atlas = {} as TextureAtlas;
    const data = createSpriteData({ atlas, id: 5 });
    expect(data.atlas).toBe(atlas);
    expect(data.id).toBe(5);
  });
});

describe('createSpriteRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createSpriteRuntime();
    expect(runtime).not.toBeNull();
  });

  it('uses computeSpriteLocalBoundsRectangle', () => {
    const runtime = createSpriteRuntime();
    expect(runtime.computeLocalBoundsRectangle).toStrictEqual(computeSpriteLocalBoundsRectangle);
  });
});

describe('createSpriteSignals', () => {
  it('creates a signals group with onFrameChanged', () => {
    const signals = createSpriteSignals();
    let received = -1;
    connectSignal(signals.onFrameChanged, (id) => {
      received = id;
    });
    signals.onFrameChanged.emit(7);
    expect(received).toBe(7);
  });
});

describe('enableSpriteSignals', () => {
  it('creates and attaches signals on first call', () => {
    const sprite = createSprite();
    expect(getSpriteSignals(sprite)).toBeNull();
    const signals = enableSpriteSignals(sprite);
    expect(signals).not.toBeNull();
    expect(getSpriteSignals(sprite)).toBe(signals);
  });

  it('returns the same group on repeated calls', () => {
    const sprite = createSprite();
    expect(enableSpriteSignals(sprite)).toBe(enableSpriteSignals(sprite));
  });

  it('makes setSpriteFrame fire onFrameChanged', () => {
    const sprite = createSprite();
    const signals = enableSpriteSignals(sprite);
    let received = -1;
    connectSignal(signals.onFrameChanged, (id) => {
      received = id;
    });
    setSpriteFrame(sprite, 9);
    expect(received).toBe(9);
  });
});

describe('getSpriteOrigin', () => {
  it('returns (0, 0) when no atlas is set', () => {
    const sprite = createSprite();
    const out = createVector2();
    getSpriteOrigin(out, sprite);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('returns (0, 0) when region has no pivot', () => {
    const region: TextureAtlasRegion = {
      id: 1,
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      pivotX: null,
      pivotY: null,
    } as TextureAtlasRegion;
    const atlas: TextureAtlas = { image: null, regions: [region] } as TextureAtlas;
    const sprite = createSprite({ data: { atlas, id: 1 } });
    const out = createVector2();
    getSpriteOrigin(out, sprite);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('returns negative pivot when region has a pivot', () => {
    const region: TextureAtlasRegion = {
      id: 2,
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      pivotX: 16,
      pivotY: 32,
    } as TextureAtlasRegion;
    const atlas: TextureAtlas = { image: null, regions: [region] } as TextureAtlas;
    const sprite = createSprite({ data: { atlas, id: 2 } });
    const out = createVector2();
    getSpriteOrigin(out, sprite);
    expect(out.x).toBe(-16);
    expect(out.y).toBe(-32);
  });

  it('returns (0, 0) when region id is not found', () => {
    const region: TextureAtlasRegion = {
      id: 1,
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      pivotX: 8,
      pivotY: 8,
    } as TextureAtlasRegion;
    const atlas: TextureAtlas = { image: null, regions: [region] } as TextureAtlas;
    const sprite = createSprite({ data: { atlas, id: 99 } });
    const out = createVector2();
    getSpriteOrigin(out, sprite);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });
});

describe('getSpriteRegion', () => {
  it('returns null when no atlas is set', () => {
    const sprite = createSprite();
    expect(getSpriteRegion(sprite)).toBeNull();
  });

  it('returns the matching region', () => {
    const region: TextureAtlasRegion = {
      id: 3,
      x: 10,
      y: 20,
      width: 32,
      height: 32,
      pivotX: null,
      pivotY: null,
    } as TextureAtlasRegion;
    const atlas: TextureAtlas = { image: null, regions: [region] } as TextureAtlas;
    const sprite = createSprite({ data: { atlas, id: 3 } });
    expect(getSpriteRegion(sprite)).toBe(region);
  });

  it('returns null when no region matches the id', () => {
    const region: TextureAtlasRegion = {
      id: 5,
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      pivotX: null,
      pivotY: null,
    } as TextureAtlasRegion;
    const atlas: TextureAtlas = { image: null, regions: [region] } as TextureAtlas;
    const sprite = createSprite({ data: { atlas, id: 99 } });
    expect(getSpriteRegion(sprite)).toBeNull();
  });
});

describe('getSpriteRuntime', () => {
  it('returns the runtime for a Sprite', () => {
    const sprite = createSprite();
    const runtime = getSpriteRuntime(sprite);
    expect(runtime).not.toBeNull();
  });
});

describe('getSpriteSignals', () => {
  it('returns null before signals are enabled', () => {
    const sprite = createSprite();
    expect(getSpriteSignals(sprite)).toBeNull();
  });

  it('returns the group after enabling', () => {
    const sprite = createSprite();
    const signals = enableSpriteSignals(sprite);
    expect(getSpriteSignals(sprite)).toBe(signals);
  });
});

describe('setSpriteFrame', () => {
  it('sets the region id on the sprite data', () => {
    const sprite = createSprite({ data: { id: 0 } });
    setSpriteFrame(sprite, 5);
    expect(sprite.data.id).toBe(5);
  });

  it('can set id to 0', () => {
    const sprite = createSprite({ data: { id: 7 } });
    setSpriteFrame(sprite, 0);
    expect(sprite.data.id).toBe(0);
  });
});

describe('setSpriteFrameRect', () => {
  it('sets the rect on the sprite data', () => {
    const sprite = createSprite();
    const rect = createRectangle(5, 10, 64, 32);
    setSpriteFrameRect(sprite, rect);
    expect(sprite.data.rect).toBe(rect);
  });

  it('can clear the rect by passing null', () => {
    const sprite = createSprite({ data: { rect: createRectangle(0, 0, 10, 10) } });
    setSpriteFrameRect(sprite, null);
    expect(sprite.data.rect).toBeNull();
  });
});
