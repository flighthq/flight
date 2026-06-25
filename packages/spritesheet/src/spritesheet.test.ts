import { cloneSpritesheet, createSpritesheet, getSpritesheetAnimation } from './spritesheet';
import { createSpritesheetAnimation } from './spritesheetAnimation';
import { createSpritesheetFrame } from './spritesheetFrame';

describe('cloneSpritesheet', () => {
  it('returns a distinct entity with copies of all frames', () => {
    const sheet = createSpritesheet();
    const frame = createSpritesheetFrame({ id: 1, offsetX: 5, offsetY: 10, pivotX: 2, pivotY: 3, rotated: true });
    sheet.frames.push(frame);
    sheet.animations['walk'] = createSpritesheetAnimation();

    const clone = cloneSpritesheet(sheet);

    expect(clone).not.toBe(sheet);
    expect(clone.frames).not.toBe(sheet.frames);
    expect(clone.frames[0]).not.toBe(sheet.frames[0]);
    expect(clone.frames[0].id).toBe(1);
    expect(clone.frames[0].pivotX).toBe(2);
    expect(clone.frames[0].rotated).toBe(true);
    expect(clone.animations['walk']).toBe(sheet.animations['walk']);
    expect(clone.atlas).toBe(sheet.atlas);
  });
});

describe('createSpritesheet', () => {
  it('initializes with null atlas, empty animations and frames', () => {
    const sheet = createSpritesheet();
    expect(sheet.atlas).toBeNull();
    expect(sheet.frames).toHaveLength(0);
    expect(Object.keys(sheet.animations)).toHaveLength(0);
  });

  it('uses provided animations and frames directly', () => {
    const animations = { idle: createSpritesheetAnimation() };
    const frames = [createSpritesheetFrame({ id: 0 })];
    const sheet = createSpritesheet({ animations, frames });
    expect(sheet.animations).toBe(animations);
    expect(sheet.frames).toBe(frames);
  });
});

describe('getSpritesheetAnimation', () => {
  it('returns null when no animations exist', () => {
    const sheet = createSpritesheet();
    expect(getSpritesheetAnimation(sheet, 'walk')).toBeNull();
  });

  it('returns null when label does not match', () => {
    const sheet = createSpritesheet();
    sheet.animations['idle'] = createSpritesheetAnimation();
    expect(getSpritesheetAnimation(sheet, 'walk')).toBeNull();
  });

  it('returns the matching animation by label', () => {
    const sheet = createSpritesheet();
    const walk = createSpritesheetAnimation();
    sheet.animations['idle'] = createSpritesheetAnimation();
    sheet.animations['walk'] = walk;
    expect(getSpritesheetAnimation(sheet, 'walk')).toBe(walk);
  });
});
