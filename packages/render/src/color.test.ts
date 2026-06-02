import { rgbaToHexString, setRenderStateBackgroundColor } from './color';
import { createRenderState } from './renderState';

describe('rgbaToHexString', () => {
  it('returns a 6-digit hex string of the lower 24 bits', () => {
    expect(rgbaToHexString(0x00ff0000)).toBe('#ff0000');
    expect(rgbaToHexString(0x0000ff00)).toBe('#00ff00');
    expect(rgbaToHexString(0x000000ff)).toBe('#0000ff');
    expect(rgbaToHexString(0x00000000)).toBe('#000000');
    expect(rgbaToHexString(0x00ffffff)).toBe('#ffffff');
  });
});

describe('setRenderStateBackgroundColor', () => {
  it('sets the background color on the render state', () => {
    const state = createRenderState();
    setRenderStateBackgroundColor(state, 0xff0000ff);
    expect(state.backgroundColor).toBe(0xff0000ff);
  });
});
