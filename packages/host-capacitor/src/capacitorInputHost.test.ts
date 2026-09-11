import type { CapacitorApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { capacitorHostInput } from './capacitorInputHost';

function fakeCapacitor(): CapacitorApi {
  return {
    haptics: {},
    keyboard: {
      addListener: async () => ({ async remove() {} }),
    },
  } as unknown as CapacitorApi;
}

describe('capacitorHostInput', () => {
  it('publishes the exact mobile input profile as Entity-backed providers', () => {
    const input = capacitorHostInput(fakeCapacitor());
    expect(Object.keys(input).sort()).toEqual([
      'haptics',
      'softKeyboardAccessoryBar',
      'softKeyboardChange',
      'softKeyboardInfo',
      'softKeyboardResizeModeWrite',
      'softKeyboardScrollAssist',
      'softKeyboardStyle',
      'softKeyboardVisibility',
    ]);
    for (const provider of Object.values(input)) expect(EntityRuntimeKey in provider).toBe(true);
  });
});
