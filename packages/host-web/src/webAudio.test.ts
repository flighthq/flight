import { EntityRuntimeKey } from '@flighthq/types/contract';

import { initializeWebAudioBackend, webAudioBackend } from './webAudio';

describe('initializeWebAudioBackend', () => {
  it('is the construction initializer of createWebAudioBackend', () => {
    expect(typeof initializeWebAudioBackend).toBe('function');
  });
});
describe('webAudioBackend', () => {
  it('is an AudioBackend entity', () => {
    expect(Object.hasOwn(webAudioBackend, EntityRuntimeKey)).toBe(true);
    expect(typeof webAudioBackend.canPlayType).toBe('function');
  });
});
