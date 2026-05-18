import { createSpritesheetFrame } from './spritesheetFrame';

describe('createSpritesheetFrame', () => {
  it('initializes default values', () => {
    const frame = createSpritesheetFrame();

    expect(frame.id).toBe(0);
    expect(frame.offsetX).toBe(0);
    expect(frame.offsetY).toBe(0);
  });

  it('applies partial overrides', () => {
    const frame = createSpritesheetFrame({ id: 5, offsetX: 10, offsetY: 20 });

    expect(frame.id).toBe(5);
    expect(frame.offsetX).toBe(10);
    expect(frame.offsetY).toBe(20);
  });

  it('applies partial override for id only', () => {
    const frame = createSpritesheetFrame({ id: 3 });

    expect(frame.id).toBe(3);
    expect(frame.offsetX).toBe(0);
    expect(frame.offsetY).toBe(0);
  });

  it('returns a new object for each call', () => {
    const a = createSpritesheetFrame();
    const b = createSpritesheetFrame();

    expect(a).not.toBe(b);
  });
});
