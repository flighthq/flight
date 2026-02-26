import type { RendererState } from '@flighthq/types';

import { setBackgroundColor } from './color';
import { createRendererState } from './createRendererState';

describe('setBackgroundColor', () => {
  let state: RendererState;

  beforeEach(() => {
    state = createRendererState();
  });

  it('sets 0 (transparent) properly', () => {
    setBackgroundColor(state, 0);
    expect(state.backgroundColor).toBe(0);
    expect(state.backgroundColorRGBA).toStrictEqual([0, 0, 0, 0]);
    expect(state.backgroundColorString).toBe('#00000000');
  });

  it('sets 0xFF000000 properly', () => {
    setBackgroundColor(state, 0xff000000);
    expect(state.backgroundColor).toBe(0xff000000);
    expect(state.backgroundColorRGBA).toStrictEqual([1, 0, 0, 0]);
    expect(state.backgroundColorString).toBe('#FF000000');
  });

  it('sets 0xFF0000FF properly', () => {
    setBackgroundColor(state, 0xff0000ff);
    expect(state.backgroundColor).toBe(0xff0000ff);
    expect(state.backgroundColorRGBA).toStrictEqual([1, 0, 0, 1]);
    expect(state.backgroundColorString).toBe('#FF0000FF');
  });

  it('sets 0x88888888 properly', () => {
    setBackgroundColor(state, 0x88888888);
    expect(state.backgroundColor).toBe(0x88888888);
    expect(state.backgroundColorRGBA).toStrictEqual([0x88 / 255, 0x88 / 255, 0x88 / 255, 0x88 / 255]);
    expect(state.backgroundColorString).toBe('#88888888');
  });

  it('sets 0x12345678 properly', () => {
    setBackgroundColor(state, 0x12345678);
    expect(state.backgroundColor).toBe(0x12345678);
    expect(state.backgroundColorRGBA).toStrictEqual([0x12 / 255, 0x34 / 255, 0x56 / 255, 0x78 / 255]);
    expect(state.backgroundColorString).toBe('#12345678');
  });
});
