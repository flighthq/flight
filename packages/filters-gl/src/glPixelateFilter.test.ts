import { applyPixelateFilterToGl } from './glPixelateFilter';
import { makeFilterState, makeRenderTarget } from './glTestHelper';

describe('applyPixelateFilterToGl', () => {
  it('applies with default block size without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyPixelateFilterToGl(state, makeRenderTarget(), makeRenderTarget(), {})).not.toThrow();
  });

  it('applies with a custom block size without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyPixelateFilterToGl(state, makeRenderTarget(), makeRenderTarget(), { blockSize: 16 }),
    ).not.toThrow();
  });

  it('clamps block size to minimum of 1', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyPixelateFilterToGl(state, makeRenderTarget(), makeRenderTarget(), { blockSize: 0 }),
    ).not.toThrow();
  });
});
