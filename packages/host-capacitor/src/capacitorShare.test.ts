import type { CapacitorApi, ShareContentBackend } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createCapacitorShareContentBackend } from './capacitorShare';

function fakeCapacitor(shareImpl?: () => Promise<{ activityType?: string }>) {
  const shared: Array<{ dialogTitle?: string; title?: string; text?: string; url?: string }> = [];
  const capacitor = {
    share: {
      async share(options: { dialogTitle?: string; title?: string; text?: string; url?: string }) {
        shared.push(options);
        return shareImpl ? await shareImpl() : { activityType: 'com.apple.UIKit.activity.Mail' };
      },
    },
  } as unknown as CapacitorApi;
  return { capacitor, shared };
}

describe('createCapacitorShareContentBackend', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createCapacitorShareContentBackend(fakeCapacitor().capacitor)).toBe(true);
  });

  it('validates meaningful payloads synchronously without an availability cache', () => {
    const backend = createCapacitorShareContentBackend(fakeCapacitor().capacitor);
    expect(backend.canShareContent({ text: 'ready now' })).toBe(true);
    expect(backend.canShareContent({ text: '' })).toBe(false);
  });

  it('shares title, text, and URL content', async () => {
    const { capacitor, shared } = fakeCapacitor();
    const backend = createCapacitorShareContentBackend(capacitor);
    expect(await backend.shareContent({ title: 'T', url: 'https://flight.dev' })).toBe(true);
    expect(shared[0]).toMatchObject({ title: 'T', url: 'https://flight.dev' });
  });

  it('keeps chooserTitle on only the concrete Capacitor provider type', async () => {
    const { capacitor, shared } = fakeCapacitor();
    const backend = createCapacitorShareContentBackend(capacitor);
    expect(await backend.shareContent({ text: 'x' }, { chooserTitle: 'Choose an app' })).toBe(true);
    expect(shared[0]?.dialogTitle).toBe('Choose an app');
    const portable: ShareContentBackend = backend;
    // @ts-expect-error the portable content slot has no Capacitor chooser parameter
    expect(await portable.shareContent({ text: 'x' }, { chooserTitle: 'Choose an app' })).toBe(true);
  });

  it('maps a completed share to a detailed result with the activity type', async () => {
    const backend = createCapacitorShareContentBackend(fakeCapacitor().capacitor);
    expect(await backend.shareContentWithResult({ text: 'x' })).toEqual({
      activityType: 'com.apple.UIKit.activity.Mail',
      completed: true,
      dismissed: false,
    });
  });

  it('reports rejected commands as platform outcomes', async () => {
    const backend = createCapacitorShareContentBackend(
      fakeCapacitor(async () => {
        throw new Error('cancelled');
      }).capacitor,
    );
    expect(await backend.shareContent({ text: 'x' })).toBe(false);
    expect(await backend.shareContentWithResult({ text: 'x' })).toEqual({
      activityType: null,
      completed: false,
      dismissed: true,
    });
  });
});
