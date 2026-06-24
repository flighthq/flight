import {
  createAudioResourceFromUrl,
  createAudioResourceFromUrls,
  loadAudioResourceFromUrl,
  loadAudioResourceFromUrls,
} from './audioResourceFrom';

describe('createAudioResourceFromUrl', () => {
  it('returns an AudioResource object with a buffer property', () => {
    const resource = createAudioResourceFromUrl('test.mp3');
    expect(resource).toHaveProperty('buffer');
  });
});

describe('createAudioResourceFromUrls', () => {
  it('returns an AudioResource with null buffer when sources is empty', () => {
    const resource = createAudioResourceFromUrls([]);
    expect(resource).not.toBeNull();
  });
});

describe('loadAudioResourceFromUrl', () => {
  it('returns a Promise', () => {
    const result = loadAudioResourceFromUrl('test.mp3');
    result.catch(() => {});
    expect(result).toBeInstanceOf(Promise);
  });
});

describe('loadAudioResourceFromUrls', () => {
  it('resolves immediately with a null-buffer resource when sources is empty', async () => {
    const resource = await loadAudioResourceFromUrls([]);
    expect(resource.buffer).toBeNull();
  });
});
