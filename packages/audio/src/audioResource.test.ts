import { createAudioResource } from './audioResource';

describe('createAudioResource', () => {
  it('returns a resource with null buffer when called with no arguments', () => {
    const resource = createAudioResource();
    expect(resource.buffer).toBeNull();
  });
});
