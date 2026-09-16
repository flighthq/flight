import type { HostImageSource, HostVideoCapability } from '@flighthq/types/contract';

import { createWebVideoResourceFromMediaStream } from './webVideoResource';

describe('createWebVideoResourceFromMediaStream', () => {
  it('routes the stream through the provider and returns an owned resource', () => {
    const element = {} as HostImageSource;
    const attachStream = vi.fn(() => element);
    const hostVideo: HostVideoCapability = { attachStream, canPlayType: () => false };
    const stream = {} as MediaStream;

    const resource = createWebVideoResourceFromMediaStream(hostVideo, stream);

    expect(attachStream).toHaveBeenCalledWith(stream);
    expect(resource).toMatchObject({ element, objectUrl: null, ownsElement: true });
  });

  it('returns null when the provider cannot attach streams', () => {
    const hostVideo: HostVideoCapability = { canPlayType: () => false };

    expect(createWebVideoResourceFromMediaStream(hostVideo, {} as MediaStream)).toBeNull();
  });

  it('returns null when the provider cannot create a stream-backed element', () => {
    const hostVideo: HostVideoCapability = { attachStream: () => null, canPlayType: () => false };

    expect(createWebVideoResourceFromMediaStream(hostVideo, {} as MediaStream)).toBeNull();
  });
});
