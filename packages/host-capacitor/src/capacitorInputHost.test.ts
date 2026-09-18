import type { CapacitorApi } from '@flighthq/types/contract';

import { capacitorHostHapticsGroup, capacitorHostSoftKeyboardGroup } from './capacitorInputHost';

function fakeCapacitor(): CapacitorApi {
  return {
    haptics: {},
    keyboard: {
      addListener: async () => ({ async remove() {} }),
    },
  } as unknown as CapacitorApi;
}

describe('capacitorHostHapticsGroup', () => {
  it('publishes the Entity-backed haptics engine slot', () => {
    const haptics = capacitorHostHapticsGroup(fakeCapacitor());
    expect(Object.keys(haptics)).toEqual(['engine']);
  });
});

describe('capacitorHostSoftKeyboardGroup', () => {
  it('publishes the exact mobile soft-keyboard profile as Entity-backed providers', () => {
    const softKeyboard = capacitorHostSoftKeyboardGroup(fakeCapacitor());
    expect(Object.keys(softKeyboard).sort()).toEqual([
      'accessoryBar',
      'change',
      'info',
      'resizeModeWrite',
      'scrollAssist',
      'style',
      'visibility',
    ]);
  });
});
