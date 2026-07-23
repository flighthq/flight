import type { CapacitorApi } from '@flighthq/types';

import { createCapacitorShareBackend } from './capacitorShare';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function fakeCapacitor(canShare = true, shareImpl?: () => Promise<{ activityType?: string }>) {
  const shared: Array<{ title?: string; text?: string; url?: string }> = [];
  const capacitor = {
    share: {
      async canShare() {
        return { value: canShare };
      },
      async share(options: { title?: string; text?: string; url?: string }) {
        shared.push(options);
        return shareImpl ? await shareImpl() : { activityType: 'com.apple.UIKit.activity.Mail' };
      },
    },
  } as unknown as CapacitorApi;
  return { capacitor, shared };
}

describe('createCapacitorShareBackend', () => {
  it('reports availability from the prefetch cache once it resolves', async () => {
    const backend = createCapacitorShareBackend(fakeCapacitor(true).capacitor);
    // Reads false until the construction-time canShare prefetch settles.
    expect(backend.isAvailable()).toBe(false);
    await flush();
    expect(backend.isAvailable()).toBe(true);
    expect(backend.canShare({ text: 'x' })).toBe(true);
  });

  it('shares title/text/url content', async () => {
    const { capacitor, shared } = fakeCapacitor();
    const backend = createCapacitorShareBackend(capacitor);
    expect(await backend.share({ title: 'T', url: 'https://flight.dev' })).toBe(true);
    expect(shared[0]).toMatchObject({ title: 'T', url: 'https://flight.dev' });
  });

  it('maps a completed share to a ShareResult with the activity type', async () => {
    const backend = createCapacitorShareBackend(fakeCapacitor().capacitor);
    expect(await backend.shareWithResult({ text: 'x' })).toEqual({
      completed: true,
      activityType: 'com.apple.UIKit.activity.Mail',
      dismissed: false,
    });
  });

  it('reports a dismissed ShareResult when the user cancels', async () => {
    const backend = createCapacitorShareBackend(
      fakeCapacitor(true, async () => {
        throw new Error('cancelled');
      }).capacitor,
    );
    expect(await backend.shareWithResult({ text: 'x' })).toEqual({
      completed: false,
      activityType: null,
      dismissed: true,
    });
  });

  it('refuses content with no shareable text', async () => {
    const backend = createCapacitorShareBackend(fakeCapacitor().capacitor);
    expect(await backend.share({})).toBe(false);
  });
});
