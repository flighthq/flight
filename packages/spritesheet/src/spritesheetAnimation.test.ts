import { createSpritesheetAnimation } from './spritesheetAnimation';

describe('createSpritesheetAnimation', () => {
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
