import { EntityRuntimeKey } from '@flighthq/types/contract';

import { webAudioBackend } from './webAudio';

describe('webAudioBackend', () => {
  it('is an AudioBackend entity', () => {
    expect(Object.hasOwn(webAudioBackend, EntityRuntimeKey)).toBe(true);
    expect(typeof webAudioBackend.canPlayType).toBe('function');
  });
});
