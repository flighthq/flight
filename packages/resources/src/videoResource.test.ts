import { createVideoResource } from './videoResource';

describe('createVideoResource', () => {
  it('returns a resource with null element when called with no arguments', () => {
    const resource = createVideoResource();
    expect(resource.element).toBeNull();
  });

  it('stores the provided video element', () => {
    const element = document.createElement('video');
    const resource = createVideoResource(element);
    expect(resource.element).toBe(element);
  });
});
