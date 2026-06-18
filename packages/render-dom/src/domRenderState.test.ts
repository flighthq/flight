import { createDOMRenderState } from './domRenderState';

describe('createDOMRenderState', () => {
  it('returns a state with the provided element', () => {
    const div = document.createElement('div');
    const state = createDOMRenderState(div);
    expect(state.element).toBe(div);
  });

  it('sets position:relative and overflow:hidden on the element', () => {
    const div = document.createElement('div');
    createDOMRenderState(div);
    expect(div.style.position).toBe('relative');
    expect(div.style.overflow).toBe('hidden');
  });

  it('defaults roundPixels to false', () => {
    const div = document.createElement('div');
    const state = createDOMRenderState(div);
    expect(state.roundPixels).toBe(false);
  });

  it('sets roundPixels from options', () => {
    const div = document.createElement('div');
    const state = createDOMRenderState(div, { roundPixels: true });
    expect(state.roundPixels).toBe(true);
  });

  it('defaults currentBlendMode to null', () => {
    const div = document.createElement('div');
    const state = createDOMRenderState(div);
    expect(state.currentBlendMode).toBeNull();
  });

  it('defaults backgroundColor to 0', () => {
    const div = document.createElement('div');
    const state = createDOMRenderState(div);
    expect(state.backgroundColor).toBe(0);
  });

  it('sets backgroundColor from options', () => {
    const div = document.createElement('div');
    const state = createDOMRenderState(div, { backgroundColor: 0xff0000ff });
    expect(state.backgroundColor).toBe(0xff0000ff);
  });

  it('sets pixelRatio from options', () => {
    const div = document.createElement('div');
    const state = createDOMRenderState(div, { pixelRatio: 3 });
    expect(state.pixelRatio).toBe(3);
  });

  it('defaults pixelRatio to 1', () => {
    const div = document.createElement('div');
    const state = createDOMRenderState(div);
    expect(state.pixelRatio).toBe(1);
  });
});
