import { EntityRuntimeKey } from '@flighthq/types/contract';

import { webAudioDeviceBackend } from './webAudioDevice';

describe('webAudioDeviceBackend', () => {
  it('is an Entity', () => {
    expect(EntityRuntimeKey in webAudioDeviceBackend).toBe(true);
  });

  it('is a stable singleton', () => {
    expect(webAudioDeviceBackend).toBe(webAudioDeviceBackend);
  });
});
