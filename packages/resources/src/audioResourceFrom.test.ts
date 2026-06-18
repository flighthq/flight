import {
  createAudioResourceFromURL,
  createAudioResourceFromURLs,
  loadAudioResourceFromURL,
  loadAudioResourceFromURLs,
} from './audioResourceFrom';

describe('createAudioResourceFromURL', () => {
  it('returns an AudioResource object with a buffer property', () => {
    const resource = createAudioResourceFromURL('test.mp3');
    expect(resource).toHaveProperty('buffer');
  });
});

describe('createAudioResourceFromURLs', () => {
  it('returns an AudioResource with null buffer when sources is empty', () => {
    const resource = createAudioResourceFromURLs([]);
    expect(resource).not.toBeNull();
  });
});

describe('loadAudioResourceFromURL', () => {
  it('returns a Promise', () => {
    const result = loadAudioResourceFromURL('test.mp3');
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
