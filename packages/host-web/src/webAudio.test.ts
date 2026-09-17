import { EntityRuntimeKey } from '@flighthq/types/contract';

import { initializeWebAudioBackend, webHostAudio } from './webAudio';

describe('initializeWebAudioBackend', () => {
  it('is the construction initializer of createWebAudioBackend', () => {
    expect(typeof initializeWebAudioBackend).toBe('function');
  });
});
describe('webHostAudio', () => {
  it('is an HostAudioCodecCapability entity', () => {
    expect(Object.hasOwn(webHostAudio, EntityRuntimeKey)).toBe(true);
    expect(typeof webHostAudio.canPlayType).toBe('function');
  });
});
