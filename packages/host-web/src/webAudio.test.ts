import { initializeWebAudioBackend, webHostAudio } from './webAudio';

describe('initializeWebAudioBackend', () => {
  it('is the construction initializer of createWebAudioBackend', () => {
    expect(typeof initializeWebAudioBackend).toBe('function');
  });
});
describe('webHostAudio', () => {
  it('is a HostAudioCodecCapability', () => {
    expect(typeof webHostAudio.canPlayType).toBe('function');
  });
});
