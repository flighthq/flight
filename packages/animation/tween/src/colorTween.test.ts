import { createColorTween } from './colorTween';
import { createTweenManager } from './tweenManager';
import { updateTweens } from './updateTweens';

describe('createColorTween', () => {
  it('reaches the target color after full duration', () => {
    const manager = createTweenManager();
    const target = { color: 0xff0000 }; // red
    createColorTween(manager, target, 'color', 1000, 0x0000ff); // to blue
    updateTweens(manager, 1000);
    expect(target.color).toBe(0x0000ff);
  });

  it('starts from the current color value', () => {
    const manager = createTweenManager();
    const target = { color: 0x00ff00 }; // green
    createColorTween(manager, target, 'color', 1000, 0xff0000, { ease: (t) => t });
    updateTweens(manager, 1000);
    expect(target.color).toBe(0xff0000);
  });

  it('writes an integer color on each update', () => {
    const manager = createTweenManager();
    const target = { color: 0x000000 };
    createColorTween(manager, target, 'color', 1000, 0xffffff, { ease: (t) => t });
    updateTweens(manager, 500);
    expect(Number.isInteger(target.color)).toBe(true);
  });

  it('interpolates components independently at the midpoint', () => {
    const manager = createTweenManager();
    const target = { color: 0xff0000 }; // red: r=255 g=0 b=0
    createColorTween(manager, target, 'color', 1000, 0x0000ff, { ease: (t) => t }); // blue: r=0 g=0 b=255
    updateTweens(manager, 500);
    // midpoint: r≈128, g=0, b≈128 → 0x800080
    const r = (target.color >> 16) & 0xff;
    const b = target.color & 0xff;
    expect(r).toBeCloseTo(128, 0);
    expect(b).toBeCloseTo(128, 0);
  });

  it('does not affect the target before any update', () => {
    const manager = createTweenManager();
    const target = { color: 0xabcdef };
    createColorTween(manager, target, 'color', 1000, 0x000000);
    expect(target.color).toBe(0xabcdef);
  });
});
