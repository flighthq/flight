import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas';

import { createSpritesheet } from './spritesheet';
import { createSpritesheetAnimation } from './spritesheetAnimation';
import { createSpritesheetAnimationData, createSpritesheetData, createSpritesheetFrameData } from './spritesheetData';
import { createSpritesheetFrame } from './spritesheetFrame';
import { validateSpritesheet, validateSpritesheetData } from './spritesheetValidation';

function makeAtlas(regionCount: number) {
  const atlas = createTextureAtlas();
  for (let i = 0; i < regionCount; i++) {
    atlas.regions.push(createTextureAtlasRegion({ id: i, name: `frame_${i}`, width: 32, height: 32, x: i * 32, y: 0 }));
  }
  return atlas;
}

describe('validateSpritesheet', () => {
  it('returns null for a valid spritesheet with matching atlas regions', () => {
    const atlas = makeAtlas(3);
    const sheet = createSpritesheet({
      atlas,
      frames: [createSpritesheetFrame({ id: 0 }), createSpritesheetFrame({ id: 1 }), createSpritesheetFrame({ id: 2 })],
      animations: {
        run: createSpritesheetAnimation({ frames: [0, 1, 2] }),
      },
    });
    expect(validateSpritesheet(sheet)).toBeNull();
  });
  it('returns null when atlas is null (no region checks possible)', () => {
    const sheet = createSpritesheet({
      atlas: null,
      frames: [createSpritesheetFrame({ id: 99 })],
      animations: {
        idle: createSpritesheetAnimation({ frames: [0] }),
      },
    });
    expect(validateSpritesheet(sheet)).toBeNull();
  });
  it('reports an error for a frame referencing a missing atlas region', () => {
    const atlas = makeAtlas(2); // regions 0 and 1 only
    const sheet = createSpritesheet({
      atlas,
      frames: [
        createSpritesheetFrame({ id: 0 }),
        createSpritesheetFrame({ id: 5 }), // id 5 does not exist
      ],
      animations: {},
    });
    const diagnostics = validateSpritesheet(sheet);
    expect(diagnostics).not.toBeNull();
    expect(diagnostics!.length).toBe(1);
    expect(diagnostics![0].severity).toBe('error');
    expect(diagnostics![0].frameIndex).toBe(1);
    expect(diagnostics![0].animationName).toBeNull();
  });
  it('reports an error for an animation referencing an out-of-range frame index', () => {
    const atlas = makeAtlas(2);
    const sheet = createSpritesheet({
      atlas,
      frames: [createSpritesheetFrame({ id: 0 }), createSpritesheetFrame({ id: 1 })],
      animations: {
        run: createSpritesheetAnimation({ frames: [0, 1, 5] }), // frame index 5 out of range
      },
    });
    const diagnostics = validateSpritesheet(sheet);
    expect(diagnostics).not.toBeNull();
    const err = diagnostics!.find((d) => d.animationName === 'run' && d.frameIndex === 2);
    expect(err).toBeDefined();
    expect(err!.severity).toBe('error');
  });
  it('reports a warning for an animation with zero frames', () => {
    const atlas = makeAtlas(1);
    const sheet = createSpritesheet({
      atlas,
      frames: [createSpritesheetFrame({ id: 0 })],
      animations: {
        empty: createSpritesheetAnimation({ frames: [] }),
      },
    });
    const diagnostics = validateSpritesheet(sheet);
    expect(diagnostics).not.toBeNull();
    const warn = diagnostics!.find((d) => d.animationName === 'empty');
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warning');
  });
  it('accumulates multiple diagnostics', () => {
    const atlas = makeAtlas(1); // only region 0
    const sheet = createSpritesheet({
      atlas,
      frames: [
        createSpritesheetFrame({ id: 0 }),
        createSpritesheetFrame({ id: 99 }), // missing region
      ],
      animations: {
        bad: createSpritesheetAnimation({ frames: [0, 7] }), // index 7 out of range
      },
    });
    const diagnostics = validateSpritesheet(sheet);
    expect(diagnostics).not.toBeNull();
    expect(diagnostics!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('validateSpritesheetData', () => {
  it('returns null for valid data with matching frame names', () => {
    const data = createSpritesheetData({
      frames: [createSpritesheetFrameData({ name: 'walk_0' }), createSpritesheetFrameData({ name: 'walk_1' })],
      animations: [createSpritesheetAnimationData({ name: 'walk', frameNames: ['walk_0', 'walk_1'] })],
    });
    expect(validateSpritesheetData(data)).toBeNull();
  });
  it('returns null for data with no animations', () => {
    const data = createSpritesheetData({ frames: [createSpritesheetFrameData({ name: 'a' })], animations: [] });
    expect(validateSpritesheetData(data)).toBeNull();
  });
  it('reports an error for an animation referencing a missing frame name', () => {
    const data = createSpritesheetData({
      frames: [createSpritesheetFrameData({ name: 'walk_0' })],
      animations: [
        createSpritesheetAnimationData({ name: 'walk', frameNames: ['walk_0', 'walk_99'] }), // walk_99 missing
      ],
    });
    const diagnostics = validateSpritesheetData(data);
    expect(diagnostics).not.toBeNull();
    const err = diagnostics!.find((d) => d.animationName === 'walk');
    expect(err).toBeDefined();
    expect(err!.severity).toBe('error');
    expect(err!.message).toContain('walk_99');
  });
  it('reports a warning for an animation with empty frameNames', () => {
    const data = createSpritesheetData({
      frames: [createSpritesheetFrameData({ name: 'a' })],
      animations: [createSpritesheetAnimationData({ name: 'run', frameNames: [] })],
    });
    const diagnostics = validateSpritesheetData(data);
    expect(diagnostics).not.toBeNull();
    expect(diagnostics![0].severity).toBe('warning');
    expect(diagnostics![0].animationName).toBe('run');
  });
  it('reports a warning when frameDurations length does not match frameNames length', () => {
    const data = createSpritesheetData({
      frames: [createSpritesheetFrameData({ name: 'a' }), createSpritesheetFrameData({ name: 'b' })],
      animations: [
        createSpritesheetAnimationData({
          name: 'run',
          frameNames: ['a', 'b'],
          frameDurations: [100], // length 1, but 2 frames
        }),
      ],
    });
    const diagnostics = validateSpritesheetData(data);
    expect(diagnostics).not.toBeNull();
    const warn = diagnostics!.find((d) => d.animationName === 'run' && d.frameIndex === null);
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warning');
  });
  it('accumulates multiple diagnostics across animations', () => {
    const data = createSpritesheetData({
      frames: [createSpritesheetFrameData({ name: 'a' })],
      animations: [
        createSpritesheetAnimationData({ name: 'anim1', frameNames: [] }), // empty → warning
        createSpritesheetAnimationData({ name: 'anim2', frameNames: ['missing'] }), // missing → error
      ],
    });
    const diagnostics = validateSpritesheetData(data);
    expect(diagnostics).not.toBeNull();
    expect(diagnostics!.length).toBe(2);
  });
});
