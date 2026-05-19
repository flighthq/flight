import { createSpritesheet, getSpritesheetAnimation } from './spritesheet';
import { createSpritesheetAnimation } from './spritesheetAnimation';

describe('createSpritesheet', () => {
  it('initializes with null atlas, empty animations and frames', () => {
    const sheet = createSpritesheet();
    expect(sheet.atlas).toBeNull();
    expect(sheet.frames).toHaveLength(0);
    expect(Object.keys(sheet.animations)).toHaveLength(0);
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
