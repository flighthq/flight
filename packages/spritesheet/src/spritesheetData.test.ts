import { createSpritesheetAnimationData, createSpritesheetData, createSpritesheetFrameData } from './spritesheetData';

describe('createSpritesheetAnimationData', () => {
  it('creates with all defaults when no argument is passed', () => {
    const anim = createSpritesheetAnimationData();
    expect(anim.direction).toBe('forward');
    expect(anim.frameDuration).toBe(100);
    expect(anim.frameDurations).toBeNull();
    expect(anim.frameNames).toEqual([]);
    expect(anim.loop).toBe(true);
    expect(anim.name).toBe('');
    expect(anim.originX).toBe(0);
    expect(anim.originY).toBe(0);
  });

  it('applies provided partial fields', () => {
    const anim = createSpritesheetAnimationData({
      direction: 'pingpong',
      frameDuration: 80,
      frameNames: ['a', 'b', 'c'],
      loop: false,
      name: 'walk',
      originX: 0.5,
      originY: 1,
    });
    expect(anim.direction).toBe('pingpong');
    expect(anim.frameDuration).toBe(80);
    expect(anim.frameNames).toEqual(['a', 'b', 'c']);
    expect(anim.loop).toBe(false);
    expect(anim.name).toBe('walk');
    expect(anim.originX).toBe(0.5);
    expect(anim.originY).toBe(1);
  });

  it('stores per-frame durations when provided', () => {
    const anim = createSpritesheetAnimationData({
      frameDurations: [100, 200, 150],
      frameNames: ['a', 'b', 'c'],
    });
    expect(anim.frameDurations).toEqual([100, 200, 150]);
  });

  it('accepts all direction values', () => {
    expect(createSpritesheetAnimationData({ direction: 'forward' }).direction).toBe('forward');
    expect(createSpritesheetAnimationData({ direction: 'reverse' }).direction).toBe('reverse');
    expect(createSpritesheetAnimationData({ direction: 'pingpong' }).direction).toBe('pingpong');
    expect(createSpritesheetAnimationData({ direction: 'pingpong_reverse' }).direction).toBe('pingpong_reverse');
  });

  it('does not share the frameNames array between instances', () => {
    const a = createSpritesheetAnimationData();
    const b = createSpritesheetAnimationData();
    a.frameNames.push('x');
    expect(b.frameNames).toHaveLength(0);
  });
});

describe('createSpritesheetData', () => {
  it('creates with all defaults when no argument is passed', () => {
    const data = createSpritesheetData();
    expect(data.animations).toEqual([]);
    expect(data.frames).toEqual([]);
    expect(data.imageFile).toBe('');
    expect(data.imageHeight).toBe(0);
    expect(data.imageWidth).toBe(0);
    expect(data.scale).toBe(1);
  });

  it('applies provided partial fields', () => {
    const data = createSpritesheetData({
      imageFile: 'atlas.png',
      imageHeight: 512,
      imageWidth: 256,
      scale: 2,
    });
    expect(data.imageFile).toBe('atlas.png');
    expect(data.imageHeight).toBe(512);
    expect(data.imageWidth).toBe(256);
    expect(data.scale).toBe(2);
  });

  it('stores frames and animations when provided', () => {
    const frame = createSpritesheetFrameData({ name: 'hero' });
    const anim = createSpritesheetAnimationData({ name: 'run' });
    const data = createSpritesheetData({ animations: [anim], frames: [frame] });
    expect(data.frames).toHaveLength(1);
    expect(data.animations).toHaveLength(1);
  });

  it('does not share arrays between instances', () => {
    const a = createSpritesheetData();
    const b = createSpritesheetData();
    a.frames.push(createSpritesheetFrameData());
    expect(b.frames).toHaveLength(0);
  });
});

describe('createSpritesheetFrameData', () => {
  it('creates with all defaults when no argument is passed', () => {
    const frame = createSpritesheetFrameData();
    expect(frame.height).toBe(0);
    expect(frame.name).toBe('');
    expect(frame.offsetX).toBe(0);
    expect(frame.offsetY).toBe(0);
    expect(frame.pivotX).toBeNull();
    expect(frame.pivotY).toBeNull();
    expect(frame.rotated).toBe(false);
    expect(frame.sourceHeight).toBe(0);
    expect(frame.sourceWidth).toBe(0);
    expect(frame.width).toBe(0);
    expect(frame.x).toBe(0);
    expect(frame.y).toBe(0);
  });

  it('applies all provided fields', () => {
    const frame = createSpritesheetFrameData({
      height: 64,
      name: 'hero_idle',
      offsetX: 2,
      offsetY: 4,
      pivotX: 0.5,
      pivotY: 1,
      rotated: true,
      sourceHeight: 72,
      sourceWidth: 68,
      width: 60,
      x: 128,
      y: 64,
    });
    expect(frame.height).toBe(64);
    expect(frame.name).toBe('hero_idle');
    expect(frame.offsetX).toBe(2);
    expect(frame.offsetY).toBe(4);
    expect(frame.pivotX).toBe(0.5);
    expect(frame.pivotY).toBe(1);
    expect(frame.rotated).toBe(true);
    expect(frame.sourceHeight).toBe(72);
    expect(frame.sourceWidth).toBe(68);
    expect(frame.width).toBe(60);
    expect(frame.x).toBe(128);
    expect(frame.y).toBe(64);
  });

  it('accepts null pivots explicitly', () => {
    const frame = createSpritesheetFrameData({ pivotX: null, pivotY: null });
    expect(frame.pivotX).toBeNull();
    expect(frame.pivotY).toBeNull();
  });
});
