import { EntityRuntimeKey } from '@flighthq/types/contract';

import { webHostAudioDevice } from './webAudioDevice';

describe('webHostAudioDevice', () => {
  it('is an Entity', () => {
    expect(EntityRuntimeKey in webHostAudioDevice).toBe(true);
  });

  it('is a stable singleton', () => {
    expect(webHostAudioDevice).toBe(webHostAudioDevice);
  });
});
