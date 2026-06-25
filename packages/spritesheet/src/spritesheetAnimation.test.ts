import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas';

import { createSpritesheet } from './spritesheet';
import { createSpritesheetAnimation, createSpritesheetAnimationFromFrameNames } from './spritesheetAnimation';
import { createSpritesheetFrame } from './spritesheetFrame';

describe('createSpritesheetAnimation', () => {
  it('defaults direction to forward and frameDurations to null', () => {
    const anim = createSpritesheetAnimation();

    expect(anim.direction).toBe('forward');
    expect(anim.frameDurations).toBeNull();
  });

  it('initializes default values', () => {
    const anim = createSpritesheetAnimation();

    expect(anim.frameDuration).toBe(0);
    expect(anim.frames).toEqual([]);
    expect(anim.loop).toBe(false);
    expect(anim.originX).toBe(0);
    expect(anim.originY).toBe(0);
  });

  it('applies partial overrides', () => {
    const anim = createSpritesheetAnimation({ frameDuration: 100, loop: true, frames: [0, 1, 2] });

    expect(anim.frameDuration).toBe(100);
    expect(anim.loop).toBe(true);
    expect(anim.frames).toEqual([0, 1, 2]);
    expect(anim.originX).toBe(0);
    expect(anim.originY).toBe(0);
  });

  it('uses a provided frames array directly', () => {
    const frames = [0, 1, 2];
    const anim = createSpritesheetAnimation({ frames });
    expect(anim.frames).toBe(frames);
  });

  it('applies originX and originY overrides', () => {
    const anim = createSpritesheetAnimation({ originX: 16, originY: 32 });

    expect(anim.originX).toBe(16);
    expect(anim.originY).toBe(32);
  });

  it('returns a new object for each call', () => {
    const a = createSpritesheetAnimation();
    const b = createSpritesheetAnimation();

    expect(a).not.toBe(b);
  });

  it('does not share frames array reference across instances', () => {
    const a = createSpritesheetAnimation();
    const b = createSpritesheetAnimation();
    a.frames.push(99);

    expect(b.frames).toEqual([]);
  });
});

describe('createSpritesheetAnimationFromFrameNames', () => {
  function makeSheet() {
    const atlas = createTextureAtlas();
    atlas.regions.push(
      createTextureAtlasRegion({ id: 0, name: 'walk_0', x: 0, y: 0, width: 32, height: 32 }),
      createTextureAtlasRegion({ id: 1, name: 'walk_1', x: 32, y: 0, width: 32, height: 32 }),
      createTextureAtlasRegion({ id: 2, name: 'run_0', x: 64, y: 0, width: 32, height: 32 }),
      createTextureAtlasRegion({ id: 3, name: null, x: 96, y: 0, width: 32, height: 32 }),
    );
    const sheet = createSpritesheet({ atlas });
    for (let i = 0; i < 4; i++) {
      sheet.frames.push(createSpritesheetFrame({ id: i }));
    }
    return sheet;
  }

  it('applies options to the returned animation', () => {
    const sheet = makeSheet();
    const anim = createSpritesheetAnimationFromFrameNames(sheet, 'walk_', {
      direction: 'pingpong',
      frameDuration: 80,
      loop: true,
    });
    expect(anim!.direction).toBe('pingpong');
    expect(anim!.frameDuration).toBe(80);
    expect(anim!.loop).toBe(true);
  });

  it('returns null when no frames match the pattern', () => {
    const sheet = makeSheet();
    expect(createSpritesheetAnimationFromFrameNames(sheet, 'jump_')).toBeNull();
  });

  it('returns null when spritesheet has no atlas', () => {
    const sheet = createSpritesheet();
    expect(createSpritesheetAnimationFromFrameNames(sheet, 'walk_')).toBeNull();
  });

  it('selects frames matching a RegExp pattern', () => {
    const sheet = makeSheet();
    const anim = createSpritesheetAnimationFromFrameNames(sheet, /^walk_/);
    expect(anim).not.toBeNull();
    expect(anim!.frames).toEqual([0, 1]);
  });

  it('selects frames matching a string prefix', () => {
    const sheet = makeSheet();
    const anim = createSpritesheetAnimationFromFrameNames(sheet, 'walk_');
    expect(anim).not.toBeNull();
    expect(anim!.frames).toEqual([0, 1]);
  });

  it('selects frames matching an exact name', () => {
    const sheet = makeSheet();
    const anim = createSpritesheetAnimationFromFrameNames(sheet, 'run_0');
    expect(anim).not.toBeNull();
    expect(anim!.frames).toEqual([2]);
  });

  it('skips frames whose atlas region has a null name', () => {
    const sheet = makeSheet();
    const anim = createSpritesheetAnimationFromFrameNames(sheet, /./);
    expect(anim!.frames).toEqual([0, 1, 2]);
  });
});
