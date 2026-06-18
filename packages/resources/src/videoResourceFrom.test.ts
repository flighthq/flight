import {
  createVideoResourceFromURL,
  createVideoResourceFromURLs,
  loadVideoResourceFromURL,
  loadVideoResourceFromURLs,
} from './videoResourceFrom';

describe('createVideoResourceFromURL', () => {
  it('returns a VideoResource with a non-null element', () => {
    const resource = createVideoResourceFromURL('test.mp4');
    expect(resource.element).not.toBeNull();
  });
});

describe('createVideoResourceFromURLs', () => {
  it('returns a VideoResource with null element when sources is empty', () => {
    const resource = createVideoResourceFromURLs([]);
    expect(resource.element).toBeNull();
  });
});

describe('loadVideoResourceFromURL', () => {
  it('returns a Promise', () => {
    const result = loadVideoResourceFromURL('test.mp4');
    result.catch(() => {});
    expect(result).toBeInstanceOf(Promise);
  });
});

describe('loadVideoResourceFromURLs', () => {
  it('resolves immediately with a null-element resource when sources is empty', async () => {
    const resource = await loadVideoResourceFromURLs([]);
    expect(resource.element).toBeNull();
  });
});
