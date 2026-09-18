import type { CapacitorApi, HostShareContentCapability } from '@flighthq/types/contract';

import { capacitorHostShare, capacitorHostShareContent } from './capacitorShare';

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

describe('capacitorHostShare', () => {
  it('publishes only the content slot', () => {
    const share = capacitorHostShare(fakeCapacitor().capacitor);
    expect(Object.keys(share)).toEqual(['content']);
  });
});
