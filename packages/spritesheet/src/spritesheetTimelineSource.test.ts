import { createDisplayContainer, getDisplayObjectRuntime } from '@flighthq/displayobject';
import { createImageResource } from '@flighthq/image';
import { addTextureAtlasRegion, createTextureAtlas } from '@flighthq/textureatlas';
import type { DisplayObject } from '@flighthq/types';

import { createSpritesheet } from './spritesheet';
import { createSpritesheetAnimation } from './spritesheetAnimation';
import { createSpritesheetFrame } from './spritesheetFrame';
import { createSpritesheetTimelineSource } from './spritesheetTimelineSource';

function makeSheet(frameCount: number) {
  const img = document.createElement('img') as HTMLImageElement;
  const source = createImageResource(img);
  source.width = 128;
  source.height = 32;
  const atlas = createTextureAtlas({ image: source });
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
    const target = createDisplayContainer();

    source.constructFrame(target as DisplayObject, 1);
    source.constructFrame(target as DisplayObject, 2);

    const children = getDisplayObjectRuntime(target).children;
    expect(children).not.toBeNull();
    expect(children!.length).toBe(1); // reused across frames, not one-per-frame
  });

  it('does not throw when the spritesheet has no atlas', () => {
    const sheet = createSpritesheet({ atlas: null });
    sheet.frames = [];
    const anim = createSpritesheetAnimation({ frameDuration: 100, frames: [0] });
    const source = createSpritesheetTimelineSource(sheet, anim);

    expect(() => source.constructFrame(createDisplayContainer() as DisplayObject, 1)).not.toThrow();
  });
});
