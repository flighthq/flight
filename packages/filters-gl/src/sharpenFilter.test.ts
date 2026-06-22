import { applySharpenFilterToGl } from './sharpenFilter';
import { makeFilterState, makeRenderTarget, makeScratch } from './testHelper';

describe('applySharpenFilterToGl', () => {
  it('applies with default options without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applySharpenFilterToGl(state, makeRenderTarget(), makeRenderTarget(), makeScratch(2), {}),
    ).not.toThrow();
  });

  it('applies with custom amount and blur without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applySharpenFilterToGl(state, makeRenderTarget(), makeRenderTarget(), makeScratch(2), {
        amount: 2,
        blurX: 2,
        blurY: 2,
      }),
    ).not.toThrow();
  });
});
