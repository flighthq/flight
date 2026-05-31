import { createAudioSource, playAudioSource } from './audioSource';

describe('createAudioSource', () => {
  it('returns a source with null src when called with no arguments', () => {
    const source = createAudioSource();
    expect(source.src).toBeNull();
  });
});

describe('playAudioSource', () => {
  it('does not throw when src is null', () => {
    const source = createAudioSource();
    expect(() => playAudioSource(source)).not.toThrow();
  });
});
