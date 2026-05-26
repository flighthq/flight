import { createAudioSource, playAudioSource } from './audioSource';

describe('createAudioSource', () => {
  it('returns a source with null src when called with no arguments', () => {
    const source = createAudioSource();
    expect(source.src).toBeNull();
  });

  it('stores the provided audio element', () => {
    const el = document.createElement('audio');
    const source = createAudioSource(el);
    expect(source.src).toBe(el);
  });
});

describe('playAudioSource', () => {
  it('does not throw when src is null', () => {
    const source = createAudioSource();
    expect(() => playAudioSource(source)).not.toThrow();
  });
});
