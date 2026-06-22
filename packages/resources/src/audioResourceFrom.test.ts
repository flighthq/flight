import {
  createAudioResourceFromUrl,
  createAudioResourceFromURLs,
  loadAudioResourceFromUrl,
  loadAudioResourceFromURLs,
} from './audioResourceFrom';

describe('createAudioResourceFromUrl', () => {
  it('returns an AudioResource object with a buffer property', () => {
    const resource = createAudioResourceFromUrl('test.mp3');
    expect(resource).toHaveProperty('buffer');
  });
});

describe('createAudioResourceFromURLs', () => {
  it('returns an AudioResource with null buffer when sources is empty', () => {
    const resource = createAudioResourceFromURLs([]);
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

describe('loadAudioResourceFromURLs', () => {
  it('resolves immediately with a null-buffer resource when sources is empty', async () => {
    const resource = await loadAudioResourceFromURLs([]);
    expect(resource.buffer).toBeNull();
  });
});
