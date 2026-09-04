import { createImageResource } from '@flighthq/image/contract';
import { createDisplayObject, getNode2DRuntime } from '@flighthq/scene2d/contract';
import { createSpritesheet, createSpritesheetAnimation, createSpritesheetFrame } from '@flighthq/spritesheet/contract';
import {
  addTextureAtlasRegion,
  createTextureAtlasFromImageResource,
  getTextureAtlasRegionTexture,
} from '@flighthq/textureatlas/contract';
import type { Node2D, Sprite, SpritesheetAnimationDirection, Texture } from '@flighthq/types/contract';

import {
  createSpritesheetTimelineSource,
  explainSpritesheetTimelineSource,
  initializeSpritesheetTimelineSource,
  setSpritesheetTimelineSourceGuard,
} from './spritesheetTimelineSource';

function makeSheet(frameCount: number) {
  const img = document.createElement('img') as HTMLImageElement;
  const source = createImageResource(img);
  source.width = 128;
  source.height = 32;
  const atlas = createTextureAtlasFromImageResource(source);
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    addTextureAtlasRegion(atlas, i * 32, 0, 32, 32);
    frames.push(createSpritesheetFrame({ id: i }));
  }
  const sheet = createSpritesheet({ atlas });
  sheet.frames = frames;
  return sheet;
}

describe('createSpritesheetTimelineSource', () => {
  it('reports totalFrames from the animation and frameRate from frameDuration', () => {
    const sheet = makeSheet(3);
    const anim = createSpritesheetAnimation({ frameDuration: 200, frames: [0, 1, 2] });

    const source = createSpritesheetTimelineSource(sheet, anim);

    expect(source.totalFrames).toBe(3);
    expect(source.frameRate).toBeCloseTo(1000 / 200);
  });

  it('lazily creates one bitmap child on the target and shows the frame region', () => {
    const sheet = makeSheet(2);
    const anim = createSpritesheetAnimation({ frameDuration: 100, frames: [0, 1] });
    const source = createSpritesheetTimelineSource(sheet, anim);
    const target = createDisplayObject();

    source.constructFrame(target as Node2D, 1);
    source.constructFrame(target as Node2D, 2);

    const children = getNode2DRuntime(target).children;
    expect(children).not.toBeNull();
    expect(children!.length).toBe(1); // reused across frames, not one-per-frame
  });

  it('does not throw when the spritesheet has no atlas', () => {
    const sheet = createSpritesheet({ atlas: null });
    sheet.frames = [];
    const anim = createSpritesheetAnimation({ frameDuration: 100, frames: [0] });
    const source = createSpritesheetTimelineSource(sheet, anim);

    expect(() => source.constructFrame(createDisplayObject() as Node2D, 1)).not.toThrow();
  });

  it.each<{
    direction: SpritesheetAnimationDirection;
    expected: readonly number[];
  }>([
    { direction: 'forward', expected: [0, 1, 2] },
    { direction: 'reverse', expected: [2, 1, 0] },
    { direction: 'pingpong', expected: [0, 1, 2, 1] },
    { direction: 'pingpong_reverse', expected: [2, 1, 0, 1] },
  ])('materializes $direction as an exact forward TimelineSource sequence', ({ direction, expected }) => {
    const sheet = makeSheet(3);
    const anim = createSpritesheetAnimation({ direction, frameDuration: 100, frames: [0, 1, 2] });
    const source = createSpritesheetTimelineSource(sheet, anim);
    const target = createDisplayObject();
    const actual: (Texture | null)[] = [];

    for (let frame = 1; frame <= source.totalFrames; frame++) {
      source.constructFrame(target as Node2D, frame);
      const bitmap = getNode2DRuntime(target).children![0] as Sprite;
      actual.push(bitmap.data.texture);
    }

    expect(source.totalFrames).toBe(expected.length);
    expect(actual).toEqual(expected.map((index) => getTextureAtlasRegionTexture(sheet.atlas!, index)));
  });
});

describe('explainSpritesheetTimelineSource', () => {
  it('reports only fields the source cannot carry, not the materialized direction', () => {
    const uniform = createSpritesheetAnimation({ direction: 'pingpong', frames: [0, 1, 2], repeatCount: 3 });
    const variable = createSpritesheetAnimation({
      direction: 'pingpong_reverse',
      frameDurations: [50, 100, 200],
      frames: [0, 1, 2],
      repeatCount: -1,
    });

    expect(explainSpritesheetTimelineSource(uniform)).toEqual({
      directionMaterialized: true,
      unsupportedFields: ['repeatCount'],
    });
    expect(explainSpritesheetTimelineSource(variable)).toEqual({
      directionMaterialized: true,
      unsupportedFields: ['frameDurations', 'repeatCount'],
    });
  });
});

describe('initializeSpritesheetTimelineSource', () => {
  it('is the construction initializer of createSpritesheetTimelineSource', () => {
    expect(typeof initializeSpritesheetTimelineSource).toBe('function');
  });
});
describe('setSpritesheetTimelineSourceGuard', () => {
  it('receives the authored animation and its loss explanation only while installed', () => {
    const sheet = makeSheet(1);
    const anim = createSpritesheetAnimation({ frames: [0], repeatCount: 2 });
    const seen: unknown[] = [];

    setSpritesheetTimelineSourceGuard((animation, explanation) => seen.push(animation, explanation));
    try {
      createSpritesheetTimelineSource(sheet, anim);
    } finally {
      setSpritesheetTimelineSourceGuard(null);
    }
    createSpritesheetTimelineSource(sheet, anim);

    expect(seen).toEqual([anim, { directionMaterialized: true, unsupportedFields: ['repeatCount'] }]);
  });
});
