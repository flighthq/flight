import { createVideoSource } from './videoSource';

describe('createVideoSource', () => {
  it('returns a source with null element when called with no arguments', () => {
    const source = createVideoSource();
    expect(source.element).toBeNull();
  });

  it('stores the provided video element', () => {
    const element = document.createElement('video');
    const source = createVideoSource(element);
    expect(source.element).toBe(element);
  });
});
