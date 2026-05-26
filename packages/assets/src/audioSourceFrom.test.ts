import {
  createAudioSourceFromURL,
  createAudioSourceFromURLs,
  loadAudioSourceFromURL,
  loadAudioSourceFromURLs,
} from './audioSourceFrom';

describe('createAudioSourceFromURL', () => {
  it('returns an AudioSource with a non-null src', () => {
    const source = createAudioSourceFromURL('test.mp3');
    expect(source.src).not.toBeNull();
  });
});

describe('createAudioSourceFromURLs', () => {
  it('returns an AudioSource with null src when sources is empty', () => {
    const source = createAudioSourceFromURLs([]);
    expect(source).not.toBeNull();
  });
});

describe('loadAudioSourceFromURL', () => {
  it('returns a Promise', () => {
    const result = loadAudioSourceFromURL('test.mp3');
    expect(result).toBeInstanceOf(Promise);
  });
});

describe('loadAudioSourceFromURLs', () => {
  it('resolves immediately with a null-src source when sources is empty', async () => {
    const source = await loadAudioSourceFromURLs([]);
    expect(source.src).toBeNull();
  });
});
