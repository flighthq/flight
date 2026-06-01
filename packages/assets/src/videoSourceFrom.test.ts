import {
  createVideoSourceFromURL,
  createVideoSourceFromURLs,
  loadVideoSourceFromURL,
  loadVideoSourceFromURLs,
} from './videoSourceFrom';

describe('createVideoSourceFromURL', () => {
  it('returns a VideoSource with a non-null element', () => {
    const source = createVideoSourceFromURL('test.mp4');
    expect(source.element).not.toBeNull();
  });
});

describe('createVideoSourceFromURLs', () => {
  it('returns a VideoSource with null element when sources is empty', () => {
    const source = createVideoSourceFromURLs([]);
    expect(source.element).toBeNull();
  });
});

describe('loadVideoSourceFromURL', () => {
  it('returns a Promise', () => {
    const result = loadVideoSourceFromURL('test.mp4');
    result.catch(() => {});
    expect(result).toBeInstanceOf(Promise);
  });
});

describe('loadVideoSourceFromURLs', () => {
  it('resolves immediately with a null-element source when sources is empty', async () => {
    const source = await loadVideoSourceFromURLs([]);
    expect(source.element).toBeNull();
  });
});
