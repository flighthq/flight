import { createMovieClip } from '@flighthq/displayobject';
import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { addTextureAtlasRegion, createImageResource, createTextureAtlas } from '@flighthq/resources';
import { createSpritesheet, createSpritesheetAnimation, createSpritesheetFrame } from '@flighthq/spritesheet';

import { attachSpritesheetTimeline } from './spritesheetTimeline';

function makeAtlas(frameCount = 3) {
  const img = document.createElement('img') as HTMLImageElement;
  const source = createImageResource(img);
  source.width = 128;
  source.height = 32;
  const atlas = createTextureAtlas({ image: source });
  for (let i = 0; i < frameCount; i++) {
    addTextureAtlasRegion(atlas, i * 32, 0, 32, 32);
  }
  return atlas;
}

describe('attachSpritesheetTimeline', () => {
  it('attaches a timeline to the movie clip', () => {
    const clip = createMovieClip();
    const atlas = makeAtlas(2);
    const sheet = createSpritesheet({ atlas });
    sheet.frames = [createSpritesheetFrame({ id: 0 }), createSpritesheetFrame({ id: 1 })];
    const anim = createSpritesheetAnimation({ frameDuration: 100, frames: [0, 1], loop: true });

    attachSpritesheetTimeline(clip, sheet, anim);

    expect(clip.data.timeline).not.toBeNull();
  });

  it('adds a bitmap child to the clip', () => {
    const clip = createMovieClip();
    const atlas = makeAtlas(2);
    const sheet = createSpritesheet({ atlas });
    sheet.frames = [createSpritesheetFrame({ id: 0 }), createSpritesheetFrame({ id: 1 })];
    const anim = createSpritesheetAnimation({ frameDuration: 100, frames: [0, 1] });

    attachSpritesheetTimeline(clip, sheet, anim);

    const runtime = getDisplayObjectRuntime(clip);
    expect(runtime.children).not.toBeNull();
    expect(runtime.children!.length).toBeGreaterThan(0);
  });

  it('sets frameRate based on frameDuration', () => {
    const clip = createMovieClip();
    const atlas = makeAtlas(1);
    const sheet = createSpritesheet({ atlas });
    sheet.frames = [createSpritesheetFrame({ id: 0 })];
    const anim = createSpritesheetAnimation({ frameDuration: 200, frames: [0] });

    attachSpritesheetTimeline(clip, sheet, anim);

    const timeline = clip.data.timeline!;
    expect(timeline.frameRate).toBeCloseTo(1000 / 200);
  });

  it('sets totalFrames from animation frames length', () => {
    const clip = createMovieClip();
    const atlas = makeAtlas(3);
    const sheet = createSpritesheet({ atlas });
    sheet.frames = [
      createSpritesheetFrame({ id: 0 }),
      createSpritesheetFrame({ id: 1 }),
      createSpritesheetFrame({ id: 2 }),
    ];
    const anim = createSpritesheetAnimation({ frameDuration: 100, frames: [0, 1, 2] });

    attachSpritesheetTimeline(clip, sheet, anim);

    expect(clip.data.timeline!.totalFrames).toBe(3);
  });

  it('does not throw when atlas is null on the spritesheet', () => {
    const clip = createMovieClip();
    const sheet = createSpritesheet({ atlas: null });
    sheet.frames = [];
    const anim = createSpritesheetAnimation({ frameDuration: 100, frames: [0] });

    expect(() => attachSpritesheetTimeline(clip, sheet, anim)).not.toThrow();
  });
});
